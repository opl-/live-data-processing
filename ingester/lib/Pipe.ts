import {Data} from './Ingester';
import {Sink} from './Sink';
import {Tap} from './Tap';

/**
 * Simple sink and tap combo that forwards all of its data without ever altering it.
 *
 * Useful for connecting multiple taps to the same set of sinks.
 */
export class Pipe extends Tap implements Sink {
	constructor() {
		super({
			name: 'pipe',
		});
	}

	give(): void {
		throw new Error('Tried to give data to a pipe. Did you mean to use giveExact?');
	}

	take(data: Data): void {
		this.giveExact(data);
	}
}
