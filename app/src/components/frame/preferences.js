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
        console.log(k);
        this.setState({
            lange_key: k
        }, () => {
            SH_Agent.pref.set('user_language', k);
        })
    }

    prefLanguage() {
        return (
            <div className="ln">
                <div className="title">{SH_Agent.lang.language}</div>
                <div className="cnt">
                    <select
                        value={this.state.lang_key}
                        onChange={(e) => this.updateLangKey(e.target.value)}
                    >
                        {PreferencesPrompt.getLanguageOptions()}
                    </select>
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
            />
        );
    }
}
