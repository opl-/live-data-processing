import amqp from 'amqplib';

import {Data, NewData} from '../Ingester';
import {Stateful} from '../Stateful';
import {Tap, TapOptions} from '../Tap';

export interface QueueBind {
	/**
	 * Exchange from which the messages will come. Defaults to the value of `opts.exchange`.
	 */
	exchange?: string;

	pattern: string;
}

export interface AmqpTapOpts extends TapOptions {
	hostname?: string;

	port?: number;

	username?: string;

	password?: string;

	frameMax?: number;

	heartbeat?: number;

	vhost?: string;

	/**
	 * Exchange which will be automatically asserted.
	 */
	exchange: string;

	/**
	 * Name of the queue. Used to create a durable queue which will survive restarts.
	 */
	queueName: string;

	/**
	 * Array of exchanges and patterns to bind the queue to.
	 *
	 * All messages received in this queue will be broadcast by this tap.
	 */
	queueBinds: QueueBind[];

	/**
	 * If provided, the incoming data will be passed through this function.
	 *
	 * If `null` is returned, the data will be acknowledged. If the promise is rejected, the data won't be acknowledged and should get requeued.
	 */
	transform?: (data: Data) => Promise<NewData | null>;
}

/**
 * Tap that sources data from an AMQP server.
 */
export class AmqpTap extends Tap implements Stateful {
	private opts: AmqpTapOpts;

	private connection: amqp.Connection | null = null;
	private channel: amqp.Channel | null = null;

	constructor(opts: AmqpTapOpts) {
		super(opts);

		if (typeof(opts.exchange) !== 'string') throw new Error('exchange is required');
		if (typeof(opts.queueName) !== 'string') throw new Error('queueName is required');
		if (!Array.isArray(opts.queueBinds)) throw new Error('queueBinds is required');

		this.opts = opts;
	}

	get isEnabled(): boolean {
		return this.connection !== null;
	}

	async enable() {
		this.connection = await amqp.connect({
			hostname: this.opts.hostname,
			port: this.opts.port,
			username: this.opts.username,
			password: this.opts.password,
			frameMax: this.opts.frameMax,
			heartbeat: this.opts.heartbeat,
			vhost: this.opts.vhost,
		});

		const channel = this.channel = await this.connection.createChannel();

		await channel.assertExchange(this.opts.exchange, 'topic', {
			durable: true,
			autoDelete: false,
		});

		await channel.assertQueue(this.opts.queueName, {
			durable: true,
		});

		await Promise.all(this.opts.queueBinds.map(async (bind) => {
			await channel.bindQueue(this.opts.queueName, bind.exchange ?? this.opts.exchange, bind.pattern);
		}));

		// Limit to processing one message at a time
		await channel.prefetch(1);

		await channel.consume(this.opts.queueName, async (msg) => {
			if (!msg) return;

			const data: Data = {
				author: (msg.properties.headers.author as string | undefined) ?? this.authorName,
				source: (msg.properties.headers.source as string | undefined) ?? this.sourceName,
				content: msg.content,
				timestamp: msg.properties.timestamp,
			};

			if (this.opts.transform) {
				try {
					const newData = await this.opts.transform(data);

					// null means ignore message
					if (newData !== null) {
						this.give(newData);
					}

					channel.ack(msg);
				} catch (ex) {
					console.error('AmqpTap transform error:', ex);
					channel.nack(msg);
				}
			} else {
				this.giveExact(data);

				channel.ack(msg);
			}
		}, {
			noAck: false,
		});
	}

	async disable() {
		await this.connection?.close();

		this.connection = null;
		this.channel = null;
	}
}
