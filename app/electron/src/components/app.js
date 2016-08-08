/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

import React from 'react';
import Panel from './panel/panel';
import './app.less';

export default class App extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div id="app">
                <Panel hosts={this.props.hosts}/>
            </div>
        );
    }
}
