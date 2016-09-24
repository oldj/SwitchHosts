/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

import React from 'react';
import Frame from './frame';
// import classnames from 'classnames';
import './preferences.less';
import lang from '../../lang';

export default class PreferencesPrompt extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            show: false,
            lang_key: SH_Agent.lang_key
        };

    }

    componentDidMount() {
        SH_event.on('show_preferences', () => {
            this.setState({
                show: true
            });
        });
        ipcRenderer.on('show_preferences', () => {
            this.setState({
                show: true
            });
        });
    }

    onOK() {
        this.setState({
            show: false
        }, () => {
            setTimeout(() => {
                SH_Agent.relaunch();
            }, 200);
        });
    }

    onCancel() {
        this.setState({
            show: false
        });
    }

    static getLanguageOptions() {
        return lang.lang_list.map(({key, name}, idx) => {
            return (
                <option value={key} key={idx}>{name}</option>
            );
        });
    }

    updateLangKey(k) {
        SH_Agent.lang_key = k;
        SH_Agent.pref.set('user_language', k);
        this.setState({
            lange_key: k
        });
    }

    prefLanguage() {
        return (
            <div className="ln">
                <div className="title">{SH_Agent.lang.language}</div>
                <div className="cnt">
                    <select
                        value={SH_Agent.lang_key}
                        onChange={(e) => this.updateLangKey(e.target.value)}
                    >
                        {PreferencesPrompt.getLanguageOptions()}
                    </select>

                    <div className="inform">{SH_Agent.lang.should_restart_after_change_language}</div>
                </div>
            </div>
        )
    }

    body() {
        return (
            <div ref="body">
                <div className="ln">
                    {/*<div className="title">{SH_Agent.lang.host_title}</div>*/}
                    {/*<div className="cnt">*/}
                    {/*</div>*/}
                    {this.prefLanguage()}
                </div>
            </div>
        )
    }

    render() {
        return (
            <Frame
                show={this.state.show}
                head={SH_Agent.lang.preferences}
                body={this.body()}
                onOK={() => this.onOK()}
                onCancel={() => this.onCancel()}
                cancel_title={SH_Agent.lang.set_and_back}
                ok_title={SH_Agent.lang.set_and_relaunch_app}
            />
        );
    }
}
