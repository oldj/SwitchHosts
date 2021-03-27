/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import React from 'react'
import { CloseOutlined, DownOutlined, SearchOutlined, UpOutlined } from '@ant-design/icons'
import { Input, Button, Row, Col } from 'antd'
import Agent from '../Agent'
import styles from './SearchBar.less'

export default class SearchBar extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      kw: undefined,
      current: 0,
      count: 0,
      cursor: null,
      has_previous: false,
      has_next: false,
      pos: []
    }
  }

  gotoPrevious () {
    Agent.emit('search:goto_previous')
  }

  gotoNext () {
    Agent.emit('search:goto_next')
  }

  doSearch () {
    clearTimeout(this._t)
    this._t = setTimeout(() => {
      Agent.emit('search:kw', this.state.kw)
    }, 300)
  }

  searchEnd () {
    Agent.emit('search:kw', '')
    Agent.emit('search:end')
    this.setState({kw: undefined})
  }

  componentDidMount () {
    this.el_ipt.focus()
    Agent.on('search:state', d => this.setState({...d}))
    Agent.on('search:start', () => {
      let ipt = this.el_ipt
      ipt && ipt.focus()
    })
  }

  render () {
    let {kw, count, has_previous, has_next} = this.state
    let {lang} = this.props

    return (
      <div className={styles.root}>
        <Row gutter={16}>
          <Col span={12}>
            <Input
              ref={c => this.el_ipt = c}
              value={kw}
              onChange={e => this.setState({kw: e.target.value}, () => this.doSearch())}
              placeholder={lang.search_placeholder}
              allowClear={true}
              //onPressEnter={this.gotoNext.bind(this)}
              prefix={<SearchOutlined/>}
              onKeyDown={e => {
                let ne = e.nativeEvent
                if (ne.keyCode === 27) {
                  // esc
                  this.searchEnd()
                } else if (ne.keyCode === 13 && ne.shiftKey) {
                  this.gotoPrevious()
                } else if (ne.keyCode === 13) {
                  this.gotoNext()
                }
              }}
            />
          </Col>
          <Col span={4}>
            <Button.Group style={{minWidth: '60px'}}>
              <Button disabled={!has_previous} onClick={this.gotoPrevious.bind(this)} icon={<UpOutlined/>}/>
              <Button disabled={!has_next} onClick={this.gotoNext.bind(this)} icon={<DownOutlined/>}/>
            </Button.Group>
          </Col>
          <Col className={styles.count_wrapper} span={7}>
            {kw ? (
              <span>{count} {lang.matches}</span>
            ) : null}
          </Col>
          <Col span={1}>
            <CloseOutlined
              className={styles.btn_close}
              title={lang.close}
              onClick={this.searchEnd.bind(this)}
            />
          </Col>
        </Row>
      </div>
    )
  }
}
