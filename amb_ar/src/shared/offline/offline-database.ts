import Dexie, { type EntityTable } from 'dexie'

import type {
  Account,
  DocumentTemplate,
  GeneratedDocument,
  ProductPhoto,
  ReportDraft,
  ReportTemplateOption,
} from '@/types/report'

export type SyncQueueIntent = 'save' | 'submit' | 'delete'
export type SyncQueueStatus = 'pending' | 'processing' | 'error'

export interface SyncQueueItem {
  id: string
  reportId: string
  accountId: string
  intent: SyncQueueIntent
  status: SyncQueueStatus
  retryCount: number
  nextAttemptAt: number
  createdAt: number
  updatedAt: number
  lastError?: string
}

class OfflineDatabase extends Dexie {
  reports!: EntityTable<ReportDraft, 'id'>
  photos!: EntityTable<ProductPhoto, 'id'>
  documents!: EntityTable<GeneratedDocument, 'id'>
  documentTemplates!: EntityTable<DocumentTemplate, 'id'>
  reportTemplateOptions!: EntityTable<ReportTemplateOption, 'id'>
  accounts!: EntityTable<Account, 'id'>
  syncQueue!: EntityTable<SyncQueueItem, 'id'>

  constructor() {
    super('amb-ar-offline')

    this.version(1).stores({
      reports: 'id, workerAccountId, status, updatedAt, _syncStatus, _deletedAt',
      photos: 'id, draftId, sortOrder, _syncStatus, _deletedAt',
      documents: 'id, draftId, generatedAt, _syncStatus, _deletedAt',
      documentTemplates: 'id, status, updatedAt, _syncStatus, _deletedAt',
      reportTemplateOptions: 'id, field, sortOrder, _syncStatus, _deletedAt',
      accounts: 'id, loginNumber, role, updatedAt, _deletedAt',
      syncQueue: 'id, reportId, accountId, intent, status, nextAttemptAt, updatedAt',
    })

    this.version(2)
      .stores({
        reports: 'id, workerAccountId, status, updatedAt, _syncStatus, _deletedAt',
        photos: 'id, draftId, sortOrder, _syncStatus, _deletedAt',
        documents: 'id, draftId, generatedAt, _syncStatus, _deletedAt',
        documentTemplates: 'id, status, updatedAt, _syncStatus, _deletedAt',
        reportTemplateOptions: 'id, field, sortOrder, _syncStatus, _deletedAt',
        accounts: 'id, loginNumber, role, updatedAt, _deletedAt',
        syncQueue: 'id, reportId, accountId, intent, status, nextAttemptAt, updatedAt',
      })
      .upgrade(async (transaction) => {
        await transaction.table('documentTemplates').delete('document-template-quality-standard')
      })
  }
}

export const offlineDatabase = new OfflineDatabase()

export async function cacheAccount(account: Account): Promise<void> {
  await offlineDatabase.accounts.put(toPlainData(account))
  localStorage.setItem('amb-ar-current-account-id', account.id)
}

export async function getCachedCurrentAccount(): Promise<Account | null> {
  const accountId = localStorage.getItem('amb-ar-current-account-id')

  if (!accountId) {
    return null
  }

  return (await offlineDatabase.accounts.get(accountId)) ?? null
}

export function clearCachedCurrentAccount(): void {
  localStorage.removeItem('amb-ar-current-account-id')
}

export async function synchronizeDocumentTemplateCache(templates: DocumentTemplate[]): Promise<void> {
  await offlineDatabase.transaction('rw', offlineDatabase.documentTemplates, async () => {
    const serverTemplateIds = new Set(templates.map((template) => template.id))
    const staleTemplates = (await offlineDatabase.documentTemplates.toArray())
      .filter((template) => !serverTemplateIds.has(template.id))
      .map((template) => ({
        ...template,
        updatedAt: Date.now(),
        _deletedAt: Date.now(),
      }))

    await offlineDatabase.documentTemplates.bulkPut(staleTemplates.map(toPlainData))
    await offlineDatabase.documentTemplates.bulkPut(templates.map(toPlainData))
  })
}

export async function cacheReportTemplateOptions(options: ReportTemplateOption[]): Promise<void> {
  await offlineDatabase.transaction('rw', offlineDatabase.reportTemplateOptions, async () => {
    await offlineDatabase.reportTemplateOptions.bulkPut(options.map(toPlainData))
  })
}

export async function putReportDetails(
  draft: ReportDraft,
  photos: ProductPhoto[],
  documents: GeneratedDocument[],
): Promise<void> {
  await offlineDatabase.transaction(
    'rw',
    [offlineDatabase.reports, offlineDatabase.photos, offlineDatabase.documents],
    async () => {
      await offlineDatabase.reports.put(toPlainData(draft))

      const existingPhotoIds = await offlineDatabase.photos.where('draftId').equals(draft.id).primaryKeys()
      const nextPhotoIds = new Set(photos.map((photo) => photo.id))
      await offlineDatabase.photos.bulkDelete(existingPhotoIds.filter((id) => !nextPhotoIds.has(id)))
      await offlineDatabase.photos.bulkPut(photos.map(toPlainPhoto))

      const existingDocumentIds = await offlineDatabase.documents
        .where('draftId')
        .equals(draft.id)
        .primaryKeys()
      const nextDocumentIds = new Set(documents.map((document) => document.id))
      await offlineDatabase.documents.bulkDelete(
        existingDocumentIds.filter((id) => !nextDocumentIds.has(id)),
      )
      await offlineDatabase.documents.bulkPut(
        documents.map(toPlainDocument),
      )
    },
  )
}

export async function getLocalReportDetails(reportId: string): Promise<{
  draft: ReportDraft
  photos: ProductPhoto[]
  documents: GeneratedDocument[]
} | null> {
  const draft = await offlineDatabase.reports.get(reportId)

  if (!draft) {
    return null
  }

  const [photos, documents] = await Promise.all([
    offlineDatabase.photos.where('draftId').equals(reportId).sortBy('sortOrder'),
    offlineDatabase.documents.where('draftId').equals(reportId).sortBy('generatedAt'),
  ])

  return { draft, photos, documents }
}

export async function enqueueReportSync(
  reportId: string,
  accountId: string,
  intent: SyncQueueIntent,
): Promise<void> {
  const id = `${accountId}:${reportId}`
  const existing = await offlineDatabase.syncQueue.get(id)
  const now = Date.now()
  const nextIntent = getStrongerIntent(existing?.intent, intent)

  await offlineDatabase.syncQueue.put({
    id,
    reportId,
    accountId,
    intent: nextIntent,
    status: 'pending',
    retryCount: 0,
    nextAttemptAt: now,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  })
}

function getStrongerIntent(
  current: SyncQueueIntent | undefined,
  incoming: SyncQueueIntent,
): SyncQueueIntent {
  if (incoming === 'delete' || current === 'delete') {
    return 'delete'
  }

  if (incoming === 'submit' || current === 'submit') {
    return 'submit'
  }

  return 'save'
}

function toPlainData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function toPlainPhoto(photo: ProductPhoto): ProductPhoto {
  const { blob, ...metadata } = photo

  return { ...toPlainData(metadata), blob }
}

function toPlainDocument(document: GeneratedDocument): GeneratedDocument {
  const { blob, ...metadata } = document

  return { ...toPlainData(metadata), blob }
}
