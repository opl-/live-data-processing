import amqp from 'amqplib';

import {Data} from '../Ingester';
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
			expires: 24 * 60 * 60000,
		});

		await Promise.all(this.opts.queueBinds.map(async (bind) => {
			await channel.bindQueue(this.opts.queueName, bind.exchange ?? this.opts.exchange, bind.pattern);
		}));

		await channel.consume(this.opts.queueName, (msg) => {
			if (!msg) return;

			console.log(JSON.stringify(msg));

			this.giveExact({
				author: (msg.properties.headers.author as string | undefined) ?? this.authorName,
				source: (msg.properties.headers.source as string | undefined) ?? this.sourceName,
				content: msg.content,
				timestamp: msg.properties.timestamp,
			});

			channel.ack(msg);
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