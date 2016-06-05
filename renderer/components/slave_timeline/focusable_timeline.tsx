import * as React from 'react';
import log from '../../log';

interface FocusableTimelineProps extends React.Props<FocusableTimeline> {
    className?: string;
    focusIndex: number;
}

export default class FocusableTimeline extends React.Component<FocusableTimelineProps, {}> {
    root: HTMLElement;

    scrollTweetIntoView(index: number) {
        if (!this.root) {
            log.error('Ref to root element of tweets is invalid:', this.root);
            return;
        }

        const children = this.root.children;
        const child = children.item(index);
        if (!child) {
            log.error('Invalid index to scroll into view:', index, child);
            return;
        }

        const root_rect = this.root.getBoundingClientRect();
        const child_rect = child.getBoundingClientRect();

        if (child_rect.top < root_rect.top) {
            // Note: Scroll top to view the focused element
            child.scrollIntoView(true);
        } else if (root_rect.bottom < child_rect.bottom) {
            // Note: Scroll bottom to view the focused element
            child.scrollIntoView(false);
        }
    }

    componentDidUpdate() {
        const idx = this.props.focusIndex;
        if (idx !== null) {
            this.scrollTweetIntoView(idx);
        }
    }

    render() {
        return (
            <div
                className={this.props.className}
                ref={r => { this.root = r; }}
            >
                {this.props.children}
            </div>
        );
    }
}
