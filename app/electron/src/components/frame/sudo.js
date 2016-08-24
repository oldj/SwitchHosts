/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

import React from 'react';
import Frame from './frame';
import './sudo.less';

export default class SudoPrompt extends React.Component {
    constructor(props) {
        super(props);

        this.onSuccess = null;
        this.state = {
            show: false,
            pswd: ''
        }
    }

    componentDidMount() {
        SH_event.on('sudo_prompt', (success) => {
            this.setState({show: true});
            this.onSuccess = success;
            setTimeout(() => {
                let el = this.refs.body;
                el && el.querySelector('input').focus();
            }, 100);
        });
    }

    onOK() {
        let pswd = this.refs.pswd.value;
        if (!pswd) return;

        this.setState({
            show: false,
            pswd: pswd
        });

        SH_event.emit('sudo_pswd', pswd);
        if (typeof this.onSuccess === 'function') {
            this.onSuccess(pswd);
        }
        this.onSuccess = null;
    }

    onCancel() {
        this.setState({
            show: false
        });
        this.onSuccess = null;
    }

    body() {
        return (
            <div ref="body">
                <div className="ln">
                    <div className="title">{SH_Agent.lang.sudo_pswd}</div>
                    <div className="cnt">
                        <input
                            type="password"
                            ref="pswd"
                            onKeyDown={(e)=>(e.keyCode === 13 && this.onOK()||e.keyCode===27 && this.onCancel())}
                        />
                    </div>
                </div>
            </div>
        )
    }

    render() {
        return (
            <Frame
                show={this.state.show}
                head={SH_Agent.lang.input_sudo_pswd}
                body={this.body()}
                onOK={() => this.onOK()}
                onCancel={() => this.onCancel()}
            />
        );
    }
}
