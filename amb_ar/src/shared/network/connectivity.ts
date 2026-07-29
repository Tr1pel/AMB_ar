export type ConnectivityState = 'checking' | 'online' | 'offline'

const HEALTH_CHECK_PATH = '/api/health'
const HEALTH_CHECK_TIMEOUT_MS = 2500

export async function checkConnectivity(): Promise<boolean> {
  if (!navigator.onLine) {
    return false
  }

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS)

  try {
    const response = await fetch(HEALTH_CHECK_PATH, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    })

    return response.ok
  } catch {
    return false
  } finally {
    window.clearTimeout(timeoutId)
  }
}
