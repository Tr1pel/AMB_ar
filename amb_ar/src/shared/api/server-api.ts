import type { GeneratedDocument, ProductPhoto, ReportDraft } from '@/types/report'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''
const API_TIMEOUT_MS = 5_000

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface SerializedProductPhoto extends Omit<ProductPhoto, 'blob'> {
  blobBase64: string
}

export interface SerializedGeneratedDocument extends Omit<GeneratedDocument, 'blob'> {
  blobBase64: string
}

export interface ServerReportDetails {
  draft: ReportDraft
  photos: SerializedProductPhoto[]
  documents: SerializedGeneratedDocument[]
}

export async function apiGet<T>(path: string, accountId?: string): Promise<T> {
  return apiRequest<T>(path, { method: 'GET', accountId })
}

export async function apiPost<T>(path: string, body?: unknown, accountId?: string): Promise<T> {
  return apiRequest<T>(path, { method: 'POST', body, accountId })
}

export async function apiPut<T>(path: string, body: unknown, accountId?: string): Promise<T> {
  return apiRequest<T>(path, { method: 'PUT', body, accountId })
}

export async function apiDelete(path: string, accountId?: string): Promise<void> {
  await apiRequest(path, { method: 'DELETE', accountId })
}

export async function serializePhoto(photo: ProductPhoto): Promise<SerializedProductPhoto> {
  const { blob, ...metadata } = photo

  return {
    ...metadata,
    blobBase64: await blobToBase64(blob),
  }
}

export function deserializePhoto(photo: SerializedProductPhoto): ProductPhoto {
  const { blobBase64, ...metadata } = photo

  return {
    ...metadata,
    blob: base64ToBlob(blobBase64, photo.mimeType),
  }
}

export async function serializeDocument(
  document: GeneratedDocument,
): Promise<SerializedGeneratedDocument> {
  const { blob, ...metadata } = document

  return {
    ...metadata,
    blobBase64: await blobToBase64(blob),
  }
}

export function deserializeDocument(document: SerializedGeneratedDocument): GeneratedDocument {
  const { blobBase64, ...metadata } = document

  return {
    ...metadata,
    blob: base64ToBlob(blobBase64, document.mimeType),
  }
}

async function apiRequest<T>(
  path: string,
  options: {
    method: HttpMethod
    body?: unknown
    accountId?: string
  },
): Promise<T> {
  if (!navigator.onLine) {
    throw new Error('Сервер недоступен. Нет подключения к сети.')
  }

  const headers = new Headers()

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  let response: Response
  const abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController.abort(), API_TIMEOUT_MS)

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method,
      headers,
      credentials: 'include',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: abortController.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Сервер не ответил вовремя. Повторите попытку.')
    }

    throw new Error('Сервер недоступен. Проверьте подключение и повторите попытку.')
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) {
    throw new Error(await getErrorMessage(response))
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

async function getErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string }
    return body.message ?? `Сервер вернул ошибку ${response.status}`
  } catch {
    return `Сервер вернул ошибку ${response.status}`
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const chunkSize = 0x8000
  let binary = ''

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }

  return btoa(binary)
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return new Blob([bytes], { type: mimeType })
}
