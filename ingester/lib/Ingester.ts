import os from 'os';

let globalAuthor = typeof(process.env.INGESTER_AUTHOR) === 'string' ? process.env.INGESTER_AUTHOR : (os.hostname() || 'localhost');

/**
 * Change the author name for all taps created after this call.
 */
export function setGlobalAuthor(authorName: string) {
	globalAuthor = authorName;
}

/**
 * Returns the current author name for data created by this program. This value must be cached on tap or sink instantiation.
 */
export function getGlobalAuthor(): string {
	return globalAuthor;
}

/**
 * Represents received and validated data.
 */
export interface Data extends NewData {
	author: string;

	source: string;

	timestamp: number;
}

/**
 * Represents newly created data, possibly with uninitialized properties.
 */
export interface NewData {
	/**
	 * Describes who created this piece of data.
	 *
	 * Taps receiving data from untrusted remote instances should validate this value.
	 */
	author?: string;

	/**
	 * Describes what system or tap this data came from.
	 * 
	 * Useful to differentiate between multiple instances of taps.
	 */
	source?: string;

	/**
	 * Creation time for this data in milliseconds since the UNIX epoch.
	 * 
	 * Defaults to now.
	 */
	timestamp?: number;

	/**
	 * The actual data.
	 */
	content: Buffer;
}
