/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict';

import React from 'react';
import './group.less';

export default class Group extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
        };

        this.current_host = null;
    }

    render() {
        return <div id="hosts-group">
            groups
        </div>;
    }
}
