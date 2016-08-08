/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

import React from 'react';
import classnames from 'classnames';
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
        let {data, sys} = this.props;
        return (
            <div className={classnames({
                'list-item': 1
                , 'sys-host': sys
            })}>
                <i className={classnames({
                    'iconfont': 1
                    , 'icon-doc': !sys
                    , 'icon-sysserver': sys
                })}></i>
                <span>{this.getTitle(data)}</span>
            </div>
        );
    }
}
