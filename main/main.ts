import {join} from 'path';
import {app, BrowserWindow, powerMonitor, globalShortcut} from 'electron';
import windowState = require('electron-window-state');
import {authenticate, load_cached_tokens} from './authenticator';
import log from './log';
import IpcSender from './ipc_sender';
import Twitter from './twitter';
import setApplicationMenu from './menu';
import loadConfig from './config';

let win = null as Electron.BrowserWindow;

const already_running = app.makeSingleInstance((cmdline, working_dir) => {
    if (!win) {
        return;
    }

    if (win.isMinimized()) {
        win.restore();
    }

    win.focus();
});

if (already_running) {
    app.quit();
}

function handleSingleInstance() {
    'use strict';
}

const consumer_key = process.env.YOURFUKUROU_CONSUMER_KEY || 'H4fJ2rgNuH2UiOXuPBjHpl9zL';
const consumer_secret = process.env.YOURFUKUROU_CONSUMER_KEY_SECRET || 'azYRjJn6emdsOIUhepy0Wygmaq9PltEnpsx4P4BfU1HMp5Unmm';
const should_use_dummy_data = process.env.NODE_ENV === 'development' && process.env.YOURFUKUROU_DUMMY_TWEETS;

const prepare_app = loadConfig()
        .then(c => {
            global.config_path = c[0];
            global.config = c[1];
        })
        .catch(e => {
            log.error('Fatal error on loading configuration:', e);
            app.quit();
        })
        .then(load_cached_tokens)
        .catch(_ => authenticate(consumer_key, consumer_secret));

app.once('window-all-closed', () => app.quit());

function isRunFromNpmPackageOnDarwin() {
    'use strict';
    return process.platform === 'darwin' && app.getAppPath().indexOf('/YourFukurou.app/') === -1;
}

function open_window(access: AccessToken) {
    'use strict';
    log.debug('Starting to open window');

    const win_state = windowState({
        defaultWidth: 600,
        defaultHeight: 800,
    });

    const index_html = 'file://' + join(__dirname, '..', 'index.html');
    const icon_path = join(__dirname, '..', 'images', 'icon.png');
    win = new BrowserWindow({
        x: win_state.x,
        y: win_state.y,
        width: win_state.width,
        height: win_state.height,
        titleBarStyle: 'hidden-inset',
        autoHideMenuBar: true,
        icon: icon_path,
    });

    win.once('closed', () => { win = null; });

    if (win_state.isFullScreen) {
        win.setFullScreen(true);
    } else if (win_state.isMaximized) {
        win.maximize();
    }
    win_state.manage(win);

    if (access.token && access.token_secret) {
        win.webContents.on('dom-ready', () => {
            log.debug('dom-ready: Ready to connect to Twitter API');
            const twitter = new Twitter();
            twitter.prepareClient({
                consumer_key,
                consumer_secret,
                access_token: access.token,
                access_token_secret: access.token_secret,
            });
            twitter.sender = new IpcSender(win.webContents);

            if (should_use_dummy_data) {
                twitter
                    .sendDummyAccount()
                    .then(() => twitter.sendDummyStream())
                    .catch(e => log.error('Unexpected error on dummy stream:', e));
                return;
            }

            twitter
                .sendAuthenticatedAccount()
                .catch(err => {
                    if (!err || (err instanceof Error) || err[0].code !== 32) {
                        log.error('Unexpected error on verifying account:', err);
                        return;
                    }
                    log.debug('Retry authentication flow');
                    return authenticate(consumer_key, consumer_secret)
                        .then((a: AccessToken) => {
                            if (!a.token || !a.token_secret) {
                                log.error('Invalid access tokens:', a);
                                return;
                            }
                            twitter.prepareClient({
                                consumer_key,
                                consumer_secret,
                                access_token: a.token,
                                access_token_secret: a.token_secret,
                            });
                        })
                        .then(() => twitter.sendAuthenticatedAccount())
                        .catch(e => {
                            log.error('Give up: Second authentication try failed.  If you use environment variables for tokens, please check them:', e);
                        });
                })
                .then(() => Promise.all([
                    twitter.fetchMuteIds(),
                    twitter.fetchNoRetweets(),
                    twitter.fetchBlockIds(),
                    twitter.fetchHomeTimeline(),
                    twitter.fetchMentionTimeline(),
                ]))
                .then(([mute_ids, no_retweet_ids, block_ids, tweets, mentions]) => {
                    // Note: Merge mute list with block list
                    for (const m of mute_ids) {
                        if (block_ids.indexOf(m) === -1) {
                            block_ids.push(m);
                        }
                    }
                    log.debug('Total rejected ids: ', block_ids.length);
                    twitter.sender.send('yf:rejected-ids', block_ids);
                    twitter.sender.send('yf:no-retweet-ids', no_retweet_ids);
                    for (const tw of tweets) {
                        twitter.sender.send('yf:tweet', tw);
                    }
                    twitter.sender.send('yf:mentions', mentions);
                })
                .then(() => twitter.connectToStream())
                .catch((e: any) => log.error('Unexpected error on streaming', e));

            powerMonitor.on('suspend', () => {
                log.debug("PC's going to suspend, stop streaming");
                if (!should_use_dummy_data) {
                    twitter.stopStreaming();
                }
            });
            powerMonitor.on('resume', () => {
                log.debug("PC's resuming, will reconnect after 3secs: " + twitter.isStopped());
                if (twitter.isStopped() && !should_use_dummy_data) {
                    twitter.sendConnectionFailure();
                    twitter.connectToStream();
                }
            });

            if (global.config.hotkey_accelerator) {
                const hotkey = global.config.hotkey_accelerator;
                globalShortcut.register(hotkey, () => win.isFocused() ? win.hide() : win.show());
                log.debug('Hot key was set:' + hotkey);
            }
        });
    } else {
        log.error('Failed to get access tokens');
    }

    win.loadURL(index_html);

    if (isRunFromNpmPackageOnDarwin()) {
        app.dock.setIcon(icon_path);
    }

    setApplicationMenu(win);

    if (process.env.NODE_ENV === 'development') {
        win.webContents.on('devtools-opened', () => setImmediate(() => win.focus()));
        win.webContents.openDevTools({mode: 'detach'});
    }
}

app.once(
    'ready',
    () => prepare_app
        .then(open_window)
        .catch(e => log.error('Unexpected error on "ready" callback:', e))
);


