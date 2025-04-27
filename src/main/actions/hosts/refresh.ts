/**
 * refreshHosts
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { getHostsContent, setHostsContent, setList } from '@main/actions/index'
import { broadcast } from '@main/core/agent'

import { swhdb } from '@main/data'
import { GET } from '@main/libs/request'
import { IHostsListObject, IOperationResult } from '@common/data'
import events from '@common/events'
import * as hostsFn from '@common/hostsFn'
import dayjs from 'dayjs'
import * as fs from 'fs'
import { URL } from 'url'

export default async (hosts_id: string): Promise<IOperationResult> => {
  let list = await swhdb.list.tree.all()
  let hosts: IHostsListObject | undefined = hostsFn.findItemById(list, hosts_id)

  if (!hosts) {
    return {
      success: false,
      code: 'invalid_id',
    }
  }

  let { type, url, token, accessType } = hosts

  if (type !== 'remote') {
    return {
      success: false,
      code: 'not_remote',
    }
  }

  if (!url) {
    return {
      success: false,
      code: 'no_url',
    }
  }

  let old_content: string = await getHostsContent(hosts.id)
  let new_content: string
  try {
    console.log(`-> refreshHosts URL: "${url}"`)
    if (url.startsWith('file://')) {
      new_content = await fs.promises.readFile(new URL(url), 'utf-8')
    } else {
      if(token) {
        const urlObj = new URL(url);
        const protocol = urlObj.protocol;
        const hostname = urlObj.hostname;
        const pathname = urlObj.pathname;
        const ref = urlObj.searchParams.get('ref');
        let resp: any = null
        switch (accessType) {
          default:
          case 0:
            const newUrl = `${protocol}//${token}@${hostname}${pathname}`;
            resp = await GET(newUrl);
            new_content = resp.data
            break;
          case 1:
            let newUrl1 = '';
            if(ref) {
              newUrl1 = `${protocol}//${hostname}${pathname}?access_token=${token}&ref=${ref}`;
            } else {
              newUrl1 = `${protocol}//${hostname}${pathname}?access_token=${token}`;
            }
            resp = await GET(newUrl1);
            console.log('newUrl1:', newUrl1);
            if (resp && resp.data.content) {
              // Base64 解码
              const decodedContent = Buffer.from(resp.data.content, 'base64').toString('utf-8');
              new_content = decodedContent;
            } else {
              console.error('resp1.content is undefined or null');
            }
            break;
          case 2:
            resp = await GET(url, null, {
              headers: {
                'PRIVATE-TOKEN': token,
              },
            });
            new_content = resp.data
            break;
        }
      } else {
        let resp: any = null
        resp = await GET(url)
        new_content = resp.data
      }
    }
  } catch (e: any) {
    console.error(e)
    return {
      success: false,
      message: e.message,
    }
  }

  hosts.last_refresh = dayjs().format('YYYY-MM-DD HH:mm:ss')
  hosts.last_refresh_ms = new Date().getTime()

  await setList(list)

  if (old_content !== new_content) {
    await setHostsContent(hosts_id, new_content)
    broadcast(events.hosts_refreshed, hosts)
    broadcast(events.hosts_content_changed, hosts_id)
  }

  return {
    success: true,
    data: { ...hosts },
  }
}
