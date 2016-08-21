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
    }

    apply(content, success) {
        SH_event.emit('apply', content, success);
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

    getOnItems(idx) {
        return this.props.hosts.list.filter((item, _idx) => {
            return (item.on && _idx != idx) || (!item.on && _idx == idx);
        });
    }

    getOnContent(idx) {
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
