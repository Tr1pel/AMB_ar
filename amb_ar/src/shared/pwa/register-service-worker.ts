export async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) {
    return
  }

  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  } catch (error) {
    console.warn('Не удалось зарегистрировать кеш оболочки приложения', error)
  }
}
