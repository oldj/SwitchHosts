/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

import React from 'react';
import Frame from './frame';
import './edit.less';

export default class EditPrompt extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            show: true,
            add: true,
            where: 'local',
            title: '',
            url: '',
            last_refresh: null,
            refresh_interval: 0
        };
    }

    componentDidMount() {
    }

    onOK() {
    }

    onCancel() {
        this.setState({
            show: false
        });
    }

    renderRemoteInputs() {
        if (this.state.where !== 'remote') return null;

        return (
            <div className="remote-ipts">
                <div className="ln">
                    <div className="title">{SH_Agent.lang.url}</div>
                    <div className="cnt">
                        <input
                            type="text"
                            ref="url"
                            value={this.state.url}
                            placeholder="http://"
                            onChange={(e) => this.setState({url: e.target.value})}
                        />
                    </div>
                </div>
                <div className="ln">
                    <div className="title">{SH_Agent.lang.auto_refresh}</div>
                    <div className="cnt">
                        <input
                            type="text"
                            ref="refresh_interval"
                            value={this.state.refresh_interval}
                            onChange={(e) => this.setState({refresh_interval: e.target.value})}
                        />
                    </div>
                </div>
            </div>
        );
    }

    body() {
        return (
            <div>
                <div className="ln">
                    <input id="ipt-local" type="radio" name="where" value="local"
                           checked={this.state.where === 'local'}
                           onChange={(e) => this.setState({where: e.target.value})}
                    />
                    <label htmlFor="ipt-local">{SH_Agent.lang.where_local}</label>
                    <input id="ipt-remote" type="radio" name="where" value="remote"
                           checked={this.state.where === 'remote'}
                           onChange={(e) => this.setState({where: e.target.value})}
                    />
                    <label htmlFor="ipt-remote">{SH_Agent.lang.where_remote}</label>
                </div>
                <div className="ln">
                    <div className="title">{SH_Agent.lang.host_title}</div>
                    <div className="cnt">
                        <input
                            type="text"
                            ref="title"
                            name="text"
                            value={this.state.title}
                            onChange={(e) => this.setState({title: e.target.value})}
                        />
                    </div>
                </div>
                {this.renderRemoteInputs()}
            </div>
        )
    }

    render() {
        return (
            <Frame
                show={this.state.show}
                head={SH_Agent.lang[this.state.add ? 'add_host' : 'edit_host']}
                body={this.body()}
                onOK={() => this.onOK()}
                onCancel={() => this.onCancel()}
            />
        );
    }
}
