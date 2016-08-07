/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

import React from 'react';
import Buttons from './buttons';
import List from './list';
import './panel.less';

export default class Panel extends React.Component {
    render() {
        return (
            <div id="panel">
                <List hosts={this.props.hosts}/>
                <Buttons/>
            </div>
        );
    }
}
