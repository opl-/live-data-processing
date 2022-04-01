import amqp from 'amqplib';

import {Data, NewData} from '../Ingester';
import {Stateful} from '../Stateful';
import {Tap, TapOptions} from '../Tap';

export interface AmqpTapOpts extends TapOptions {
	hostname?: string;

	port?: number;

	username?: string;

	password?: string;

	frameMax?: number;

	heartbeat?: number;

	vhost?: string;

	/**
	 * Called during enable to create the exchange, queue, and its binds. The returned queue name will be consumed from and broadcast by this tap.
	 */
	createQueue: (channel: amqp.Channel) => Promise<string>;

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

	private queueName: string;

	constructor(opts: AmqpTapOpts) {
		super(opts);

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

		this.queueName = await this.opts.createQueue(channel);

		await channel.consume(this.queueName, async (msg) => {
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
