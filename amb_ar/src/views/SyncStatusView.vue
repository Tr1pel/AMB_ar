<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import {
  checkConnectivity,
  type ConnectivityState,
} from '@/shared/network/connectivity'
import type { SyncEntityType, SyncOperation, SyncQueueItem, SyncStatus } from '@/types/report'

const reportDraftStore = {
  syncQueueItems: [] as SyncQueueItem[],
  localStorageSummary: {
    reportCount: 0,
    photoCount: 0,
    documentCount: 0,
    pendingCount: 0,
    conflictCount: 0,
  },
  errorMessage: null as string | null,
  async loadSyncCenter(): Promise<void> {},
  async refreshSyncQueue(): Promise<void> {},
  getSyncStatusLabel(status: SyncStatus): string {
    const labels: Record<SyncStatus, string> = {
      synced: 'Синхронизировано',
      pending: 'В очереди',
      conflicted: 'Конфликт',
    }

    return labels[status]
  },
}
const connectivityState = ref<ConnectivityState>('checking')
const isRefreshingNetwork = ref(false)

let refreshIntervalId: number | undefined

const networkLabel = computed(() => {
  if (connectivityState.value === 'checking') {
    return 'Проверяем'
  }

  return connectivityState.value === 'online' ? 'Сеть доступна' : 'Локальный режим'
})

const networkHint = computed(() => {
  if (connectivityState.value === 'online') {
    return 'Очередь может быть отправлена фоновым процессом.'
  }

  return 'Можно продолжать создавать отчеты, данные уже сохранены на устройстве.'
})

const queueItems = computed(() => reportDraftStore.syncQueueItems)

onMounted(() => {
  void reportDraftStore.loadSyncCenter()
  void refreshNetworkState()

  window.addEventListener('online', handleNetworkChange)
  window.addEventListener('offline', handleNetworkChange)
  refreshIntervalId = window.setInterval(() => {
    void refreshNetworkState()
    void reportDraftStore.refreshSyncQueue()
  }, 30000)
})

onUnmounted(() => {
  window.removeEventListener('online', handleNetworkChange)
  window.removeEventListener('offline', handleNetworkChange)

  if (refreshIntervalId !== undefined) {
    window.clearInterval(refreshIntervalId)
  }
})

function handleNetworkChange(): void {
  void refreshNetworkState()
}

async function refreshNetworkState(): Promise<void> {
  isRefreshingNetwork.value = true
  connectivityState.value = 'checking'

  try {
    connectivityState.value = (await checkConnectivity()) ? 'online' : 'offline'
  } finally {
    isRefreshingNetwork.value = false
  }
}

function getEntityLabel(entityType: SyncEntityType): string {
  if (entityType === 'productPhoto') {
    return 'Фото'
  }

  if (entityType === 'generatedDocument') {
    return 'Документ'
  }

  return 'Отчет'
}

function getOperationLabel(operation: SyncOperation): string {
  return operation === 'delete' ? 'Удаление' : 'Сохранение'
}

function getQueueItemStatusClass(item: SyncQueueItem): string {
  return `status-pill--${item._syncStatus}`
}

function formatAttemptTime(timestamp: number): string {
  if (timestamp === Number.MAX_SAFE_INTEGER) {
    return 'Остановлено'
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}
</script>

<template>
  <main class="screen-page sync-page">
    <section class="sync-hero">
      <div>
        <p class="screen-kicker">Синхронизация</p>
        <h1 class="sync-hero__title">Локальные данные</h1>
        <p class="sync-hero__subtitle">{{ networkHint }}</p>
      </div>

      <button class="sync-hero__status" type="button" @click="refreshNetworkState">
        <span
          class="sync-hero__indicator"
          :class="`sync-hero__indicator--${connectivityState}`"
        />
        {{ isRefreshingNetwork ? 'Обновляем' : networkLabel }}
      </button>
    </section>

    <section class="sync-metrics" aria-label="Локальная сводка">
      <article class="sync-metric-card">
        <span>Отчеты</span>
        <strong>{{ reportDraftStore.localStorageSummary.reportCount }}</strong>
      </article>
      <article class="sync-metric-card">
        <span>Фото</span>
        <strong>{{ reportDraftStore.localStorageSummary.photoCount }}</strong>
      </article>
      <article class="sync-metric-card">
        <span>Документы</span>
        <strong>{{ reportDraftStore.localStorageSummary.documentCount }}</strong>
      </article>
      <article class="sync-metric-card sync-metric-card--accent">
        <span>Очередь</span>
        <strong>{{ reportDraftStore.localStorageSummary.pendingCount }}</strong>
      </article>
    </section>

    <section class="sync-panel app-card">
      <div class="sync-panel__header">
        <div>
          <p class="screen-kicker">Фоновые операции</p>
          <h2>Очередь отправки</h2>
        </div>
        <button class="secondary-button" type="button" @click="reportDraftStore.refreshSyncQueue">
          Обновить
        </button>
      </div>

      <div v-if="queueItems.length" class="sync-queue">
        <article v-for="item in queueItems" :key="item.id" class="sync-queue-item">
          <div>
            <h3>{{ getEntityLabel(item.entityType) }}</h3>
            <p>{{ getOperationLabel(item.operation) }} · попыток {{ item.retryCount }}</p>
          </div>
          <div class="sync-queue-item__meta">
            <span class="status-pill" :class="getQueueItemStatusClass(item)">
              {{ reportDraftStore.getSyncStatusLabel(item._syncStatus) }}
            </span>
            <span>{{ formatAttemptTime(item.nextAttemptAt) }}</span>
          </div>
        </article>
      </div>

      <p v-else class="empty-state">
        Очередь пуста. Локальные изменения синхронизированы или пока не созданы.
      </p>
    </section>

    <section class="sync-notes">
      <article class="sync-note app-card">
        <span class="sync-note__mark sync-note__mark--local" />
        <div>
          <h2>Локально</h2>
          <p>{{ reportDraftStore.localStorageSummary.reportCount }} отчетов на устройстве</p>
        </div>
      </article>
      <article class="sync-note app-card">
        <span class="sync-note__mark sync-note__mark--pending" />
        <div>
          <h2>Ожидают</h2>
          <p>{{ reportDraftStore.localStorageSummary.pendingCount }} операций в очереди</p>
        </div>
      </article>
      <article class="sync-note app-card">
        <span class="sync-note__mark sync-note__mark--conflict" />
        <div>
          <h2>Проверка</h2>
          <p>{{ reportDraftStore.localStorageSummary.conflictCount }} конфликтов</p>
        </div>
      </article>
    </section>

    <p v-if="reportDraftStore.errorMessage" class="error-message">
      {{ reportDraftStore.errorMessage }}
    </p>
  </main>
</template>

<style scoped>
.sync-page {
  gap: 16px;
}

.sync-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: start;
  border-radius: 0 0 8px 8px;
  margin: -18px -14px 0;
  padding: 24px 16px 18px;
  background: var(--color-primary);
  color: #ffffff;
}

.sync-hero .screen-kicker {
  color: rgba(255, 255, 255, 0.78);
}

.sync-hero__title {
  font-size: 2rem;
  font-weight: 900;
  line-height: 1.05;
}

.sync-hero__subtitle {
  margin-top: 8px;
  color: rgba(255, 255, 255, 0.76);
  font-size: 0.95rem;
}

.sync-hero__status {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 8px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
  font-size: 0.78rem;
  font-weight: 850;
  white-space: nowrap;
}

.sync-hero__indicator {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #fbbf24;
}

.sync-hero__indicator--online {
  background: #86efac;
}

.sync-hero__indicator--offline {
  background: #fca5a5;
}

.sync-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.sync-metric-card {
  display: grid;
  gap: 2px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px;
  background: var(--color-surface);
}

.sync-metric-card--accent {
  border-color: #f2c38b;
  background: var(--color-accent-soft);
}

.sync-metric-card span {
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 850;
  text-transform: uppercase;
}

.sync-metric-card strong {
  font-size: 1.42rem;
  font-weight: 900;
  line-height: 1.1;
}

.sync-panel {
  display: grid;
  gap: 12px;
  padding: 14px;
}

.sync-panel__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}

.sync-panel__header h2,
.sync-queue-item h3,
.sync-note h2 {
  color: var(--color-text);
  font-size: 1rem;
  font-weight: 900;
}

.sync-queue {
  display: grid;
  gap: 8px;
}

.sync-queue-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px;
  background: var(--color-surface-muted);
}

.sync-queue-item p,
.sync-queue-item__meta,
.sync-note p {
  color: var(--color-text-muted);
  font-size: 0.84rem;
}

.sync-queue-item__meta {
  display: grid;
  justify-items: end;
  gap: 6px;
}

.sync-notes {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.sync-note {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 12px;
}

.sync-note__mark {
  width: 12px;
  height: 42px;
  flex: 0 0 auto;
  border-radius: 8px;
  background: var(--color-primary);
}

.sync-note__mark--pending {
  background: var(--color-accent);
}

.sync-note__mark--conflict {
  background: var(--color-danger);
}

@media (min-width: 700px) {
  .sync-hero {
    margin: -26px -24px 0;
    padding: 34px 24px 24px;
  }
}

@media (max-width: 680px) {
  .sync-hero,
  .sync-panel__header,
  .sync-queue-item {
    grid-template-columns: 1fr;
  }

  .sync-hero__status,
  .sync-panel__header .secondary-button {
    width: 100%;
  }

  .sync-metrics,
  .sync-notes {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .sync-queue-item__meta {
    justify-items: start;
  }
}

@media (max-width: 460px) {
  .sync-metrics,
  .sync-notes {
    grid-template-columns: 1fr;
  }
}
</style>
