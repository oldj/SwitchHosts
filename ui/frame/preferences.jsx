/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

import React from 'react'
import { Checkbox, Input, Radio, Select } from 'antd'
import MyFrame from './frame'
import classnames from 'classnames'
import Agent from '../Agent'
import { version as current_version } from '../../app/version'
import formatVersion from '../../app/libs/formatVersion'
import './preferences.less'

const RadioGroup = Radio.Group
const Option = Select.Option
const pref_keys = ['after_cmd', 'auto_launch', 'choice_mode', 'hide_at_launch', 'is_dock_icon_hidden', 'user_language']

export default class PreferencesPrompt extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      show: false,
      user_language: '',
      after_cmd: '',
      choice_mode: 'multiple',
      auto_launch: false,
      hide_at_launch: false,
      lang_list: [],
      update_found: false // 发现新版本
    }

    Agent.pact('getLangList')
      .then(lang_list => this.setState({lang_list}))
  }

  componentDidMount () {
    Agent.on('show_preferences', () => {
      Agent.pact('getPref')
        .then(pref => {
          this.setState(Object.assign({}, pref, {show: true}))
        })
    })

    Agent.on('update_found', (v) => {
      console.log(v)
      this.setState({
        update_found: true
      })
    })
  }

  onOK () {
    this.setState({
      show: false
    }, () => {
      let prefs = {}
      let d = this.state
      pref_keys.map(k => {
        if (d.hasOwnProperty(k)) {
          prefs[k] = d[k]
        }
      })

      Agent.pact('setPref', prefs)
        .then(() => {
          setTimeout(() => {
            Agent.pact('relaunch')
          }, 200)
        })
    })
  }

  onCancel () {
    this.setState({
      show: false
    })
  }

  getLanguageOptions () {
    return this.state.lang_list.map(({key, name}, idx) => {
      return (
        <Option value={key} key={idx}>{name}</Option>
      )
    })
  }

  updateLangKey (v) {
    this.setState({user_language: v})
  }

  updateChoiceMode (v) {
    this.setState({
      choice_mode: v
    })
  }

  updateAfterCmd (v) {
    this.setState({
      after_cmd: v
    })
  }

  updateAutoLaunch (v) {
    this.setState({
      auto_launch: v
    })

    // todo set auto launch
  }

  updateMinimizeAtLaunch (v) {
    this.setState({
      hide_at_launch: v
    })
  }

  prefLanguage () {
    let {lang} = this.props

    return (
      <div className="ln">
        <div className="title">{lang.language}</div>
        <div className="cnt">
          <Select
            value={this.state.user_language || ''}
            onChange={v => this.updateLangKey(v)}
          >
            {this.getLanguageOptions()}
          </Select>

          <div className="inform">{lang.should_restart_after_change_language}</div>
        </div>
      </div>
    )
  }

  prefChoiceMode () {
    let {lang} = this.props

    return (
      <div className="ln">
        <div className="title">{lang.pref_choice_mode}</div>
        <div className="cnt">
          <RadioGroup
            onChange={e => this.updateChoiceMode(e.target.value)}
            value={this.state.choice_mode}
          >
            <Radio value="single">{lang.pref_choice_mode_single}</Radio>
            <Radio value="multiple">{lang.pref_choice_mode_multiple}</Radio>
          </RadioGroup>
        </div>
      </div>
    )
  }

  prefAfterCmd () {
    let {lang} = this.props

    return (
      <div className="ln">
        <div className="title">{lang.pref_after_cmd}</div>
        <div className="cnt">
          <div className="inform">{lang.pref_after_cmd_info}</div>
          <Input
            type="textarea"
            rows={4}
            defaultValue={this.state.after_cmd}
            placeholder={lang.pref_after_cmd_placeholder}
            onChange={(e) => this.updateAfterCmd(e.target.value)}
          />
        </div>
      </div>
    )
  }

  prefAutoLaunch () {
    let {lang} = this.props

    return (
      <div className="ln">
        <div className="title">{lang.auto_launch}</div>
        <div className="cnt">
          <Checkbox
            defaultValue={this.state.auto_launch}
            onChange={(e) => this.updateAutoLaunch(e.target.checked)}
          />
        </div>
      </div>
    )
  }

  prefMinimizeAtLaunch () {
    let {lang} = this.props

    return (
      <div className="ln">
        <div className="title">{lang.hide_at_launch}</div>
        <div className="cnt">
          <Checkbox
            defaultValue={this.state.hide_at_launch}
            onChange={(e) => this.updateMinimizeAtLaunch(e.target.checked)}
          />
        </div>
      </div>
    )
  }

  static openDownloadPage () {
    Agent.pact('openUrl', require('../../app/configs').url_download)
  }

  body () {
    return (
      <div ref="body">
        {/*<div className="title">{SH_Agent.lang.hosts_title}</div>*/}
        {/*<div className="cnt">*/}
        {/*</div>*/}
        <div
          className={classnames('current-version', {'update-found': this.state.update_found})}>
          <a href="#"
             onClick={PreferencesPrompt.openDownloadPage}>{formatVersion(current_version)}</a>
        </div>
        {this.prefLanguage()}
        {this.prefChoiceMode()}
        {this.prefAfterCmd()}
        {/*{this.prefAutoLaunch()}*/}
        {this.prefMinimizeAtLaunch()}
      </div>
    )
  }

  render () {
    let {lang} = this.props

    return (
      <MyFrame
        show={this.state.show}
        title={lang.preferences}
        body={this.body()}
        onOK={() => this.onOK()}
        onCancel={() => this.onCancel()}
        cancel_title={lang.cancel}
        okText={lang.set_and_relaunch_app}
        lang={lang}
      />
    )
  }
}
