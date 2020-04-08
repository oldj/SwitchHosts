/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

import React from 'react'
import lodash from 'lodash'
import { Checkbox, Row, Col, Radio, Select, Tabs } from 'antd'
import MyFrame from './MyFrame'
import classnames from 'classnames'
import Agent from '../Agent'
import version from '../../app/version'
import formatVersion from '../../app/libs/formatVersion'
import CodeMirror from 'react-codemirror'
import 'codemirror/mode/shell/shell'
import './PreferencesPrompt.less'

const RadioGroup = Radio.Group
const Option = Select.Option
const TabPane = Tabs.TabPane
const pref_keys = [
  'after_cmd', 'auto_launch', 'choice_mode', 'hide_at_launch', 'is_dock_icon_hidden',
  'user_language', 'send_usage_data', 'show_title_on_tray', 'theme',
  'env'
]

export default class PreferencesPrompt extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      show: false,
      user_language: 'en',
      after_cmd: '',
      choice_mode: 'multiple',
      auto_launch: false,
      hide_at_launch: false,
      lang_list: [],
      send_usage_data: true,
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
          console.log(pref)
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
      let prefs = lodash.pick(this.state, pref_keys)

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

  updatePref (obj) {
    this.setState(obj)
  }

  updateAutoLaunch (v) {
    this.setState({
      auto_launch: v
    })

    // todo set auto launch
  }

  prefLanguage () {
    let {lang} = this.props

    return (
      <div className="ln">
        <Row gutter={16}>
          <Col span={7}>
            <span>{lang.language}</span>
          </Col>
          <Col span={17}>
            <Select
              value={this.state.user_language}
              onChange={v => this.updatePref({user_language: v})}
              style={{minWidth: 120}}
            >
              {this.getLanguageOptions()}
            </Select>
          </Col>
        </Row>
      </div>
    )
  }

  prefTheme () {
    let {lang} = this.props
    let themes = ['light', 'dark']

    return (
      <div className="ln">
        <Row gutter={16}>
          <Col span={7}>
            <span>{lang.theme}</span>
          </Col>
          <Col span={17}>
            <Radio.Group
              value={this.state.theme || 'light'}
              onChange={e => this.updatePref({theme: e.target.value})}
            >
              {themes.map(t => (
                <Radio.Button value={t} key={t}>{lang['theme_' + t]}</Radio.Button>
              ))}
            </Radio.Group>
          </Col>
        </Row>
      </div>
    )
  }

  prefChoiceMode () {
    let {lang} = this.props

    return (
      <div className="ln">
        <Row gutter={16}>
          <Col span={7}>
            <span>{lang.pref_choice_mode}</span>
          </Col>
          <Col span={17}>
            <RadioGroup
              onChange={e => this.updatePref({choice_mode: e.target.value})}
              value={this.state.choice_mode}
            >
              <Radio.Button value="single">{lang.pref_choice_mode_single}</Radio.Button>
              <Radio.Button value="multiple">{lang.pref_choice_mode_multiple}</Radio.Button>
            </RadioGroup>
          </Col>
        </Row>
      </div>
    )
  }

  prefAfterCmd () {
    let {lang} = this.props
    let options = {
      mode: 'shell'
    }

    return (
      <div className="ln">
        <div>{lang.pref_after_cmd}</div>
        <div>
          <div className="inform">{lang.pref_after_cmd_info}</div>
          {/*<Input*/}
          {/*type="textarea"*/}
          {/*rows={8}*/}
          {/*defaultValue={this.state.after_cmd}*/}
          {/*placeholder={lang.pref_after_cmd_placeholder}*/}
          {/*onChange={(e) => this.updateAfterCmd(e.target.value)}*/}
          {/*/>*/}
          <CodeMirror
            className="pref-cm"
            value={this.state.after_cmd}
            onChange={v => this.updatePref({after_cmd: v})}
            options={options}
          />
        </div>
      </div>
    )
  }

  prefAutoLaunch () {
    let {lang} = this.props

    return (
      <div className="ln">
        <Checkbox
          value={this.state.auto_launch}
          onChange={(e) => this.updateAutoLaunch(e.target.checked)}
        >
          {lang.auto_launch}
        </Checkbox>
      </div>
    )
  }

  prefShowTitleOnTray () {
    let {lang} = this.props

    return (
      <div className="ln">
        <Checkbox
          checked={this.state.show_title_on_tray}
          onChange={(e) => this.updatePref({show_title_on_tray: e.target.checked})}
        >
          {lang.show_title_on_tray}
        </Checkbox>
      </div>
    )
  }

  prefMinimizeAtLaunch () {
    let {lang} = this.props

    return (
      <div className="ln">
        <Checkbox
          checked={this.state.hide_at_launch}
          onChange={(e) => this.updatePref({hide_at_launch: e.target.checked})}
        >
          {lang.hide_at_launch}
        </Checkbox>
      </div>
    )
  }

  prefAdvanced () {
    let {lang} = this.props

    return (
      <div className="ln">
        <div>{lang.pref_tab_usage_data_title}</div>
        <div className="inform">{lang.pref_tab_usage_data_desc}</div>
        <div>
          <Checkbox
            checked={this.state.send_usage_data}
            onChange={(e) => this.setState({send_usage_data: e.target.checked})}
          >
            {lang.pref_tab_usage_data_label}
          </Checkbox>
        </div>
      </div>
    )
  }

  static openDownloadPage () {
    Agent.pact('openUrl', require('../../app/configs').url_download)
  }

  body () {
    let {lang} = this.props
    let height = 240
    let is_mac = Agent.platform === 'darwin'

    return (
      <div ref="body">
        {/*<div className="title">{SH_Agent.lang.hosts_title}</div>*/}
        {/*<div className="cnt">*/}
        {/*</div>*/}
        <div
          className={classnames('current-version', {'update-found': this.state.update_found})}
        >
          <a
            href="#"
            onClick={PreferencesPrompt.openDownloadPage}
          >{formatVersion(version)}</a>
        </div>
        <Tabs
          defaultActiveKey="1"
          tabPosition="left"
          style={{minHeight: height}}
        >
          <TabPane tab={lang.pref_tab_general} key="1">
            <div style={{minHeight: height}}>
              {this.prefLanguage()}
              {this.prefTheme()}
              {this.prefChoiceMode()}
              {/*{this.prefAutoLaunch()}*/}
              {is_mac ? this.prefShowTitleOnTray() : null}
              {this.prefMinimizeAtLaunch()}
            </div>
          </TabPane>
          <TabPane tab={lang.pref_tab_custom_cmd} key="2">
            <div style={{minHeight: height}}>
              {this.prefAfterCmd()}
            </div>
          </TabPane>
          <TabPane tab={lang.pref_tab_advanced} key="3">
            <div style={{minHeight: height}}>
              {this.prefAdvanced()}
            </div>
          </TabPane>
        </Tabs>
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
