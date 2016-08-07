/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

import React from 'react';
import './list_item.less';

export default class ListItem extends React.Component {
    constructor(props) {
        super(props);

        this.is_sys = !!this.props.sys;
    }

    getTitle(data) {
        return this.is_sys ? 'System Hosts' : data.title || 'untitled';
    }

    render() {
        let {data} = this.props;
        return (
            <div className="list-item">
                <span>{this.getTitle(data)}</span>
            </div>
        );
    }
}
