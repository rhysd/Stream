const {ipcRenderer: ipc} = global.require('electron');
import {
    addTweetToTimeline,
    addMentions,
    addRejectedUserIds,
    removeRejectedUserIds,
    addSeparator,
    retweetSucceeded,
    unretweetSucceeded,
    showMessage,
    likeSucceeded,
    unlikeSucceeded,
    statusLiked,
    setCurrentUser,
    updateCurrentUser,
    deleteStatusInTimeline,
} from './actions';
import Store from './store';
import log from './log';
import Tweet, {TwitterUser} from './item/tweet';
import DB from './database/db';
import {Twitter} from 'twit';

interface Listeners {
    [c: string]: Electron.IpcRendererEventListener;
}

export default class IpcChannelProxy {
    private listeners: Listeners;

    constructor() {
        this.listeners = {};
    }

    subscribe(c: ChannelFromMain, cb: Electron.IpcRendererEventListener) {
        ipc.on(c, cb);
        this.listeners[c] = cb;
    }

    start() {
        this.subscribe('yf:tweet', (_: Electron.IpcRendererEvent, json: Twitter.Status) => {
            log.debug('Received channel yf:tweet', json);
            const tw = new Tweet(json);
            Store.dispatch(addTweetToTimeline(tw));
            DB.accounts.storeAccountsInTweet(json);
            DB.hashtags.storeHashtagsInTweet(json);
        });

        this.subscribe('yf:connection-failure', (_: Electron.IpcRendererEvent) => {
            log.debug('Received channel yf:connection-failure');
            Store.dispatch(addSeparator());
        });

        this.subscribe('yf:api-failure', (_: Electron.IpcRendererEvent, msg: string) => {
            log.debug('Received channel yf:api-failure');
            Store.dispatch(showMessage('API error: ' + msg, 'error'));
        });

        this.subscribe('yf:retweet-success', (_: Electron.IpcRendererEvent, json: Twitter.Status) => {
            log.debug('Received channel yf:retweet-success', json.id_str);
            if (!json.retweeted_status) {
                log.error('yf:retweet-success: Received status is not an retweet status: ', json);
                return;
            }
            if (!json.retweeted_status.retweeted) {
                log.error('yf:retweet-success: Retweeted tweet is NOT marked as "retweeted"', json);
                json.retweeted_status.retweeted = true;
                json.retweeted_status.retweet_count += 1;
            }
            Store.dispatch(retweetSucceeded(new Tweet(json)));
        });

        this.subscribe('yf:unretweet-success', (_: Electron.IpcRendererEvent, json: Twitter.Status) => {
            // Note:
            // The JSON is an original retweeted tweet
            log.debug('Received channel yf:unretweet-success', json.id_str);
            if (json.retweeted) {
                log.error('yf:unretweet-success: Unretweeted tweet is marked as "retweeted"', json);
                json.retweeted = false;
                json.retweet_count -= 1;
            }
            Store.dispatch(unretweetSucceeded(new Tweet(json)));
        });

        this.subscribe('yf:like-success', (_: Electron.IpcRendererEvent, json: Twitter.Status) => {
            log.debug('Received channel yf:like-success', json.id_str);
            Store.dispatch(likeSucceeded(new Tweet(json)));
        });

        this.subscribe('yf:unlike-success', (_: Electron.IpcRendererEvent, json: Twitter.Status) => {
            log.debug('Received channel yf:unlike-success', json.id_str);
            Store.dispatch(unlikeSucceeded(new Tweet(json)));
        });

        this.subscribe('yf:my-account', (_: Electron.IpcRendererEvent, json: Twitter.User) => {
            log.debug('Received channel yf:my-account', json.id_str);
            Store.dispatch(setCurrentUser(new TwitterUser(json)));
        });

        this.subscribe('yf:my-account-update', (_: Electron.IpcRendererEvent, json: Twitter.User) => {
            log.debug('Received channel yf:my-account-update', json);
            Store.dispatch(updateCurrentUser(json));
        });

        this.subscribe('yf:delete-status', (_: Electron.IpcRendererEvent, status: Twitter.StreamingDeleteStatus) => {
            log.debug('Received channel yf:delete-status', status.id_str);
            Store.dispatch(deleteStatusInTimeline(status.id_str));
        });

        this.subscribe('yf:liked-status', (_: Electron.IpcRendererEvent, status: Twitter.Status, from_user: Twitter.User) => {
            log.debug('Received channel yf:liked-status', status, from_user);
            Store.dispatch(statusLiked(new Tweet(status), new TwitterUser(from_user)));
        });

        this.subscribe('yf:update-status-success', (_: Electron.IpcRendererEvent, json: Twitter.Status) => {
            log.debug('Received channel yf:update-status-success', json.id_str);
            Store.dispatch(showMessage('Tweeted!', 'info'));
        });

        this.subscribe('yf:mentions', (_: Electron.IpcRendererEvent, json: Twitter.Status[]) => {
            log.debug('Received channel yf:mentions', json);
            Store.dispatch(addMentions(json.map(j => new Tweet(j))));
            DB.accounts.storeAccountsInTweets(json);
            DB.hashtags.storeHashtagsInTweets(json);
            // Note:
            // Do not notify mentions because this IPC message is sent from main
            // process at app starting.  If we were to notify mentions here, so many
            // notifications are sent to a user.
        });

        this.subscribe('yf:rejected-ids', (_: Electron.IpcRendererEvent, ids: number[]) => {
            Store.dispatch(addRejectedUserIds(ids));
            DB.rejected_ids.storeIds(ids);
        });

        this.subscribe('yf:unrejected-ids', (_: Electron.IpcRendererEvent, ids: number[]) => {
            Store.dispatch(removeRejectedUserIds(ids));
            DB.rejected_ids.deleteIds(ids);
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
