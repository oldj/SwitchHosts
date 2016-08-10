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
        this.state = {
            is_selected: false,
            on: this.props.data.on,
            title: this.props.data.title
        };
        console.log(this.props);
    }

    getTitle() {
        return this.is_sys ? 'System Hosts' : this.state.title || 'untitled';
    }

    beSelected() {
        this.setState({
            is_selected: true
        });

        this.props.selectOne(this.props.data);
    }

    toggle() {
        this.setState({
            on: !this.state.on
        });
    }

    render() {
        let {data, sys, current} = this.props;
        let is_selected = data == current;

        return (
            <div className={classnames({
                'list-item': 1
                , 'sys-host': sys
                , 'selected': is_selected
            })}
                 onClick={this.beSelected.bind(this)}
            >
                { sys ? null :
                    <i className={classnames({
                        'on': 1
                        , 'iconfont': 1
                        , 'icon-on': this.state.on
                        , 'icon-off': !this.state.on
                    })}
                       onClick={this.toggle.bind(this)}
                    />
                }
                <i className={classnames({
                    'iconfont': 1
                    , 'icon-doc': !sys
                    , 'icon-sysserver': sys
                })}/>
                <span>{this.getTitle()}</span>
            </div>
        );
    }
}
