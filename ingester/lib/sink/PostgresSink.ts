import {Pool, PoolConfig} from 'pg';

import {Data} from '../Ingester';
import {Sink} from '../Sink';
import {Stateful} from '../Stateful';

export interface PostgresSinkOpts {
	poolConfig?: PoolConfig;
}

/**
 * FIXME: unimplemented
 */
export class PostgresSink implements Sink, Stateful {
	private opts: PostgresSinkOpts;

	pool: Pool | null = null;

	private valueQueue: Data[] = [];

	constructor(opts: PostgresSinkOpts) {
		this.opts = opts;
	}

	get isEnabled(): boolean {
		return this.pool !== null;
	}

	async enable() {
		this.connect();
	}

	async disable() {
		await this.flush();

		if (this.pool) {
			await this.pool.end();
			this.pool = null;
		}
	}

	connect() {
		this.pool = new Pool(this.opts.poolConfig);
	}

	disconnect() {
		return 
	}

	async flush() {
		// No values to flush
		if (this.valueQueue.length === 0) return;

		if (!this.pool) throw new Error('Database not connected');

		// TODO
		//await this.pool.query(`INSERT INTO "Raw" ("source", "id", "timestamp", "data") VALUES ${}`);
	}

	take(data: Data): void {
		this.valueQueue.push(data);
		// TODO: dump data into table
		throw new Error('Method not implemented.');
	}
}
