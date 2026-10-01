/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Override the API base URL, e.g. when the frontend is hosted separately. Defaults to "/api". */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
