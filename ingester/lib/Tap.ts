import {Data, getGlobalAuthor, NewData} from './Ingester'
import {Sink} from './Sink';
import {isStateful} from './Stateful';


export interface TapOptions {
	/**
	 * Author name override for data generated by this tap.
	 */
	author?: string;

	/**
	 * Defines the source name of data generated by this tap.
	 */
	name: string;
}

/**
 * Data producer.
 */
export abstract class Tap {
	authorName: string;
	sourceName: string;

	/**
	 * Sinks connected to (receiving data from) this tap.
	 */
	sinks: Sink[] = [];

	constructor(opts: TapOptions) {
		if (typeof(opts.name) !== 'string') throw new Error('name is required');

		this.authorName = opts.author ?? getGlobalAuthor();
		this.sourceName = opts.name;
	}

	/**
	 * Broadcast data as this tap, using default values for missing properties in provided data.
	 */
	give(newData: NewData): void {
		const data: Data = {
			author: newData.author ?? this.authorName,
			source: newData.source ?? this.sourceName,
			timestamp: newData.timestamp ?? Date.now(),
			content: newData.content,
		};

		this.giveExact(data);
	}

	/**
	 * Broadcast data as this tap, using exactly the given data object.
	 */
	giveExact(data: Data): void {
		this.sinks.forEach((sink) => {
			sink.take(data);
		});
	}

	/**
	 * Make a sink receive data from this tap.
	 *
	 * Does nothing if the sink is already connected to this tap.
	 */
	connectSink(sink: Sink): this {
		if (isStateful(sink) && !sink.isEnabled) {
			console.warn(`Requested tap ${this.sourceName} to forward data to a disabled stateful sink.`);
		}

		if (this.sinks.includes(sink)) return this;

		this.sinks.push(sink);

		return this;
	}

	/**
	 * Stop sink receiving data from this tap.
	 *
	 * Does nothing if the sink is not connected to this tap.
	 */
	disconnectSink(sink: Sink): this {
		const index = this.sinks.indexOf(sink);
		if (index === -1) return this;

		this.sinks.splice(index, 1);

		return this;
	}
}
