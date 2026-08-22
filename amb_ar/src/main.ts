import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { initializeI18n } from '@/shared/i18n'
import { startSyncEngine } from '@/shared/offline/sync-engine'
import { registerServiceWorker } from '@/shared/pwa/register-service-worker'
import { warmOfflineReportResources } from '@/shared/pwa/warm-offline-report-resources'

async function bootstrap(): Promise<void> {
  const app = createApp(App)

  app.use(createPinia())
  app.use(router)
  app.mount('#app')
  initializeI18n()

  startSyncEngine()
  await registerServiceWorker()
  warmOfflineReportResources()
}

void bootstrap()
