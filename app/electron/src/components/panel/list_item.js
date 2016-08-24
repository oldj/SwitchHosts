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
            is_selected: false
            // on: this.props.data.on,
        };
    }

    getTitle() {
        return this.is_sys ? 'System Hosts' : this.props.data.title || 'untitled';
    }

    beSelected() {
        // this.setState({
        //     is_selected: true
        // });

        this.props.selectOne(this.props.data);
    }

    toEdit() {
        SH_event.emit('edit_host', this.props.data);
    }

    toggle() {
        this.props.onToggle(() => {
            this.props.data.on = !this.props.data.on;
            this.forceUpdate();
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
                    (
                        <div>
                            <i className={classnames({
                                'switch': 1
                                , 'iconfont': 1
                                , 'icon-on': data.on
                                , 'icon-off': !data.on
                            })}
                               onClick={this.toggle.bind(this)}
                            />
                            <i
                                className="iconfont icon-edit"
                                onClick={this.toEdit.bind(this)}
                            />
                        </div>
                    )
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
