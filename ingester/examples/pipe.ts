import {FileSink, Pipe, PostgresSink, WebSocketTap} from '../lib';

function getUrl(): Promise<string> {
	if (Math.random() < 0.8) return Promise.reject('Fail');

	return Promise.resolve('wss://localhost:8080/weather-updates');
}

const pipe = new Pipe();

const wsTap = new WebSocketTap({
	name: 'weather',
	url: getUrl,
	pingKeepAlive: 10000,
	silenceKill: 15000,
});

wsTap.connectSink(pipe);

wsTap.enable();

(async () => {
	const fileSink = new FileSink({
		path: './data/data-$t.txt',
	});
	await fileSink.enable();
	pipe.connectSink(fileSink);

	// pipe.connectSink(new PostgresSink());
})();
