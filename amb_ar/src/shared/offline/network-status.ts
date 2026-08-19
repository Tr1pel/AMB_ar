type NetworkListener = (isOnline: boolean) => void

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''
const HEALTH_TIMEOUT_MS = 5_000
const listeners = new Set<NetworkListener>()
let confirmedOnline = navigator.onLine

export function isNetworkConfirmedOnline(): boolean {
  return confirmedOnline
}

export async function checkServerConnectivity(): Promise<boolean> {
  if (!navigator.onLine) {
    setConfirmedOnline(false)
    return false
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)

  try {
    const response = await fetch(`${API_BASE_URL}/api/health`, {
      method: 'HEAD',
      cache: 'no-store',
      credentials: 'include',
      signal: controller.signal,
    })
    setConfirmedOnline(response.ok)
    return response.ok
  } catch {
    setConfirmedOnline(false)
    return false
  } finally {
    clearTimeout(timeoutId)
  }
}

export function subscribeToNetworkStatus(listener: NetworkListener): () => void {
  listeners.add(listener)
  listener(confirmedOnline)
  return () => listeners.delete(listener)
}

function setConfirmedOnline(value: boolean): void {
  if (confirmedOnline === value) {
    return
  }

  confirmedOnline = value
  listeners.forEach((listener) => listener(value))
}
