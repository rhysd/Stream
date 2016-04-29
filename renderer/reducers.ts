import {List} from 'immutable';
import assign = require('object-assign');
import {EditorState, Modifier, CompositeDecorator, SelectionState, ContentState} from 'draft-js';
import {combineReducers} from 'redux';
import {Action, Kind} from './actions';
import log from './log';
import Item from './item/item';
import Tweet, {TwitterUser} from './item/tweet';
import Separator from './item/separator';
import EditorKeymaps from './keybinds/editor';
import createScreenNameDecorator from './components/editor/screen_name_decorator';
import createHashtagDecorator from './components/editor/hashtag_decorator';
import autoCompleteFactory, {AutoCompleteLabel} from './components/editor/auto_complete_decorator';
import {searchSuggestionItems, SuggestionItem} from './components/editor/suggestions';
import TimelineKind from './timeline';

const electron = global.require('electron');
const ipc = electron.ipcRenderer;

// Note:
// These are currently created statically.  But actually they should be created dynamically
// with the state of reducer.
const editorDecolator = new CompositeDecorator([
    createScreenNameDecorator(),  // XXX: Temporary
    createHashtagDecorator(),     // XXX: Temporary
    autoCompleteFactory(/:(?:[a-zA-Z0-9_\-\+]+):?/g, 'EMOJI'),
]);

function sendToMain(ch: ChannelFromRenderer, ...args: any[]) {
    'use strict';
    ipc.send(ch, ...args);
}

export interface TimelineState {
    current_items: List<Item>;
    current_message: MessageInfo;
    current_user: TwitterUser;
    current_timeline: TimelineKind;
    home_timeline: List<Item>;
    mention_timeline: List<Item>;
}

const InitTimelineState: TimelineState = {
    current_items: List<Item>(),
    current_message: null,
    current_user: null,
    current_timeline: 'home',
    home_timeline: List<Item>(),
    mention_timeline: List<Item>(),
};

function timeline(state: TimelineState = InitTimelineState, action: Action) {
    'use strict';
    switch (action.type) {
        case Kind.AddTweetToTimeline: {
            const next_state = assign({}, state) as TimelineState;
            next_state.home_timeline = state.home_timeline.unshift(action.status);
            if (action.status.mentionsTo(state.current_user)) {
                next_state.mention_timeline = state.mention_timeline.unshift(action.status);
            }
            next_state.current_items = getCurrentTimeline(next_state);
            return next_state;
        }
        case Kind.AddSeparator: {
            const next_state = assign({}, state) as TimelineState;
            if (!(state.current_items.first() instanceof Separator)) {
                next_state.current_items = state.current_items.unshift(action.item);
            }
            if (!(state.home_timeline.first() instanceof Separator)) {
                next_state.home_timeline = state.home_timeline.unshift(action.item);
            }
            if (!(state.mention_timeline.first() instanceof Separator)) {
                next_state.mention_timeline = state.mention_timeline.unshift(action.item);
            }
            return next_state;
        }
        case Kind.ChangeCurrentTimeline: {
            if (action.timeline === state.current_timeline) {
                return state;
            }
            const next_state = assign({}, state) as TimelineState;
            next_state.current_timeline = action.timeline;
            next_state.current_items = getCurrentTimeline(next_state);
            return next_state;
        }
        case Kind.DeleteStatus: {
            const id = action.tweet_id;
            const next_state = assign({}, state) as TimelineState;
            next_state.current_items = state.current_items.filter(
                item => {
                    if (item instanceof Tweet) {
                        const s = item.getMainStatus();
                        if (s.id === id) {
                            log.debug('Deleted status:', s);
                            return false;
                        }
                    }
                    return true;
                }
            ).toList();
            return next_state;
        }
        case Kind.AddMentions: {
            const next_state = assign({}, state) as TimelineState;
            const added = List<Item>(
                action.mentions.filter(
                    m => !containsStatusInTimeline(state.mention_timeline, m)
                )
            );
            next_state.mention_timeline = added.concat(state.mention_timeline).toList();
            next_state.current_items = getCurrentTimeline(next_state);
            return next_state;
        }
        case Kind.RetweetSucceeded: {
            const next_state = assign({}, state) as TimelineState;
            return replaceStatusInTimeline(next_state, action.status.getMainStatus());
        }
        case Kind.UnretweetSucceeded: {
            const next_state = assign({}, state) as TimelineState;
            return replaceStatusInTimeline(next_state, action.status);
        }
        case Kind.LikeSucceeded: {
            const next_state = assign({}, state) as TimelineState;
            return replaceStatusInTimeline(next_state, action.status);
        }
        case Kind.UnlikeSucceeded: {
            const next_state = assign({}, state) as TimelineState;
            return replaceStatusInTimeline(next_state, action.status);
        }
        case Kind.ShowMessage: {
            const next_state = assign({}, state) as TimelineState;
            next_state.current_message = {
                text: action.text,
                kind: action.msg_kind,
            };
            return next_state;
        }
        case Kind.DismissMessage: {
            const next_state = assign({}, state) as TimelineState;
            next_state.current_message = null;
            return next_state;
        }
        case Kind.SetCurrentUser: {
            const next_state = assign({}, state) as TimelineState;
            next_state.current_user = action.user;
            return next_state;
        }
        default: {
            return state;
        }
    }
}

export interface TweetEditorState {
    core: EditorState;
    is_open: boolean;
    keymaps: EditorKeymaps;
    in_reply_to_status: Tweet;
}

const InitTweetEditorState: TweetEditorState = {
    core: EditorState.createEmpty(editorDecolator),
    is_open: false,
    keymaps: new EditorKeymaps(),
    in_reply_to_status: null,
};

function editor(state: TweetEditorState = InitTweetEditorState, action: Action) {
    'use strict';
    switch (action.type) {
        case Kind.ChangeEditorState: {
            const next_state = assign({}, state) as TweetEditorState;
            next_state.core = action.editor;
            return next_state;
        }
        case Kind.UpdateStatus: {
            const next_state = assign({}, state) as TweetEditorState;

            // Note:
            // Add more status information (e.g. picture to upload)
            sendToMain('yf:update-status', action.text, action.in_reply_to_id);

            // Note: Reset context to clear text input
            next_state.core = EditorState.createEmpty(editorDecolator);
            next_state.in_reply_to_status = null;

            return next_state;
        }
        case Kind.SelectAutoCompleteSuggestion: {
            const selection = state.core.getSelection();
            const offset = selection.getAnchorOffset() - 1;
            const content = state.core.getCurrentContent();
            const block_text = content.getBlockForKey(selection.getAnchorKey()).getText();
            const idx = block_text.lastIndexOf(action.query, offset);

            if (idx === -1 || (idx + action.query.length < offset)) {
                log.error('Invalid selection:', selection);
                return state;
            }

            const next_selection = selection.merge({
                anchorOffset: idx,
                focusOffset: idx + action.query.length,
            }) as SelectionState;
            const next_content = Modifier.replaceText(content, next_selection, action.text);
            const next_editor = EditorState.forceSelection(
                EditorState.push(
                    state.core,
                    next_content,
                    'insert-characters'
                ),
                next_content.getSelectionAfter()
            );

            const next_state = assign({}, state) as TweetEditorState;
            next_state.core = next_editor;
            return next_state;
        }
        case Kind.OpenEditor: {
            return openEditor(state, action.status);
        }
        case Kind.CloseEditor: {
            return closeEditor(state);
        }
        case Kind.ToggleEditor: {
            if (state.is_open) {
                return closeEditor(state);
            } else {
                return openEditor(state, action.status);
            }
        }
        default: {
            return state;
        }
    }
}

export interface EditorCompletionState {
    query: string;
    label: AutoCompleteLabel;
    pos_top: number;
    pos_left: number;
    suggestions: SuggestionItem[];
    focus_idx: number;
}

const InitEditorCompletionState: EditorCompletionState = {
    query: null,
    label: null,
    pos_top: 0,
    pos_left: 0,
    suggestions: [],
    focus_idx: null,
};

function editorCompletion(state: EditorCompletionState = InitEditorCompletionState, action: Action) {
    'use strict';
    switch (action.type) {
        case Kind.UpdateAutoCompletion: {
            const next_state = assign({}, state) as EditorCompletionState;
            if (action.query === state.query) {
                // When overlapping queries, it means that completion was done.
                return resetCompletionState(next_state);
            }
            next_state.query = action.query;
            next_state.label = action.completion_label;
            next_state.pos_left = action.left;
            next_state.pos_top = action.top;
            next_state.suggestions = searchSuggestionItems(action.query, action.completion_label);
            return next_state;
        }
        case Kind.DownAutoCompletionFocus: {
            if (state.label === null) {
                // Note: Suggestion not being selected
                return state;
            }
            const next_state = assign({}, state) as EditorCompletionState;
            const i = state.focus_idx;
            if (i === null || i >= state.suggestions.length - 1) {
                next_state.focus_idx = 0;
            } else {
                next_state.focus_idx = i + 1;
            }
            return next_state;
        }
        case Kind.UpAutoCompletionFocus: {
            if (state.label === null) {
                // Note: Suggestion not being selected
                return state;
            }
            const next_state = assign({}, state) as EditorCompletionState;
            const i = state.focus_idx;
            if (i === null || i <= 0) {
                next_state.focus_idx = state.suggestions.length - 1;
            } else {
                next_state.focus_idx = i - 1;
            }
            return next_state;
        }
        case Kind.StopAutoCompletion: {
            return resetCompletionState(assign({}, state) as EditorCompletionState);
        }
        case Kind.SelectAutoCompleteSuggestion: {
            return resetCompletionState(assign({}, state) as EditorCompletionState);
        }
        default: {
            return state;
        }
    }
}

function statelessActions(state: {} = null, action: Action) {
    'use strict';
    switch (action.type) {
        case Kind.SendRetweet: {
            // Note:
            // The retweeted status will be sent on stream
            sendToMain('yf:request-retweet', action.tweet_id);
            break;
        }
        case Kind.UndoRetweet: {
            sendToMain('yf:undo-retweet', action.tweet_id);
            break;
        }
        case Kind.CreateLike: {
            // Note:
            // The likeed status will be sent on stream
            sendToMain('yf:request-like', action.tweet_id);
            break;
        }
        case Kind.DestroyLike: {
            sendToMain('yf:destroy-like', action.tweet_id);
            break;
        }
        default:
            break;
    }
    return state;
}

function updateStatus(items: List<Item>, status: Tweet) {
    'use strict';
    return items.map(item => {
        if (item instanceof Tweet) {
            const id = item.getMainStatus().id;
            if (id === status.id) {
                if (item.isRetweet()) {
                    const cloned = item.clone();
                    cloned.json.retweeted_status = status.json;
                    return cloned;
                } else {
                    return status;
                }
            }
        }
        return item;
    }).toList();
}

function resetCompletionState(s: EditorCompletionState) {
    'use strict';
    s.query = null;
    s.label = null;
    s.pos_left = 0;
    s.pos_top = 0;
    s.suggestions = [];
    s.focus_idx = null;
    return s;
}

function openEditor(state: TweetEditorState, status: Tweet) {
    'use strict';
    const next_state = assign({}, state) as TweetEditorState;
    next_state.is_open = true;
    next_state.in_reply_to_status = status;
    if (next_state.in_reply_to_status === null) {
        return next_state;
    }

    next_state.core = EditorState.moveSelectionToEnd(
        EditorState.push(
            state.core,
            ContentState.createFromText(`@${status.getMainStatus().user.screen_name} `),
            'insert-characters'
        )
    );

    return next_state;
}

function closeEditor(state: TweetEditorState) {
    'use strict';
    const next_state = assign({}, state) as TweetEditorState;
    next_state.is_open = false;
    next_state.in_reply_to_status = null;
    next_state.core = EditorState.push(
        state.core,
        ContentState.createFromText(''),
        'remove-range'
    );
    return next_state;
}

function getCurrentTimeline(state: TimelineState) {
    'use strict';
    switch (state.current_timeline) {
        case 'home': return state.home_timeline;
        case 'mention': return state.mention_timeline;
        default:
            log.error('Invalid timeline for:', state.current_timeline);
            return null;
    }
}

// This should be done in TimelineManager
function replaceStatusInTimeline(state: TimelineState, status: Tweet) {
    'use strict';
    state.home_timeline = updateStatus(state.home_timeline, status);
    state.mention_timeline = updateStatus(state.mention_timeline, status);
    state.current_items = getCurrentTimeline(state);
    return state;
}

function containsStatusInTimeline(is: List<Item>, t: Tweet) {
    'use strict';
    return is.find(i => {
        if (i instanceof Tweet) {
            return i.id === t.id;
        } else {
            return false;
        }
    });
}

export type State = {
    timeline: TimelineState,
    editor: TweetEditorState,
    editorCompletion: EditorCompletionState,
}

const root = combineReducers({
    timeline,
    editor,
    editorCompletion,
    statelessActions,
});
export default root;
