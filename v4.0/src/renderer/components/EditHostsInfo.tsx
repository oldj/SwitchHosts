/**
 * EditHosts
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import ItemIcon from '@renderer/components/ItemIcon'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { HostsListObjectType } from '@root/common/data'
import { Modal, Radio } from 'antd'
import React, { useState } from 'react'
import styles from './EditHostsInfo.less'

interface Props {
  hosts?: HostsListObjectType | null;
}

const EditHostsInfo = (props: Props) => {
  const { i18n } = useModel('useI18n')
  const { lang } = i18n
  const [hosts, setHosts] = useState<HostsListObjectType | null>(props.hosts || null)
  const [is_show, setIsShow] = useState(false)
  const is_add = !props.hosts

  const onCancel = async () => {
    setHosts(null)
    setIsShow(false)
  }

  const onSave = async () => {

  }

  const onUpdate = async (kv: Partial<HostsListObjectType>) => {
    let obj: HostsListObjectType = Object.assign({}, hosts, kv)
    setHosts(obj)
  }

  useOnBroadcast('edit_hosts_info', (hosts?: HostsListObjectType) => {
    setHosts(hosts || null)
    setIsShow(true)
  })

  useOnBroadcast('add_new', () => {
    setHosts(null)
    setIsShow(true)
  })

  const forRemote = (): React.ReactElement => {
    return (
      <>
        <div className={styles.ln}>
          url
        </div>

        <div className={styles.ln}>
          refresh
        </div>
      </>
    )
  }

  return (
    <Modal
      title={is_add ? lang.hosts_add : lang.hosts_edit}
      visible={is_show}
      okText={lang.btn_ok}
      cancelText={lang.btn_cancel}
    >
      <div className={styles.ln}>
        <div className={styles.label}>{lang.hosts_type}</div>
        <div>
          <Radio.Group>
            <Radio.Button value="local">
              <ItemIcon where="local"/> {lang.local}
            </Radio.Button>
          </Radio.Group>
        </div>
      </div>
    </Modal>
  )
}

export default EditHostsInfo
