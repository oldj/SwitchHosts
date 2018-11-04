/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import React from 'react'
import { Icon } from 'antd'
import classnames from 'classnames'
import Agent from '../Agent'
import styles from './Buttons.less'

export default class Buttons extends React.Component {
    constructor (props) {
        super(props)

        this.state = {
            top_toggle_on: true,
            search_on: false
        }

        this.on_ids = []
    }

    static btnAdd () {
        Agent.emit('add_hosts')
    }

    btnToggle () {
        let doToggle = () => {
            let on = !this.state.top_toggle_on

            Agent.emit('top_toggle', on, this.on_ids, (e) => {
                if (e) {
                    console.log(e)
                    return
                }

                this.setState({
                    top_toggle_on: on
                }, () => {
                    if (this.state.top_toggle_on) {
                        this.on_ids = []
                    }
                })
            })
        }

        if (this.state.top_toggle_on) {
            Agent.emit('get_on_hosts', (ids) => {
                this.on_ids = ids
                doToggle()
            })
        } else {
            doToggle()
        }

    }

    btnSearch () {
        this.setState({
            search_on: !this.state.search_on
        }, () => {
            Agent.emit(this.state.search_on ? 'search:start' : 'search:end')
        })
    }

    cancelSearch () {
        this.setState({
            search_on: false
        }, () => {
            Agent.emit('search_off')
        })
    }

    componentDidMount () {
        Agent.on('to_search', () => {
            this.btnSearch()
        })

        Agent.on('esc', () => {
            if (this.state.search_on) {
                this.btnSearch()
            }
        })

        Agent.on('cancel_search', () => this.setState({search_on: false}))
    }

    render () {
        return (
            <div id="sh-buttons" className={styles.root}>
                <div className={styles.left}>
                    <a
                        className={styles['btn-add']}
                        href="#"
                        onClick={() => Buttons.btnAdd()}
                    >
                        <Icon type="plus" className="iconfont"/>
                    </a>
                </div>

                <div className={styles.right}>
                    <Icon
                        type="search"
                        className={classnames({
                            iconfont: 1,
                            on: this.state.search_on
                        })}
                        onClick={() => this.btnSearch()}
                    />
                    <i
                        className={classnames({
                            iconfont: 1,
                            'icon-switchon': this.state.top_toggle_on,
                            'icon-switchoff': !this.state.top_toggle_on
                        })}
                        onClick={() => this.btnToggle()}
                    />
                </div>
            </div>
        )
    }
}
