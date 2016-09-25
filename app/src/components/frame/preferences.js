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

        let choice_mode = SH_Agent.pref.get('choice_mode');
        if (!choice_mode || (choice_mode != 'multiple' && choice_mode != 'single')) {
            choice_mode = 'multiple';
        }

        this.state = {
            show: false,
            lang_key: SH_Agent.lang_key,
            after_cmd: SH_Agent.pref.get('after_cmd') || '',
            choice_mode: choice_mode
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

    updateLangKey(v) {
        SH_Agent.lang_key = v;
        SH_Agent.pref.set('user_language', v);
        this.setState({
            lange_key: v
        });
    }

    updateChoiceMode(v) {
        SH_Agent.pref.set('choice_mode', v);
        this.setState({
            choice_mode: v
        });
    }

    updateAfterCmd(v) {
        SH_Agent.pref.set('after_cmd', v);
        this.setState({
            after_cmd: v
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

    prefChoiceMode() {
        return (
            <div className="ln">
                <div className="title">{SH_Agent.lang.pref_choice_mode}</div>
                <div className="cnt">
                    <input type="radio" id="pref-choice-mode-single" name="choice_mode" value="single"
                           defaultChecked={this.state.choice_mode === 'single'}
                           onChange={(e) => this.updateChoiceMode(e.target.value)}
                    />
                    <label htmlFor="pref-choice-mode-single">{SH_Agent.lang.pref_choice_mode_single}</label>
                    <input type="radio" id="pref-choice-mode-multiple" name="choice_mode" value="multiple"
                           defaultChecked={this.state.choice_mode === 'multiple'}
                           onChange={(e) => this.updateChoiceMode(e.target.value)}
                    />
                    <label htmlFor="pref-choice-mode-multiple">{SH_Agent.lang.pref_choice_mode_multiple}</label>
                </div>
            </div>
        )
    }

    prefAfterCmd() {
        return (
            <div className="ln">
                <div className="title">{SH_Agent.lang.pref_after_cmd}</div>
                <div className="cnt">
                    <div className="inform">{SH_Agent.lang.pref_after_cmd_info}</div>
                    <textarea
                        name=""
                        defaultValue={this.state.after_cmd}
                        placeholder={SH_Agent.lang.pref_after_cmd_placeholder}
                        onChange={(e) => this.updateAfterCmd(e.target.value)}
                    />
                </div>
            </div>
        )
    }

    body() {
        return (
            <div ref="body">
                {/*<div className="title">{SH_Agent.lang.host_title}</div>*/}
                {/*<div className="cnt">*/}
                {/*</div>*/}
                {this.prefLanguage()}
                {this.prefChoiceMode()}
                {this.prefAfterCmd()}
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
