/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

import React from 'react';
import './buttons.less';

export default class Buttons extends React.Component {

    btnAdd() {
        SH_event.emit('add_host');
    }

    render() {
        return (
            <div id="sh-buttons">
                <div className="left">
                    <a
                        className="btn-add"
                        href="#"
                        onClick={() => this.btnAdd()}
                    >+</a>
                </div>

                <div className="right">
                    <i className="iconfont icon-search"/>
                    <i className="iconfont icon-switchon"/>
                </div>
            </div>
        );
    }
}
