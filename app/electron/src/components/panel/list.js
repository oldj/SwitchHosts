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
            });
            // this.state.list.push(data);
            // this.forceUpdate();

            this.selectOne(data);

            setTimeout(() => {
                SH_event.emit('change');
                let el = document.querySelector('#sh-list');
                el.scrollTop = document.querySelector('.list-item.selected').offsetTop - el.offsetHeight + 50;
            }, 100);
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
            });

            setTimeout(() => {
                let list = this.state.list;
                let next_host = list[idx_to_del] || list[list.length - 1] || this.props.hosts.sys;
                if (next_host) {
                    this.selectOne(next_host);
                }
                SH_event.emit('change');
            }, 100);
        });
    }

    apply(content, success) {
        SH_event.emit('apply', content, () => {
            this.last_content = content;
            success();
            SH_event.emit('save_data', this.state.list);
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
        this.apply(content, success);
    }

    getOnItems(idx = -1) {
        return this.state.list.filter((item, _idx) => {
            return (item.on && _idx != idx) || (!item.on && _idx == idx);
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
                    selectOne={this.selectOne.bind(this)}
                    current={this.state.current}
                    onToggle={(success)=> this.toggleOne(idx, success)}
                    key={'host-' + idx}/>
            )
        });
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
                {this.customItems()}
            </div>
        );
    }
}

export default List;
