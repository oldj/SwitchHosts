import { createMuiTheme } from '@material-ui/core'
import { getCssVar } from '@renderer/utils/css-var'

export const theme = createMuiTheme({
  props: {
    MuiButtonBase: {
      // disableRipple: true, // 在整个应用中禁用涟漪效果
    },
  },
  palette: {
    primary: {
      main: getCssVar('--swh-primary-color'),
    },
  },
})
