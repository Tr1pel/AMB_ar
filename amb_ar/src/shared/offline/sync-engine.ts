import {
  apiDelete,
  apiPost,
  apiPut,
  deserializeDocument,
  deserializePhoto,
  serializeDocument,
  serializePhoto,
  type SerializedGeneratedDocument,
  type ServerReportDetails,
} from '@/shared/api/server-api'
import {
  getLocalReportDetails,
  offlineDatabase,
  putReportDetails,
  type SyncQueueItem,
} from '@/shared/offline/offline-database'
import { checkServerConnectivity } from '@/shared/offline/network-status'
import type { GeneratedDocument, ProductPhoto, ReportDraft } from '@/types/report'

const INITIAL_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 5 * 60_000
const CONNECTIVITY_CHECK_INTERVAL_MS = 30_000
let processingPromise: Promise<void> | null = null
let started = false

export function startSyncEngine(): void {
  if (started) {
    return
  }

  started = true
  window.addEventListener('online', triggerSynchronization)
  window.addEventListener('focus', triggerSynchronization)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      triggerSynchronization()
    }
  })
  window.setInterval(triggerSynchronization, CONNECTIVITY_CHECK_INTERVAL_MS)
  void navigator.storage?.persist?.().catch(() => false)
  triggerSynchronization()
}

export function triggerSynchronization(): void {
  void processSyncQueue()
}

export function processSyncQueue(): Promise<void> {
  if (processingPromise) {
    return processingPromise
  }

  processingPromise = runSyncQueue().finally(() => {
    processingPromise = null
    notifySyncUpdated()
  })

  return processingPromise
}

async function runSyncQueue(): Promise<void> {
  if (!(await checkServerConnectivity())) {
    notifySyncUpdated()
    return
  }

  const now = Date.now()
  const items = await offlineDatabase.syncQueue
    .where('nextAttemptAt')
    .belowOrEqual(now)
    .sortBy('createdAt')

  for (const item of items) {
    await processQueueItem(item)
  }
}

async function processQueueItem(item: SyncQueueItem): Promise<void> {
  await offlineDatabase.syncQueue.update(item.id, {
    status: 'processing',
    lastError: undefined,
  })
  notifySyncUpdated()

  try {
    let completed = true

    if (item.intent === 'delete') {
      await apiDelete(`/api/reports/${encodeURIComponent(item.reportId)}`, item.accountId)
      await markDeletedReportSynced(item.reportId)
    } else {
      completed = await synchronizeReport(item)
    }

    const currentItem = await offlineDatabase.syncQueue.get(item.id)

    if (completed && currentItem?.updatedAt === item.updatedAt) {
      await offlineDatabase.syncQueue.delete(item.id)
      notifyReportSynchronized(item.reportId)
    } else if (currentItem) {
      await offlineDatabase.syncQueue.update(item.id, {
        status: 'pending',
        nextAttemptAt: Date.now(),
      })
    }
  } catch (error) {
    const retryCount = item.retryCount + 1
    const delay = calculateBackoff(retryCount)
    await offlineDatabase.syncQueue.update(item.id, {
      status: 'error',
      retryCount,
      nextAttemptAt: Date.now() + delay,
      updatedAt: Date.now(),
      lastError: getErrorMessage(error),
    })
  }

  notifySyncUpdated()
}

async function synchronizeReport(item: SyncQueueItem): Promise<boolean> {
  const localDetails = await getLocalReportDetails(item.reportId)

  if (!localDetails || localDetails.draft._deletedAt !== undefined) {
    throw new Error('Локальный отчет для синхронизации не найден')
  }

  const serverDetails = await apiPut<ServerReportDetails>(
    `/api/reports/${encodeURIComponent(item.reportId)}`,
    {
      draft: {
        ...localDetails.draft,
        status: 'draft',
        _deletedAt: undefined,
      },
      photos: await Promise.all(localDetails.photos.map(serializePhoto)),
    },
    item.accountId,
  )
  const serverPhotos = serverDetails.photos.map(deserializePhoto)
  const savedDraft = markEntitySynced(serverDetails.draft)
  const savedPhotos = serverPhotos.map(markEntitySynced)

  if (item.intent === 'save') {
    const currentDetails = await getLocalReportDetails(item.reportId)

    if (!currentDetails || currentDetails.draft._localVersion !== localDetails.draft._localVersion) {
      return false
    }

    await putReportDetails(savedDraft, savedPhotos, currentDetails.documents)
    return true
  }

  const latestDocument = [...localDetails.documents]
    .filter((document) => document._deletedAt === undefined)
    .sort((first, second) => first.generatedAt - second.generatedAt)
    .at(-1)

  if (!latestDocument) {
    throw new Error('Сначала сформируйте PDF отчета')
  }

  const serializedDocument = await apiPost<SerializedGeneratedDocument>(
    `/api/reports/${encodeURIComponent(item.reportId)}/documents`,
    await serializeDocument(latestDocument),
    item.accountId,
  )
  const savedDocument = markEntitySynced(deserializeDocument(serializedDocument))
  const submittedDetails = await apiPost<ServerReportDetails>(
    `/api/reports/${encodeURIComponent(item.reportId)}/submit`,
    undefined,
    item.accountId,
  )

  await putReportDetails(
    markEntitySynced(submittedDetails.draft),
    submittedDetails.photos.map(deserializePhoto).map(markEntitySynced),
    mergeDocuments(
      submittedDetails.documents.map(deserializeDocument).map(markEntitySynced),
      savedDocument,
    ),
  )
  return true
}

function mergeDocuments(
  documents: GeneratedDocument[],
  savedDocument: GeneratedDocument,
): GeneratedDocument[] {
  const byId = new Map(documents.map((document) => [document.id, document]))
  byId.set(savedDocument.id, savedDocument)
  return [...byId.values()].sort((first, second) => first.generatedAt - second.generatedAt)
}

async function markDeletedReportSynced(reportId: string): Promise<void> {
  const details = await getLocalReportDetails(reportId)

  if (!details) {
    return
  }

  await putReportDetails(markEntitySynced(details.draft), details.photos, details.documents)
}

function markEntitySynced<T extends ReportDraft | ProductPhoto | GeneratedDocument>(entity: T): T {
  return {
    ...entity,
    _syncStatus: 'synced',
  }
}

function calculateBackoff(retryCount: number): number {
  const exponentialDelay = Math.min(INITIAL_BACKOFF_MS * 2 ** retryCount, MAX_BACKOFF_MS)
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1)

  return Math.max(INITIAL_BACKOFF_MS, Math.floor(exponentialDelay + jitter))
}

function notifySyncUpdated(): void {
  window.dispatchEvent(new CustomEvent('amb-ar-sync-updated'))
}

function notifyReportSynchronized(reportId: string): void {
  window.dispatchEvent(
    new CustomEvent('amb-ar-report-synchronized', { detail: { reportId } }),
  )
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось синхронизировать отчет'
}
