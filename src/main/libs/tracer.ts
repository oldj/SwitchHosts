import { configGet } from '@main/actions'
import { GET } from '@main/libs/request'
import { server_url } from '@common/constants'

class Tracer {
  data: string[]

  constructor() {
    this.data = []
  }

  add(action: string) {
    this.data.push(action)
  }

  async emit() {
    if (this.data.length === 0) return

    let send_usage_data = await configGet('send_usage_data')
    if (send_usage_data) {
      // Tracking is temporarily disabled.
      console.log('Tracking is temporarily disabled.')
      // console.log('send usage data...')
      // await GET(`${server_url}/api/tick/`, {
      //   sid: global.session_id,
      //   t: 1,
      //   a: this.data.join(','),
      // })
    }

    this.data = []
  }
}

export default Tracer
