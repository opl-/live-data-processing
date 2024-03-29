export {Data, getGlobalAuthor, NewData, setGlobalAuthor} from './Ingester';
export {Pipe} from './Pipe';
export {Sink} from './Sink';
export {Tap, TapOptions} from './Tap';

export {AmqpSink, AmqpSinkOpts} from './sink/AmqpSink';
export {FileSink, FileSinkOpts} from './sink/FileSink';
export {PostgresSink, PostgresSinkOpts} from './sink/PostgresSink';

export {AmqpTap, AmqpTapOpts} from './tap/AmqpTap';
export {WebSocketTap, WebSocketTapOpts} from './tap/WebSocketTap';
