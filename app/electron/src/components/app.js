/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

import React from 'react';
import Panel from './panel/panel';
import Content from './content/content';
import SudoPrompt from './frame/sudo';
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
            current: host.is_sys ? SH_Agent.getSysHosts() : host
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
        let current = this.state.current;
        return (
            <div id="app">
                <Panel hosts={this.props.hosts} current={current} setCurrent={this.setCurrent.bind(this)}/>
                <Content current={current} readonly={this.isReadOnly(current)}
                         setHostContent={this.setHostContent.bind(this)}/>
                <div className="frames">
                    <SudoPrompt/>
                </div>
            </div>
        );
    }
}

export default App;
