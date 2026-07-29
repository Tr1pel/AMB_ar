import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')

if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  void navigator.serviceWorker
    .getRegistrations()
    .then((registrations) =>
      Promise.all(registrations.map((registration) => registration.unregister())),
    )
}

if (import.meta.env.DEV && 'caches' in window) {
  void caches.keys().then((cacheNames) => Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName))))
}
