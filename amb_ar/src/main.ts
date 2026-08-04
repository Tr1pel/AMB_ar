import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { registerServiceWorker } from '@/shared/pwa/register-service-worker'

async function bootstrap(): Promise<void> {
  const app = createApp(App)

  app.use(createPinia())
  app.use(router)
  app.mount('#app')

  await registerServiceWorker()
}

void bootstrap()
