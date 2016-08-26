/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

import React from 'react';
import Buttons from './buttons';
import SearchBar from './searchbar';
import List from './list';
import './panel.less';

export default class Panel extends React.Component {
    render() {
        let {current, hosts} = this.props;

        return (
            <div id="panel">
                <List hosts={hosts} current={current} setCurrent={this.props.setCurrent}/>
                <SearchBar/>
                <Buttons/>
            </div>
        );
    }
}
