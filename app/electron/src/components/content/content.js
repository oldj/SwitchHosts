/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

import React from 'react';
import Editor from './editor';
import './content.less';

export default class Content extends React.Component {

    constructor(props) {
        super(props);

        this.codemirror = null;
        this.state = {
            code: this.props.current.content || ''
        };
    }

    setValue(v) {
        this.props.setHostContent(v);
    }

    componentWillReceiveProps(next_props) {
        this.setState({
            code: next_props.current.content || ''
        });
    }

    render() {
        // let {current} = this.props;

        return (
            <div id="sh-content">
                <Editor code={this.state.code} setValue={this.setValue.bind(this)}/>
            </div>
        );
    }
}
