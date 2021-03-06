/**
 * EditHosts
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import { BorderOuterOutlined, CheckCircleOutlined, CheckSquareOutlined, DeleteOutlined } from '@ant-design/icons'
import ItemIcon from '@renderer/components/ItemIcon'
import { actions, agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { HostsListObjectType, HostsWhereType } from '@root/common/data'
import * as hostsFn from '@root/common/hostsFn'
import { Button, Input, message, Modal, Radio, Select, Transfer } from 'antd'
import React, { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import styles from './EditHostsInfo.less'

const EditHostsInfo = () => {
  const { i18n } = useModel('useI18n')
  const { lang } = i18n
  const [hosts, setHosts] = useState<HostsListObjectType | null>(null)
  const { hosts_data, setList, getHostsData } = useModel('useHostsData')
  const [is_show, setIsShow] = useState(false)
  const [is_add, setIsAdd] = useState(true)
  const [is_refreshing, setIsRefreshing] = useState(false)

  const onCancel = () => {
    setHosts(null)
    setIsShow(false)
  }

  const onSave = async () => {
    if (is_add) {
      // add
      let h: HostsListObjectType = {
        ...(hosts || {}),
        id: uuidv4(),
      }
      let list: HostsListObjectType[] = [...hosts_data.list, h]
      await setList(list)
      agent.broadcast('select_hosts', h.id, 1000)

    } else if (hosts) {
      // edit
      let h: HostsListObjectType | undefined = hostsFn.findItemById(hosts_data.list, hosts.id)
      if (h) {
        Object.assign(h, hosts)
        await setList([...hosts_data.list])

      } else {
        // can not find by id
        setIsAdd(true)
        setTimeout(onSave, 300)
        return
      }

    } else {
      // unknow error
      alert('unknow error!')
    }

    setIsShow(false)
  }

  const onUpdate = async (kv: Partial<HostsListObjectType>) => {
    let obj: HostsListObjectType = Object.assign({}, hosts, kv)
    setHosts(obj)
  }

  useOnBroadcast('edit_hosts_info', (hosts?: HostsListObjectType) => {
    setHosts(hosts || null)
    setIsAdd(!hosts)
    setIsShow(true)
  })

  useOnBroadcast('add_new', () => {
    setHosts(null)
    setIsAdd(true)
    setIsShow(true)
  })

  const forRemote = (): React.ReactElement => {
    return (
      <>
        <div className={styles.ln}>
          <div className={styles.label}>URL</div>
          <div>
            <Input value={hosts?.url} onChange={e => onUpdate({ url: e.target.value })} placeholder={lang.url_placeholder}/>
          </div>
        </div>

        <div className={styles.ln}>
          <div className={styles.label}>{lang.auto_refresh}</div>
          <div>
            <Select
              value={hosts?.refresh_interval || 0}
              onChange={refresh_interval => onUpdate({ refresh_interval })}
              style={{ minWidth: 120 }}
            >
              <Select.Option value={0}>{lang.never}</Select.Option>
              <Select.Option value={60}>1 {lang.minute}</Select.Option>
              <Select.Option value={60 * 5}>5 {lang.minutes}</Select.Option>
              <Select.Option value={60 * 15}>15 {lang.minutes}</Select.Option>
              <Select.Option value={60 * 60}>1 {lang.hour}</Select.Option>
              <Select.Option value={60 * 60 * 24}>24 {lang.hours}</Select.Option>
              <Select.Option value={60 * 60 * 24 * 7}>7 {lang.days}</Select.Option>
            </Select>
          </div>
          {is_add ? null : (
            <div className={styles.refresh_info}>
              <span>{lang.last_refresh}{hosts?.last_refresh || 'N/A'}</span>
              <Button
                size="small"
                type="link"
                loading={is_refreshing}
                disabled={is_refreshing}
                onClick={() => {
                  if (!hosts) return

                  setIsRefreshing(true)
                  actions.refreshHosts(hosts.id)
                    .then(r => {
                      console.log(r)
                      if (!r.success) {
                        message.error(r.message || r.code || 'Error!')
                        return
                      }

                      message.success('ok')
                      onUpdate({ last_refresh: r.data.last_refresh })
                      agent.broadcast('reload_content', hosts.id)
                      return getHostsData()
                    })
                    .catch(e => {
                      console.log(e)
                      message.error(e.message)
                    })
                    .finally(() => setIsRefreshing(false))
                }}
              >{lang.refresh}</Button>
            </div>
          )}
        </div>
      </>
    )
  }

  const renderTransferItem = (item: HostsListObjectType): React.ReactElement => {
    return (
      <div>
        <ItemIcon where={item.where}/>
        <span style={{ marginLeft: 4 }}>{item.title || lang.untitled}</span>
      </div>
    )
  }

  const forGroup = (): React.ReactElement => {
    const list = hostsFn.flatten(hosts_data.list)

    let source_list: HostsListObjectType[] = list
      .filter(item => item.where === 'local' || item.where === 'remote')
      .map(item => {
        let o = { ...item }
        o.key = o.id
        return o
      })

    let target_keys: string[] = hosts?.include || []

    return (
      <div className={styles.ln}>
        <Transfer
          dataSource={source_list}
          targetKeys={target_keys}
          listStyle={{ width: '100%' }}
          oneWay={true}
          render={renderTransferItem}
          onChange={(next_target_keys) => {
            onUpdate({ include: next_target_keys })
          }}
        />
      </div>
    )
  }

  const forFolder = (): React.ReactElement => {
    return (
      <div className={styles.ln}>
        <div className={styles.label}>{lang.choice_mode}</div>
        <div>
          <Radio.Group
            value={hosts?.folder_mode || 0}
            onChange={e => onUpdate({ folder_mode: e.target.value })}
          >
            <Radio.Button value={0}><BorderOuterOutlined/> {lang.choice_mode_default}</Radio.Button>
            <Radio.Button value={1}><CheckCircleOutlined/> {lang.choice_mode_single}</Radio.Button>
            <Radio.Button value={2}><CheckSquareOutlined/> {lang.choice_mode_multiple}</Radio.Button>
          </Radio.Group>
        </div>
      </div>
    )
  }

  const wheres: HostsWhereType[] = ['local', 'remote', 'group', 'folder']

  const footer_buttons: React.ReactElement[] = [
    <Button key="cancel" onClick={onCancel}>{lang.btn_cancel}</Button>,
    <Button key="ok" onClick={onSave} type="primary">{lang.btn_ok}</Button>,
  ]
  if (!is_add) {
    footer_buttons.unshift(
      <Button
        key="delete"
        icon={<DeleteOutlined/>}
        danger
        style={{ float: 'left' }}
        disabled={!hosts}
        onClick={() => {
          if (hosts) {
            agent.broadcast('move_to_trashcan', hosts.id)
            onCancel()
          }
        }}
      >{lang.move_to_trashcan}</Button>,
    )
  }

  return (
    <Modal
      title={is_add ? lang.hosts_add : lang.hosts_edit}
      visible={is_show}
      okText={lang.btn_ok}
      cancelText={lang.btn_cancel}
      onCancel={onCancel}
      onOk={onSave}
      footer={footer_buttons}
    >
      <div className={styles.ln}>
        <div className={styles.label}>{lang.hosts_type}</div>
        <div>
          <Radio.Group
            disabled={!is_add}
            value={hosts?.where || 'local'}
            onChange={e => onUpdate({ where: e.target.value })}
          >
            {
              wheres.map(where => (
                <Radio.Button value={where} key={where}>
                  <ItemIcon where={where}/> {lang[where]}
                </Radio.Button>
              ))
            }
          </Radio.Group>
        </div>
      </div>

      <div className={styles.ln}>
        <div className={styles.label}>{lang.hosts_title}</div>
        <div>
          <Input value={hosts?.title} onChange={e => onUpdate({ title: e.target.value })}/>
        </div>
      </div>

      {hosts?.where === 'remote' ? forRemote() : null}
      {hosts?.where === 'group' ? forGroup() : null}
      {hosts?.where === 'folder' ? forFolder() : null}
    </Modal>
  )
}

export default EditHostsInfo
