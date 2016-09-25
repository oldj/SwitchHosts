/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

import React from 'react';
import Frame from './frame';
import classnames from 'classnames';
import './edit.less';

export default class EditPrompt extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            show: false,
            add: true,
            where: 'local',
            title: '',
            url: '',
            last_refresh: null,
            refresh_interval: 0,
            is_loading: false
        };

        this.current_host = null;
    }

    tryToFocus() {
        let el = this.refs.body && this.refs.body.querySelector('input[type=text]');
        el && el.focus();
    }

    clear() {
        this.setState({
            where: 'local',
            title: '',
            url: '',
            last_refresh: null,
            refresh_interval: 0
        });
    }

    componentDidMount() {
        SH_event.on('add_host', () => {
            this.setState({
                show: true,
                add: true
            });
            setTimeout(() => {
                this.tryToFocus();
            }, 100);
        });

        SH_event.on('edit_host', (host) => {
            this.current_host = host;
            this.setState({
                show: true,
                add: false,
                where: host.where || 'local',
                title: host.title || '',
                url: host.url || '',
                last_refresh: host.last_refresh || null,
                refresh_interval: host.refresh_interval || 0
            });
            setTimeout(() => {
                this.tryToFocus();
            }, 100);
        });

        SH_event.on('loading_done', (old_host, data) => {
            if (old_host === this.current_host) {
                this.setState({
                    last_refresh: data.last_refresh,
                    is_loading: false
                });
                SH_event.emit('host_refreshed', data, this.current_host);
            }
        });
    }

    onOK() {
        this.setState({
            title: (this.state.title || '').replace(/^\s+|\s+$/g, ''),
            url: (this.state.url || '').replace(/^\s+|\s+$/g, '')
        });

        if (this.state.title === '') {
            this.refs.title.focus();
            return false;
        }
        if (this.state.where === 'remote' && this.state.url === '') {
            this.refs.url.focus();
            return false;
        }

        let data = Object.assign({}, this.current_host, this.state, this.state.add ? {
            content: `# ${this.state.title}`,
            on: false
        } : {});

        delete data['add'];
        SH_event.emit('host_' + (this.state.add ? 'add' : 'edit') + 'ed', data, this.current_host);

        this.setState({
            show: false
        });
        this.clear();
    }

    onCancel() {
        this.setState({
            show: false
        });
        this.clear();
    }

    confirmDel() {
        if (!confirm(SH_Agent.lang.confirm_del)) return;
        SH_event.emit('del_host', this.current_host);
        this.setState({
            show: false
        });
        this.clear();
    }

    static getRefreshOptions() {
        let k = [
            [0, `${SH_Agent.lang.never}`],
            // [0.002778, `10s`], // test only
            [1, `1 ${SH_Agent.lang.hour}`],
            [24, `24 ${SH_Agent.lang.hours}`],
            [168, `7 ${SH_Agent.lang.days}`]
        ];
        return k.map(([v, n], idx) => {
            return (
                <option value={v} key={idx}>{n}</option>
            );
        });
    }

    getEditOperations() {
        if (this.state.add) return null;

        return (
            <div>
                <div className="ln">
                    <a href="#" className="del"
                       onClick={this.confirmDel.bind(this)}
                    >
                        <i className="iconfont icon-delete"/>
                        <span>{SH_Agent.lang.del_host}</span>
                    </a>
                </div>
            </div>
        );
    }

    refresh() {
        if (this.state.is_loading) return;

        SH_event.emit('check_host_refresh', this.current_host, true);
        this.setState({
            is_loading: true
        }, () => {
            setTimeout(() => {
                this.setState({
                    is_loading: false
                });
            }, 1000);
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
                            onKeyDown={(e)=>(e.keyCode === 13 && this.onOK()) || (e.keyCode === 27 && this.onCancel())}
                        />
                    </div>
                </div>
                <div className="ln">
                    <div className="title">{SH_Agent.lang.auto_refresh}</div>
                    <div className="cnt">
                        <select
                            value={this.state.refresh_interval}
                            onChange={(e) => this.setState({refresh_interval: parseFloat(e.target.value) || 0})}
                        >
                            {EditPrompt.getRefreshOptions()}
                        </select>

                        <i
                            className={classnames({
                                iconfont: 1,
                                'icon-refresh': 1,
                                'invisible': !this.current_host || this.state.url != this.current_host.url,
                                'loading': this.state.is_loading
                            })}
                            title={SH_Agent.lang.refresh}
                            onClick={() => this.refresh()}
                        />

                        <span className="last-refresh">
                            {SH_Agent.lang.last_refresh}
                            {this.state.last_refresh || 'N/A'}
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    body() {
        return (
            <div ref="body">
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
                            onKeyDown={(e)=>(e.keyCode === 13 && this.onOK() || e.keyCode === 27 && this.onCancel())}
                        />
                    </div>
                </div>
                {this.renderRemoteInputs()}
                {this.getEditOperations()}
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
