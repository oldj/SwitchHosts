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
        let on = !this.props.data.on;

        this.props.onToggle(() => {
            this.props.data.on = on;
            this.forceUpdate();
        });

        SH_event.emit('toggle_host', on);
    }

    allowedDrop(e) {
        e.preventDefault();
    }

    onDrop(e) {
        if (this.props.sys) {
            e.preventDefault();
            return false;
        }
        let source_idx = parseInt(e.dataTransfer.getData('text'));

        this.props.dragOrder(source_idx, this.props.idx);
    }

    onDrag(e) {
        e.dataTransfer.setData('text', this.props.idx);
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
                 draggable={!sys}
                 onDragStart={(e) => this.onDrag(e)}
                 onDragOver={(e) => this.allowedDrop(e)}
                 onDrop={(e) => this.onDrop(e)}
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
                    , 'item-icon': 1
                    , 'icon-doc': !sys
                    , 'icon-sysserver': sys
                })}/>
                <span>{this.getTitle()}</span>
            </div>
        );
    }
}
