/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

import React from 'react';
import classnames from 'classnames';
import lang from '../../lang';
import './sudo.less';
let language = lang.getLang('cn');

export default class SudoPrompt extends React.Component {
    constructor(props) {
        super(props);
    }


    render() {
        return (
            <div className="frame">
                <div className="overlay"></div>
                <div className="prompt">
                    <div className="header">{language.input_sudo_pswd}</div>
                    <div className="body"></div>
                    <div className="foot"></div>
                </div>
            </div>
        );
    }
}
