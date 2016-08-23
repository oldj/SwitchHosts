/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

import React from 'react';
import ListItem from './list_item';
import './list.less';

class List extends React.Component {

    constructor(props) {
        super(props);

        this.state = {
            current: this.props.current
        };
        this.last_content = this.props.hosts.sys.content;

        SH_event.on('change', () => {
            SH_event.emit('save_data', this.props.hosts.list);
            let content = this.getOnContent();
            if (content !== this.last_content) {
                SH_event.emit('apply', content, () => {
                    this.last_content = content;
                });
            }
        });
    }

    apply(content, success) {
        SH_event.emit('apply', content, () => {
            this.last_content = content;
            success();
            SH_event.emit('save_data', this.props.hosts.list);
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
        return this.props.hosts.list.filter((item, _idx) => {
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
        return this.props.hosts.list.map((item, idx) => {
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
        SH_event.on('host_add', (data) => {
            this.props.hosts.list.push(data);
            // this.forceUpdate();
            console.log(data);

            this.selectOne(data);
            SH_event.emit('change');
        });
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
