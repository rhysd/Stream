import * as React from 'react';
import {connect} from 'react-redux';
import {Editor, EditorState, getDefaultKeyBinding} from 'draft-js';
import {getTweetLength} from 'twitter-text';
import {List} from 'immutable';
import {Twitter} from 'twit';
import {showMessage} from '../../actions/message';
import {
    changeEditorState,
    closeEditor,
    selectAutoCompleteSuggestion,
} from '../../actions/editor';
import IconButton from '../icon_button';
import KeymapTransition from '../../keybinds/keymap_transition';
import Tweet from '../../item/tweet';
import log from '../../log';
import State from '../../states/root';
import {Dispatch} from '../../store';
import EditorCompletionState from '../../states/editor_completion';
import AutoCompleteSuggestions, {SuggestionItem} from './suggestions';
import TweetText from '../tweet/text';
import TweetSecondary from '../tweet/secondary';
import PopupIcon from '../tweet/popup_icon';
import TwitterRestApi from '../../twitter/rest_api';
import DB from '../../database/db';

interface TweetEditorProps extends React.Props<any> {
    readonly editor: EditorState;
    readonly inReplyTo: Tweet | null;
    readonly completion: EditorCompletionState;
    readonly friends: List<number>;
    readonly dispatch?: Dispatch;
}

// TODO:
// We need to use CSSTransitionGroup to add open/close animation
//   https://facebook.github.io/react/docs/animation.html
export class TweetEditor extends React.Component<TweetEditorProps, {}> {
    body: HTMLElement;
    editor: Editor;

    onBodyRef = (ref: HTMLElement) => {
        this.body = ref;
    }

    onEditorRef = (ref: Editor) => {
        this.editor = ref;
    }

    handleKeyBinding = (e: React.KeyboardEvent) => {
        // Note: When RETURN key is pressed
        if (e.keyCode === 10 || e.keyCode === 13) {
            // XXX:
            // When 'handleReturn' prop is specified, this keybinding
            // handler is also executed.  But the handleKeyCommand
            // is never executed.
            // So we need to handle an action for RETURN key in
            // handleReturn and this handler doesn't need to handle
            // the event (it is handled by handleReturn).
            return getDefaultKeyBinding(e);
        }

        const action = KeymapTransition.editor.resolveEvent(e);
        if (action !== null) {
            log.debug('Handling custom keymap:', action);
            return action;
        }

        return getDefaultKeyBinding(e);
    }

    handleKeyCommand = (cmd: DraftJS.EditorCommand) => KeymapTransition.editor.handleAction(cmd)

    handleReturn = (e: React.KeyboardEvent) => {
        const a = KeymapTransition.editor.resolveReturnAction(e);
        log.debug('Handling return key:', a);
        switch (a) {
            case 'send-tweet': {
                this.sendTweet();
                return true;
            }
            case 'choose-suggestion': {
                return this.selectAutoCompletionItem();
            }
            default:
                return false;
        }
    }

    handleBlur = (e: React.KeyboardEvent) => {
        e.preventDefault();
        this.editor.focus();
    }

    handleTab = (e: React.KeyboardEvent) => {
        e.preventDefault();
        const action = KeymapTransition.editor.resolveEvent(e);
        if (action === null) {
            return false;
        }
        log.debug('Handling tab key:', action);
        KeymapTransition.editor.handleAction(action);
        return true;
    }

    handleClose = () => {
        this.close();
    }

    handleChange = (e: EditorState) => {
        this.props.dispatch!(changeEditorState(e));
    }

    handleSend = () => this.sendTweet()

    close() {
        this.body.addEventListener('animationend', () => {
            this.props.dispatch!(closeEditor());
        });
        this.body.className = 'tweet-form animated fadeOutUp';
    }

    getSelectAction(suggestion: SuggestionItem, completion: EditorCompletionState) {
        switch (completion.label) {
            case 'EMOJI':
                return selectAutoCompleteSuggestion(
                    suggestion.code!,
                    completion.query!,
                );
            case 'SCREENNAME':
                return selectAutoCompleteSuggestion(
                    suggestion.description + ' ',
                    completion.query!,
                );
            case 'HASHTAG':
                return selectAutoCompleteSuggestion(
                    suggestion.description + ' ',
                    completion.query!,
                );
            default:
                log.error('Invalid completion label on getSelectAction()');
                return null;
        }
    }

    selectAutoCompletionItem() {
        const completion = this.props.completion;
        if (completion.focus_idx === null) {
            return false;
        }
        const s = completion.suggestions[completion.focus_idx];
        if (!s) {
            return false;
        }
        this.props.dispatch!(this.getSelectAction(s, completion)!);
        return true;
    }

    sendTweet() {
        const {editor, inReplyTo, dispatch} = this.props;
        const content = editor.getCurrentContent();
        if (content.hasText()) {
            const irt = inReplyTo ? inReplyTo.getMainStatus().id : null;
            TwitterRestApi.updateStatus(content.getPlainText(), irt)
                .then((json: Twitter.Status) => {
                    dispatch!(showMessage('Tweeted!', 'info'));
                    DB.hashtag_completion_history.storeHashtagsInTweet(json);
                    DB.accounts.upCompletionCountOfMentions(json);

                    // TODO:
                    // Only close the editor.  When the response is 'success', then we
                    // should clear the text of editor content.
                });
            this.close();
        }
    }

    componentDidMount() {
        this.editor.focus();
    }

    renderInReplyTo() {
        const {inReplyTo, friends} = this.props;
        if (!inReplyTo) {
            return undefined;
        }
        const tw = inReplyTo.getMainStatus();
        return <div className="tweet-form__in-reply-to">
            <PopupIcon user={tw.user} friends={friends}/>
            <TweetSecondary status={inReplyTo}/>
            <TweetText status={inReplyTo}/>
        </div>;
    }

    render() {
        const completion = this.props.completion;
        const has_text = this.props.editor.getCurrentContent().hasText();
        const btn_state = has_text ? 'active' : 'inactive';

        const char_count = getTweetLength(this.props.editor.getCurrentContent().getPlainText());
        const count_state = char_count > 140 ? 'over' : 'normal';

        const suggestions =
                completion.label === null ?
                    undefined :
                    <AutoCompleteSuggestions {...completion}/>;

        return <div className="tweet-form animated fadeInDown" ref={this.onBodyRef}>
            {this.renderInReplyTo()}
            <div className="tweet-form__editor">
                <IconButton
                    className="tweet-form__cancel-btn"
                    name="times"
                    tip="cancel"
                    onClick={this.handleClose}
                />
                <div className="tweet-form__input">
                    <Editor
                        editorState={this.props.editor}
                        placeholder="Tweet..."
                        handleKeyCommand={this.handleKeyCommand}
                        handleReturn={this.handleReturn}
                        keyBindingFn={this.handleKeyBinding}
                        stripPastedStyles
                        onEscape={this.handleClose}
                        onTab={this.handleTab}
                        onBlur={this.handleBlur}
                        onChange={this.handleChange}
                        ref={this.onEditorRef}
                    />
                    <div className={'tweet-form__counter tweet-form__counter_' + count_state}>
                        {char_count}
                    </div>
                </div>
                <div className={'tweet-form__send-btn tweet-form__send-btn_' + btn_state}>
                    <IconButton
                        name="twitter"
                        tip="send tweet"
                        onClick={this.handleSend}
                    />
                </div>
                {suggestions}
            </div>
        </div>;
    }
}

function select(state: State): TweetEditorProps {
    return {
        editor: state.editor.core,
        inReplyTo: state.editor.in_reply_to_status,
        completion: state.editorCompletion,
        friends: state.timeline.friend_ids,
    };
}

export default connect(select)(TweetEditor);

