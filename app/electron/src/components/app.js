/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

import React from 'react';
import {connect} from 'react-redux';
import Panel from './panel/panel';
import Content from './content/content';
import './app.less';

class App extends React.Component {
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

    isReadOnly(host) {
        return host.is_sys || host.where == 'remote';
    }

    setHostContent(v) {
        if (this.state.current.content == v) return;

        this.state.current.content = v || '';
        // todo save to the disk
    }

    render() {
        console.log(this.props.dispatch);
        let current = this.state.current;
        return (
            <div id="app">
                <Panel hosts={this.props.hosts} current={current} setCurrent={this.setCurrent.bind(this)}/>
                <Content current={current} readonly={this.isReadOnly(current)}
                         setHostContent={this.setHostContent.bind(this)}/>
            </div>
        );
    }
}

function select(state) {
    return {
        sys: state.sys,
        list: state.list
    }
}

export default connect()(App);
