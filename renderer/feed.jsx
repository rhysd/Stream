import React from "react";

export default class Feed extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            children: []
        };

        for (const source_name in this.props.sources) {
            for (const streams of this.props.sources[source_name]) {
                for (const stream_name in streams) {
                    console.log('Feed: registered: ' + source_name + '-' + stream_name);
                    this.props.router.registerRenderer(source_name, stream_name, new_item => {
                        const new_children = this.state.children.concat([new_item]);
                        this.setState({children: new_children});
                    });
                }
            }
        }
    }

    render() {
        return (
            <div className="feed">
                Hello world!  I'm feed component.
                {this.state.children}
            </div>
        );
    }
}
