/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

import React from 'react';
import classnames from 'classnames';
import './searchbar.less';

export default class SearchBar extends React.Component {

    constructor(props) {
        super(props);

        this.state = {
            show: false,
            keyword: ''
        };

        this._t = null;

        SH_event.on('search_on', () => {
            this.setState({
                show: true
            }, () => {
                setTimeout(() => {
                    this.refs.keyword.focus();
                }, 100);
            });
        });

        SH_event.on('search_off', () => {
            this.clearSearch();
        });
    }

    clearSearch() {
        this.setState({
            show: false,
            keyword: ''
        });
        SH_event.emit('search', '')
    }

    doSearch(kw) {
        this.setState({
            keyword: kw
        });

        clearTimeout(this._t);
        this._t = setTimeout(() => {
            SH_event.emit('search', kw)
        }, 300);
    }

    onCancel() {
        SH_event.emit('cancel_search');
    }

    render() {
        if (!this.state.show) {
            return null;
        }
        return (
            <div id="sh-searchbar">
                <input
                    ref="keyword"
                    type="text"
                    placeholder="keyword"
                    value={this.state.keyword}
                    onChange={(e) => this.doSearch(e.target.value)}
                    onKeyDown={(e)=>(e.keyCode===27 && this.onCancel())}
                />
            </div>
        );
    }
}
