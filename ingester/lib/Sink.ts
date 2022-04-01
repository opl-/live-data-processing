import {Data} from './Ingester';

/**
 * Data consumer.
 */
export interface Sink {
	take(data: Data): void;
}
