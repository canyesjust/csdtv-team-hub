const ABLESIGN_BASE = 'https://api.ablesign.tv/api/v1'

export type AbleSignOrientation = 'landscape' | 'portrait' | 'reverse_landscape' | 'reverse_portrait'

export type AbleSignScreen = {
  id: number
  title: string
  description?: string | null
  orientation: AbleSignOrientation
  thumbnailURL?: string | null
  createdAt?: string
  heartbeatTime?: string | null
  onlineStatus?: 'online' | 'offline' | string
}

export type AbleSignWebApp = {
  id: number
  title: string
  url?: string | null
  zoom?: number
}

export type AbleSignPlaylistItemInput = {
  mediafileId?: number
  webAppId?: number
  sequenceNumber: number
  displayDuration: number
}

export type AbleSignSavePlaylistInput = {
  items: AbleSignPlaylistItemInput[]
  shufflePlay?: boolean
  enableWebappTransitions?: boolean
  enableImageTransitions?: boolean
}

type AbleSignSuccess<T> = {
  status: 'success'
  data: T
  totalItems?: number
  limit?: number
  offset?: number
}

type AbleSignError = {
  status: 'error'
  code: string
  message: string
}

export class AbleSignApiError extends Error {
  code: string
  status: number

  constructor(message: string, code: string, status: number) {
    super(message)
    this.name = 'AbleSignApiError'
    this.code = code
    this.status = status
  }
}

function requireAbleSignApiKey(): string {
  const key = process.env.ABLESIGN_API_KEY?.trim()
  if (!key) {
    throw new AbleSignApiError(
      'ABLESIGN_API_KEY is not configured on the server',
      'CONFIG_MISSING',
      500,
    )
  }
  return key
}

function ablesignHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${requireAbleSignApiKey()}`,
    Accept: 'application/json',
  }
  const workspaceId = process.env.ABLESIGN_WORKSPACE_ID?.trim()
  if (workspaceId) headers['Workspace-Id'] = workspaceId
  return headers
}

async function parseAbleSignResponse<T>(res: Response): Promise<T> {
  const text = await res.text()
  let json: AbleSignSuccess<T> | AbleSignError | null = null
  if (text) {
    try {
      json = JSON.parse(text) as AbleSignSuccess<T> | AbleSignError
    } catch {
      throw new AbleSignApiError(
        `AbleSign returned invalid JSON (${res.status})`,
        'INVALID_RESPONSE',
        res.status,
      )
    }
  }

  if (!res.ok) {
    const err = json && 'status' in json && json.status === 'error' ? json : null
    throw new AbleSignApiError(
      err?.message || `AbleSign request failed (${res.status})`,
      err?.code || 'REQUEST_FAILED',
      res.status,
    )
  }

  if (!json || !('status' in json) || json.status !== 'success') {
    throw new AbleSignApiError('AbleSign returned an unexpected response', 'INVALID_RESPONSE', res.status)
  }

  return json.data
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function asFetch<T>(
  method: string,
  path: string,
  body?: unknown,
  attempt = 0,
): Promise<T> {
  const headers = ablesignHeaders()
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${ABLESIGN_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  })

  const retryable = res.status === 429 || res.status >= 500
  if (retryable && attempt < 3) {
    await sleep(1000 * 2 ** attempt)
    return asFetch<T>(method, path, body, attempt + 1)
  }

  return parseAbleSignResponse<T>(res)
}

export async function listScreens(options: {
  limit?: number
  offset?: number
  onlineStatus?: string
} = {}): Promise<{ screens: AbleSignScreen[]; totalItems: number }> {
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 200)
  const offset = Math.max(options.offset ?? 0, 0)
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  })
  if (options.onlineStatus) params.set('onlineStatus', options.onlineStatus)

  const key = requireAbleSignApiKey()
  const workspaceId = process.env.ABLESIGN_WORKSPACE_ID?.trim()
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
  }
  if (workspaceId) headers['Workspace-Id'] = workspaceId

  const res = await fetch(`${ABLESIGN_BASE}/screens?${params}`, {
    headers,
    cache: 'no-store',
  })

  let attempt = 0
  let response = res
  while ((response.status === 429 || response.status >= 500) && attempt < 3) {
    await sleep(1000 * 2 ** attempt)
    attempt += 1
    response = await fetch(`${ABLESIGN_BASE}/screens?${params}`, { headers, cache: 'no-store' })
  }

  const text = await response.text()
  const json = text ? JSON.parse(text) as AbleSignSuccess<AbleSignScreen[]> | AbleSignError : null
  if (!response.ok || !json || json.status !== 'success') {
    const err = json && 'status' in json && json.status === 'error' ? json : null
    throw new AbleSignApiError(
      err?.message || `AbleSign list screens failed (${response.status})`,
      err?.code || 'REQUEST_FAILED',
      response.status,
    )
  }

  return {
    screens: json.data ?? [],
    totalItems: json.totalItems ?? json.data?.length ?? 0,
  }
}

export async function listAllScreens(): Promise<AbleSignScreen[]> {
  const all: AbleSignScreen[] = []
  let offset = 0
  const limit = 200
  for (;;) {
    const page = await listScreens({ limit, offset })
    all.push(...page.screens)
    if (all.length >= page.totalItems || page.screens.length < limit) break
    offset += limit
  }
  return all
}

export function getScreen(id: number) {
  return asFetch<AbleSignScreen>('GET', `/screens/${id}`)
}

export function registerScreen(input: {
  registrationCode: string
  title: string
  orientation?: AbleSignOrientation
  description?: string
}) {
  return asFetch<AbleSignScreen>('POST', '/screens', {
    registrationCode: input.registrationCode.trim().toUpperCase(),
    title: input.title,
    orientation: input.orientation || 'landscape',
    description: input.description,
  })
}

export function getScreenPlaylist(id: number) {
  return asFetch<{ items: Array<{ id: number; webAppId?: number; mediafileId?: number }> }>(
    'GET',
    `/screens/${id}/playlist`,
  )
}

export function saveScreenPlaylist(id: number, playlist: AbleSignSavePlaylistInput) {
  return asFetch<unknown>('PUT', `/screens/${id}/playlist`, playlist)
}

export function createWebApp(input: { title: string; url: string; description?: string }) {
  return asFetch<AbleSignWebApp>('POST', '/web_apps', input)
}

export function updateWebApp(id: number, input: { url?: string; title?: string; zoom?: number }) {
  return asFetch<AbleSignWebApp>('PUT', `/web_apps/${id}`, input)
}

export function listWebApps(options: { limit?: number; offset?: number } = {}) {
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 200)
  const offset = Math.max(options.offset ?? 0, 0)
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  return asFetch<AbleSignWebApp[]>('GET', `/web_apps?${params}`)
}

export function isAbleSignConfigured(): boolean {
  return Boolean(process.env.ABLESIGN_API_KEY?.trim())
}
