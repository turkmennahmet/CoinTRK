import type { ApiErrorBody } from './types'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }

  /** Upstream problems that are worth retrying automatically. */
  get isTransient(): boolean {
    return this.status >= 500 && this.code !== 'upstream_region_blocked'
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ApiErrorBody).code === 'string' &&
    typeof (value as ApiErrorBody).message === 'string'
  )
}

export async function apiGet<T>(
  path: string,
  params: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<T> {
  const query = new URLSearchParams(params).toString()
  const url = `${API_BASE}${path}${query ? `?${query}` : ''}`

  let response: Response
  try {
    response = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, 'network_error', 'Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.')
  }

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    if (isApiErrorBody(body)) throw new ApiError(response.status, body.code, body.message)
    throw new ApiError(response.status, 'http_error', `İstek başarısız oldu (HTTP ${response.status}).`)
  }
  return body as T
}
