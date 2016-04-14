const {ipcRenderer: ipc} = global.require('electron');
import {addTweetToTimeline} from './actions';
import Store from './store';
import log from './log';

interface Listeners {
    [c: string]: Electron.IpcRendererEventListener;
}

export default class IpcChannelProxy {
    private listeners: Listeners;

    constructor() {
        this.listeners = {};
    }

    subscribe(c: Channel, cb: Electron.IpcRendererEventListener) {
        log.debug('Received channel ' + c);
        ipc.on(c, cb);
        this.listeners[c] = cb;
    }

    start() {
        this.subscribe('yf:tweet', (_: Electron.IpcRendererEvent, tweet: TweetStatus) => {
            Store.dispatch(addTweetToTimeline(tweet));
        });
        log.debug('Started to receive messages');
        return this;
    }

    terminate() {
        for (const c in this.listeners) {
            ipc.removeListener(c, this.listeners[c]);
        }
        this.listeners = {};
        log.debug('Terminated receivers');
    }
}
