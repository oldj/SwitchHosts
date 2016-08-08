/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

import React from 'react';
import Panel from './panel/panel';
import Content from './content/content';
import './app.less';

export default class App extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            current: this.props.hosts.sys
        };
    }

    setCurrent(host) {
        this.setState({
            current: host
        });

    }

    render() {
        return (
            <div id="app">
                <Panel hosts={this.props.hosts} current={this.state.current} setCurrent={this.setCurrent.bind(this)}/>
                <Content current={this.state.current}/>
            </div>
        );
    }
}
