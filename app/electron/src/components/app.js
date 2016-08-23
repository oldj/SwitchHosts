/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

import React from 'react';
import Panel from './panel/panel';
import Content from './content/content';
import SudoPrompt from './frame/sudo';
import EditPrompt from './frame/edit';
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

    static isReadOnly(host) {
        return host.is_sys || host.where == 'remote';
    }

    toSave() {
        clearTimeout(this._t);

        this._t = setTimeout(() => {
            SH_event.emit('change');
        }, 1000);
    }

    setHostContent(v) {
        if (this.state.current.content == v) return; // not changed

        this.state.current.content = v || '';
        this.toSave();
    }

    componentDidMount() {
    }

    render() {
        let current = this.state.current;
        return (
            <div id="app">
                <Panel hosts={this.props.hosts} current={current} setCurrent={this.setCurrent.bind(this)}/>
                <Content current={current} readonly={App.isReadOnly(current)}
                         setHostContent={this.setHostContent.bind(this)}/>
                <div className="frames">
                    <SudoPrompt/>
                    <EditPrompt/>
                </div>
            </div>
        );
    }
}

export default App;
