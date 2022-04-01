import fs from 'fs';
import path from 'path';

import {Data} from '../Ingester';
import {Sink} from '../Sink';
import {Stateful} from '../Stateful';

export interface FileSinkOpts {
	/**
	 * Path of the file to write. If the path includes `$t`, it will be replaced with a timestamp representing time of creation.
	 *
	 * If relative, the file is created relative to the working directory.
	 */
	path: string;

	/**
	 * Format used to write the data to the file.
	 *
	 * - `string` assumes the input to be a UTF8 string and encodes the data as a JSON encoded string.
	 * - `binary` encodes the data as a base64 blob (default).
	 */
	mode?: 'string' | 'binary';
}

/**
 * Sink that saves all incoming data into a file on disk.
 */
export class FileSink implements Sink, Stateful {
	private opts: FileSinkOpts;

	output: fs.WriteStream | null = null;

	constructor(opts: FileSinkOpts) {
		if (typeof(opts.path) !== 'string') throw new Error('path is required');

		this.opts = opts;
	}

	get isEnabled(): boolean {
		return this.output !== null;
	}

	async enable() {
		this.newFile();
	}

	async disable() {
		this.closeFile();
	}

	newFile() {
		this.closeFile();

		const filePath = this.opts.path.replace('$t', `${Date.now()}`);

		// Ensure the path exists
		fs.mkdirSync(path.dirname(filePath), {
			recursive: true,
		});

		this.output = fs.createWriteStream(filePath, {
			flags: 'a',
		});
	}

	closeFile() {
		if (this.output === null) return;

		this.output.close();
		this.output = null;
	}

	take(data: Data): void {
		if (this.output === null) throw new Error('No output stream!');

		const blob = this.opts.mode === 'string' ? JSON.stringify(data.content.toString('utf8')) : data.content.toString('base64');

		this.output.write(`${data.timestamp},${JSON.stringify(data.source)},${JSON.stringify(data.author)},${blob}\n`);
	}
}
