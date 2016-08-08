/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

import React from 'react';
import './content.less';

export default class Content extends React.Component {

    onChange() {

    }

    render() {
        let {current} = this.props;

        return (
            <div id="content">
                <textarea value={current.content} onChange={this.onChange.bind(this)}></textarea>
            </div>
        );
    }
}
