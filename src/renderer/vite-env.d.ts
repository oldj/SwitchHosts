interface ImportMetaEnv {
  readonly VITE_PLATFORM?: 'darwin' | 'win32' | 'linux'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
