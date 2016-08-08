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
    }

    customItems() {
        return this.props.hosts.custom.map((item, idx) => {
            return (
                <ListItem data={item} key={'host-' + idx}/>
            )
        });
    }

    render() {
        return (
            <div id="list">
                <ListItem data={this.props.hosts.sys} sys="1"/>
                {this.customItems()}
            </div>
        );
    }
}
