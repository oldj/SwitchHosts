/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

import React from 'react';
import ListItem from './list_item';
import './list.less';

export default class List extends React.Component {

    constructor(props) {
        super(props);

        this.state = {
            current: this.props.current
        };
    }

    selectOne(host) {
        this.setState({
            current: host
        });

        this.props.setCurrent(host);
    }

    customItems() {
        return this.props.hosts.list.map((item, idx) => {
            return (
                <ListItem
                    data={item}
                    selectOne={this.selectOne.bind(this)}
                    current={this.state.current}
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
