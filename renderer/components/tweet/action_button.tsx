import * as React from 'react';
import {connect} from 'react-redux';
import Tweet, {TwitterUser} from '../../item/tweet';
import IconButton from '../icon_button';
import {
    showMessage,
    sendRetweet,
    undoRetweet,
    createLike,
    destroyLike,
    openEditorForReply,
} from '../../actions';

type TweetActionKind = 'reply' | 'like' | 'retweet';

interface ConnectedProps extends React.Props<any> {
    status: Tweet;
    kind: TweetActionKind;
    owner?: TwitterUser;
}

interface DispatchProps {
    onClick: (e: React.MouseEvent) => void;
}

type TweetActionButtonProps = ConnectedProps & DispatchProps;

function onLikeClicked(status: Tweet, dispatch: Redux.Dispatch) {
    'use strict';
    if (status.favorited) {
        dispatch(destroyLike(status.id));
    } else {
        dispatch(createLike(status.id));
    }
}

function onRetweetClicked(status: Tweet, owner: TwitterUser, dispatch: Redux.Dispatch) {
    'use strict';
    if (status.user.id === owner.id) {
        dispatch(showMessage('You cannot retweet your tweet', 'error'));
        return;
    }
    if (status.user.protected) {
        dispatch(showMessage("Cannot retweet protected user's tweet", 'error'));
        return;
    }

    if (status.retweeted) {
        dispatch(undoRetweet(status.id));
    } else {
        dispatch(sendRetweet(status.id));
    }
}

function getIcon(k: TweetActionKind) {
    'use strict';
    switch (k) {
        case 'reply': return 'reply';
        case 'retweet': return 'retweet';
        case 'like': return 'heart';
        default: return '';
    }
}

function getColor(props: TweetActionButtonProps) {
    'use strict';
    switch (props.kind) {
        case 'retweet': {
            if (props.status.retweeted) {
                return '#19cf86';
            } else if (props.status.user.id === props.owner.id) {
                // Note:
                // Disable retweet button for my tweets.
                return '#cccccc';
            } else {
                return undefined;
            }
        }
        case 'like': {
            if (props.status.favorited) {
                return '#ff4f44';
            } else {
                return undefined;
            }
        }
        default: return undefined;
    }
}

function makeCount(count: number) {
    'use strict';
    if (count >= 1000000) {
        return (Math.floor(count / 100000) / 10) + 'M';
    } else if (count >= 1000) {
        return (Math.floor(count / 100) / 10) + 'K';
    } else if (count === 0) {
        return '';
    } else {
        return count.toString();
    }
}

function getCount(props: TweetActionButtonProps) {
    'use strict';
    switch (props.kind) {
        case 'retweet': return makeCount(props.status.retweet_count);
        case 'like':    return makeCount(props.status.favorite_count);
        default:        return '';
    }
}

const TweetActionButton = (props: TweetActionButtonProps) => {
    const icon = getIcon(props.kind);
    const color = getColor(props);
    return <div className="tweet-actions__with-count" style={{color}}>
        <IconButton
            name={icon}
            tip={props.kind}
            className={'tweet-actions__' + props.kind}
            onClick={props.onClick}
        />
        <div className="tweet-actions__count">
            {getCount(props)}
        </div>
    </div>;
};

function mapDispatch(dispatch: Redux.Dispatch, props: ConnectedProps): DispatchProps {
    'use strict';
    return {
        onClick: e => {
            e.stopPropagation();
            switch (props.kind) {
                case 'reply':   dispatch(openEditorForReply(props.status, props.owner)); break;
                case 'retweet': onRetweetClicked(props.status, props.owner, dispatch); break;
                case 'like':    onLikeClicked(props.status, dispatch); break;
                default:        break;
            }
        }
    };
}

export default connect(null, mapDispatch)(TweetActionButton);
