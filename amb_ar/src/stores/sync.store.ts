import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { offlineDatabase } from '@/shared/offline/offline-database'
import {
  checkServerConnectivity,
  subscribeToNetworkStatus,
} from '@/shared/offline/network-status'
import { processSyncQueue } from '@/shared/offline/sync-engine'

export const useSyncStore = defineStore('sync', () => {
  const isOnline = ref(navigator.onLine)
  const pendingCount = ref(0)
  const pendingSubmissionCount = ref(0)
  const isSyncing = ref(false)
  const lastError = ref<string | null>(null)
  let initialized = false

  const statusLabel = computed(() => {
    if (!isOnline.value) return 'Нет связи · данные сохранены на устройстве'
    if (isSyncing.value && pendingSubmissionCount.value) return 'Отправляем отчёт…'
    if (pendingSubmissionCount.value) {
      return `Ожидают отправки: ${pendingSubmissionCount.value}`
    }
    return 'Нет отчётов к отправке'
  })

  async function initialize(): Promise<void> {
    if (initialized) return
    initialized = true

    subscribeToNetworkStatus((value) => {
      isOnline.value = value
    })
    window.addEventListener('amb-ar-sync-updated', refresh)
    await Promise.all([refresh(), checkServerConnectivity()])
  }

  async function refresh(): Promise<void> {
    const queue = await offlineDatabase.syncQueue.toArray()
    pendingCount.value = queue.length
    pendingSubmissionCount.value = queue.filter((item) => item.intent === 'submit').length
    isSyncing.value = queue.some((item) => item.status === 'processing')
    lastError.value = queue.find(
      (item) => item.intent === 'submit' && item.status === 'error',
    )?.lastError ?? null
  }

  async function synchronizeNow(): Promise<void> {
    isSyncing.value = true
    await processSyncQueue()
    await refresh()
  }

  return {
    isOnline,
    pendingCount,
    pendingSubmissionCount,
    isSyncing,
    lastError,
    statusLabel,
    initialize,
    refresh,
    synchronizeNow,
  }
})
