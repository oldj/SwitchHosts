/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

import React from 'react';
import ListItem from './list_item';
import update from 'react-addons-update';
import './list.less';


class List extends React.Component {

    constructor(props) {
        super(props);

        this.state = {
            current: this.props.current,
            list: this.props.hosts.list
        };
        this.last_content = this.props.hosts.sys.content;

        SH_event.on('imported', () => {
            this.setState({
                current: this.props.current,
                list: this.props.hosts.list
            }, () => {
                SH_event.emit('change');
            });
        });

        SH_event.on('change', () => {
            SH_event.emit('save_data', this.state.list);
            let content = this.getOnContent();
            if (content !== this.last_content) {
                SH_event.emit('apply', content, () => {
                    this.last_content = content;
                });
            }
        });

        SH_event.on('host_added', (data) => {
            this.setState({
                list: update(this.state.list, {$push: [data]})
            }, () => {
                this.selectOne(data);

                setTimeout(() => {
                    SH_event.emit('change', true);
                    let el = this.refs.items;
                    el.scrollTop = document.querySelector('.list-item.selected').offsetTop - el.offsetHeight + 50;
                    this.checkUpdateHost(data);
                }, 100);
            });

        });

        SH_event.on('host_edited', (data, host) => {
            let idx = this.state.list.findIndex((item) => item == host);
            if (idx == -1) return;

            this.setState({
                list: update(this.state.list, {$splice: [[idx, 1, data]]})
            }, () => {
                this.selectOne(data);

                setTimeout(() => {
                    SH_event.emit('change', true);
                    this.checkUpdateHost(data, true);
                }, 100);
            });
        });

        SH_event.on('host_refreshed', (data, host) => {
            let idx = this.state.list.findIndex((item) => item == host);
            if (idx == -1) return;

            this.setState({
                list: update(this.state.list, {$splice: [[idx, 1, data]]})
            }, () => {
                setTimeout(() => {
                    if (host === this.state.current) {
                        this.selectOne(data);
                    }
                    SH_event.emit('change', true);
                }, 100);
            });
        });

        SH_event.on('del_host', (host) => {
            let list = this.state.list;
            let idx_to_del = list.findIndex((item) => {
                return host === item;
            });
            if (idx_to_del == -1) return;
            // list.splice(idx_to_del, 1);
            this.setState({
                list: update(this.state.list, {$splice: [[idx_to_del, 1]]})
                // list: this.state.list.filter((item, idx) => idx != idx_to_del)
            }, () => {
                setTimeout(() => {
                    let list = this.state.list;
                    let next_host = list[idx_to_del] || list[list.length - 1] || this.props.hosts.sys;
                    if (next_host) {
                        this.selectOne(next_host);
                    }
                    SH_event.emit('change');
                }, 100);
            });
        });

        SH_event.on('get_on_hosts', (callback) => {
            callback(this.getOnItems());
        });

        ipcRenderer.on('get_host_list', () => {
            ipcRenderer.send('send_host_list', this.state.list);
        });

        ipcRenderer.on('get_export_data', (e, fn) => {
            let data = Object.assign({}, {
                version: require('../../configs').version,
                list: this.state.list.map((item) => {
                    item.on = false;
                    return item;
                })
            });
            ipcRenderer.send('export_data', fn, JSON.stringify(data));
        });

        SH_event.on('top_toggle', (on, items) => {
            this.setState({
                list: this.state.list.map((item) => {
                    if (items.findIndex((i) => i == item) > -1) {
                        item.on = on;
                    }
                    return item;
                })
            }, () => {
                SH_event.emit('change');
            });
        });

        SH_event.on('loading_done', (host, data) => {
            SH_event.emit('host_refreshed', data, host);
            // if (host == this.state.current || host._ == this.state.current) {
            //     setTimeout(() => {
            //         this.selectOne(this.state.current);
            //     }, 100);
            // }
        });

        // auto check refresh
        setTimeout(() => {
            this.autoCheckRefresh();
        }, 1000 * 5);
    }

    /**
     * 检查当前 host 是否需要从网络下载更新
     * @param host
     * @param force {Boolean} 如果为 true，则只要是 remote 且 refresh_interval != 0，则强制更新
     */
    checkUpdateHost(host, force = false) {
        SH_event.emit('check_host_refresh', host, force);
    }

    autoCheckRefresh() {
        let remote_idx = -1;
        this.state.list.map((host, idx) => {
            if (host.where === 'remote') {
                remote_idx++;
            }
            setTimeout(() => {
                SH_event.emit('check_host_refresh', host);
            }, 1000 * 5 * remote_idx + idx);
        });

        // let wait = 1000 * 60 * 10;
        let wait = 1000 * 30; // test only
        setTimeout(() => {
            this.autoCheckRefresh();
        }, wait);
    }

    apply(content, success) {
        SH_event.emit('apply', content, () => {
            this.last_content = content;
            success();
            SH_event.emit('save_data', this.state.list);
            SH_Agent.notify({
                message: 'host updated.'
            });
        });
    }

    selectOne(host) {
        this.setState({
            current: host
        });

        this.props.setCurrent(host);
    }

    toggleOne(idx, success) {

        let content = this.getOnContent(idx);
        this.apply(content, () => {
            let choice_mode = SH_Agent.pref.get('choice_mode');
            if (choice_mode === 'single') {
                // 单选模式
                this.setState({
                    list: this.state.list.map((item, _idx) => {
                        if (idx != _idx) {
                            item.on = false;
                        }
                        return item;
                    })
                });
            }

            if (typeof success === 'function') {
                success();
            }
        });
    }

    getOnItems(idx = -1) {
        let choice_mode = SH_Agent.pref.get('choice_mode');
        return this.state.list.filter((item, _idx) => {
            if (choice_mode === 'single') {
                return !item.on && _idx == idx;
            } else {
                return (item.on && _idx != idx) || (!item.on && _idx == idx);
            }
        });
    }

    getOnContent(idx = -1) {
        let contents = this.getOnItems(idx).map((item) => {
            return item.content || '';
        });

        contents.unshift('# SwitchHosts!');

        return contents.join(`\n\n`);
    }

    customItems() {
        return this.state.list.map((item, idx) => {
            return (
                <ListItem
                    data={item}
                    idx={idx}
                    selectOne={this.selectOne.bind(this)}
                    current={this.state.current}
                    onToggle={(success)=> this.toggleOne(idx, success)}
                    key={'host-' + idx}
                    dragOrder={(sidx, tidx) => this.dragOrder(sidx, tidx)}
                />
            )
        });
    }

    dragOrder(source_idx, target_idx) {
        let source = this.state.list[source_idx];
        let target = this.state.list[target_idx];

        let list = this.state.list.filter((item, idx) => idx != source_idx);
        let new_target_idx = list.findIndex((item) => item == target);

        let to_idx;
        if (source_idx < target_idx) {
            // append
            to_idx = new_target_idx + 1;
        } else {
            // insert before
            to_idx = new_target_idx;
        }
        list.splice(to_idx, 0, source);

        this.setState({
            list: list
        });

        setTimeout(() => {
            SH_event.emit('change');
        }, 100);
    }

    componentDidMount() {
    }

    render() {
        return (
            <div id="sh-list">
                <ListItem
                    data={this.props.hosts.sys}
                    selectOne={this.selectOne.bind(this)}
                    current={this.state.current}
                    sys="1"/>
                <div ref="items" className="custom-items">
                    {this.customItems()}
                </div>
            </div>
        );
    }
}

export default List;
