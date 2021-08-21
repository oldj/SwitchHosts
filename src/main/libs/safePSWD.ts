/**
 * safe-pswd
 * @author oldj
 * @blog https://oldj.net
 */

export default (pswd: string): string => {
  return (
    pswd
      .replace(/\\/g, '\\\\')
      //.replace(/'/g, "\\''")
      .replace(/'/g, '\\x27')
  )
}
