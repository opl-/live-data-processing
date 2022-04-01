import crypto from 'crypto';
import WebSocket from 'ws';

import {Stateful} from '../Stateful';
import {Tap, TapOptions} from '../Tap';
import {wait} from '../util/wait';

// TODO: these option names are awful, lmao
export interface WebSocketTapOpts extends TapOptions {
	/**
	 * URL of a WebSocket to connect to, or a function returning a Promise resolving to one.
	 *
	 * The function will be repeatedly called until it returns a valid URL. The delay between each invokation starts at 50ms and gets doubled on every failure until 10 seconds is reached.
	 */
	url: string | (() => Promise<string>);
	
	/**
	 * If set to a number, sends a WebSocket ping frame every `pingKeepAlive` milliseconds to ensure the connection wasn't broken.
	 *
	 * Due to the check for a pong response being done right before a ping send, it will take between `pingKeepAlive` and `pingKeepAlive * 2` milliseconds before a dead websocket is detected using this method.
	 *
	 * `10000` by default.
	 */
	pingKeepAlive?: false | number;

	/**
	 * If set to a number, reconnects the WebSocket after `silenceKill` milliseconds of no incoming data messages.
	 *
	 * `false` by default.
	 */
	silenceKill?: false | number;
}

export class WebSocketTap extends Tap implements Stateful {
	private opts: WebSocketTapOpts;

	/** The active websocket connection used by this tap, if any. */
	socket: WebSocket | null = null;

	private pingKeepAliveTimeout: NodeJS.Timeout | null = null;
	private pingData: Buffer | null = null;

	private lastMessage: number;
	private silenceInterval: NodeJS.Timer | null = null;

	constructor(opts: WebSocketTapOpts) {
		if (opts.url === undefined) throw new Error('url is required');

		if (opts.pingKeepAlive === undefined) {
			opts.pingKeepAlive = 10000;
		} else if (opts.pingKeepAlive !== false && (typeof(opts.pingKeepAlive) !== 'number' || opts.pingKeepAlive <= 0)) {
			throw new Error('pingKeepAlive must be false or a number greater than 0');
		}

		if (opts.silenceKill !== false && opts.silenceKill !== undefined && (typeof(opts.silenceKill) !== 'number' || opts.silenceKill <= 0)) {
			throw new Error('silenceKill must be false or a number greater than 0');
		}

		super(opts);

		this.opts = opts;
	}

	get isEnabled(): boolean {
		return this.socket instanceof WebSocket && ([WebSocket.CONNECTING, WebSocket.OPEN] as number[]).includes(this.socket.readyState);
	}

	async enable(): Promise<void> {
		return this.connect();
	}

	async disable(): Promise<void> {
		this.disconnect();
	}

	async resolveURL(): Promise<string> {
		if (typeof(this.opts.url) === 'string') return this.opts.url;

		let delay = 50;

		while (true) {
			try {
				console.log('resolving websocket url');
				const url = await this.opts.url();

				console.log('resolved websocket url to', url);
				return url;
			} catch (ex) {
				console.log('failed to resolve websocket url, waiting');
				// Fetching URL using a function failed, retry later.
				await wait(delay);
				delay = Math.min(10000, delay * 2);
			}
		}
	}

	async connect(): Promise<void> {
		this.disconnect();

		const url = await this.resolveURL();

		this.socket = new WebSocket(url);

		this.socket.onopen = this.onOpen.bind(this);
		this.socket.onclose = this.onClose.bind(this);
		this.socket.onmessage = this.onMessage.bind(this);
		this.socket.onerror = this.onError.bind(this);
		this.socket.on('pong', this.onPong.bind(this));
	}

	disconnect(): void {
		if (this.socket) {
			if (this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN) {
				console.log(`WebSocket closing connection to ${this.socket.url}`);
				this.socket.close();
			}

			this.socket = null;
		}

		if (this.pingKeepAliveTimeout !== null) {
			clearTimeout(this.pingKeepAliveTimeout);
			this.pingKeepAliveTimeout = null;
		}

		this.pingData = null;

		if (this.silenceInterval !== null) {
			clearInterval(this.silenceInterval);
			this.silenceInterval = null;
		}
	}

	onOpen(event: WebSocket.OpenEvent) {
		console.log(`WebSocket connected to ${event.target.url}`);

		this.lastMessage = Date.now();

		this.doKeepAlivePing();

		if (this.opts.silenceKill) {
			this.silenceInterval = setInterval(this.checkSilence.bind(this), this.opts.silenceKill);
		}
	}

	onClose(event: WebSocket.CloseEvent) {
		console.log(`WebSocket disconnected from ${event.target.url}`, event.target === this.socket, this.socket !== null);

		// Ignore events for socket close events we already handled
		if (event.target !== this.socket) return;

		// Reset state
		this.disconnect();

		setTimeout(() => this.connect(), 500);
	}

	onError(event: WebSocket.ErrorEvent) {
		console.warn('WebSocket error', event);
	}

	onMessage(event: WebSocket.MessageEvent) {
		const now = Date.now();
		this.lastMessage = now;

		let buf: Buffer | null = null;

		// Overly specific considering I don't even know under what circumstances it'd return anything other than string/Buffer, but I'd rather be safe
		if (typeof(event.data) === 'string') {
			buf = Buffer.from(event.data);
		} else if (event.data instanceof Buffer) {
			buf = event.data;
		} else if (Array.isArray(event.data)) {
			buf = Buffer.concat(event.data);
		} else if (event.data instanceof ArrayBuffer) {
			buf = Buffer.from(event.data);
		}

		if (buf === null) return void console.warn(`WebSocket received data it could not handle!`);

		this.give({
			source: this.sourceName,
			author: this.authorName,
			timestamp: now,
			content: buf,
		});
	}

	onPong(data: Buffer): void {
		// Ignore pongs when we didn't trigger one
		if (!this.pingData) return;

		if (this.pingData.compare(data) !== 0) {
			console.warn('WebSocket received invalid pong response, ignoring');
			return;
		} else {
			this.pingData = null;
		}
	}

	/**
	 * If pingKeepAlive is enabled and socket is connected, sends a new ping packet or forces a reconnect if the previous ping did not receive a pong.
	 *
	 * Additionally, this method automatically queues the next invokation of itself.
	 */
	doKeepAlivePing(): void {
		if (!this.socket || !this.opts.pingKeepAlive) return;

		if (this.pingData) {
			console.log('WebSocket reconnect due to missing ping response');
			this.connect();
			return;
		}

		this.pingData = crypto.randomBytes(8);

		this.socket.ping(this.pingData, undefined, (err) => {
			// Reconnect on error
			if (err) {
				console.log('WebSocket reconnect due to error on ping send');
				this.connect();
			}
		});

		this.pingKeepAliveTimeout = setTimeout(() => this.doKeepAlivePing(), this.opts.pingKeepAlive);
	}

	checkSilence(): void {
		if (Date.now() - this.lastMessage > this.opts.silenceKill!) {
			console.log(`WebSocket reconnect due to silence longer than ${this.opts.silenceKill}ms`);
			this.connect();
		}
	}
}
