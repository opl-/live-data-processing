import amqp from 'amqplib';

import {Data} from '../Ingester';
import {Sink} from '../Sink';
import {Stateful} from '../Stateful';

export interface AmqpSinkOpts {
	hostname?: string;

	port?: number;

	username?: string;

	password?: string;

	frameMax?: number;

	heartbeat?: number;

	vhost?: string;

	exchange: string;

	/**
	 * Prefix which will be added to the beginning of the routing key (constructed from the data source). The library does not automatically add a dot at the end.
	 * 
	 * Defaults to nothing, meaning the routing key will match the data source name exactly.
	 */
	routingKeyPrefix?: string;
}

/**
 * Sink that pushes all incoming data to an AMQP server.
 */
export class AmqpSink implements Sink, Stateful {
	private opts: AmqpSinkOpts;

	private connection: amqp.Connection | null = null;
	private channel: amqp.Channel | null = null;

	private routingKeyPrefix: string;

	constructor(opts: AmqpSinkOpts) {
		if (typeof(opts.exchange) !== 'string') throw new Error('exchange is required');

		this.opts = opts;

		this.routingKeyPrefix = opts.routingKeyPrefix ?? '';
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

		this.channel = await this.connection.createChannel();

		await this.channel.assertExchange(this.opts.exchange, 'topic', {
			durable: true,
			autoDelete: false,
		});
	}

	async disable() {
		await this.connection?.close();

		this.connection = null;
		this.channel = null;
	}

	take(data: Data): void {
		if (this.channel === null) throw new Error('No AMQP channel!');

		this.channel.publish(this.opts.exchange, this.routingKeyPrefix + data.source, data.content, {
			timestamp: data.timestamp,
			persistent: true,
			headers: {
				source: data.source,
				author: data.author,
			},
		});
	}
}
