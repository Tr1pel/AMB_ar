import Dexie, { type Table } from 'dexie'

import type {
  Account,
  GeneratedDocument,
  ProductPhoto,
  ReportDraft,
  ReportTemplateOption,
  SyncQueueItem,
} from '@/types/report'

export class AppDatabase extends Dexie {
  accounts!: Table<Account, string>
  reportDrafts!: Table<ReportDraft, string>
  productPhotos!: Table<ProductPhoto, string>
  generatedDocuments!: Table<GeneratedDocument, string>
  reportTemplateOptions!: Table<ReportTemplateOption, string>
  syncQueue!: Table<SyncQueueItem, string>

  constructor() {
    super('amb-ar-offline-db')

    this.version(1).stores({
      reportDrafts:
        'id, productId, inspectorName, _syncStatus, _lastModified, _deletedAt, updatedAt',
      productPhotos: 'id, draftId, _syncStatus, _lastModified, _deletedAt, createdAt',
      syncQueue: 'id, entityType, entityId, operation, _syncStatus, nextAttemptAt, createdAt',
    })

    this.version(2).stores({
      reportDrafts:
        'id, status, productId, inspectorName, _syncStatus, _lastModified, _deletedAt, updatedAt',
      productPhotos:
        'id, draftId, category, _syncStatus, _lastModified, _deletedAt, createdAt, sortOrder',
      generatedDocuments:
        'id, draftId, _syncStatus, _lastModified, _deletedAt, generatedAt',
      syncQueue: 'id, entityType, entityId, operation, _syncStatus, nextAttemptAt, createdAt',
    })

    this.version(3).stores({
      accounts: 'id, loginNumber, role, isActive, _syncStatus, _lastModified, _deletedAt',
      reportDrafts:
        'id, status, workerAccountId, productId, inspectorName, _syncStatus, _lastModified, _deletedAt, updatedAt',
      productPhotos:
        'id, draftId, category, _syncStatus, _lastModified, _deletedAt, createdAt, sortOrder',
      generatedDocuments:
        'id, draftId, _syncStatus, _lastModified, _deletedAt, generatedAt',
      reportTemplateOptions:
        'id, field, value, sortOrder, _syncStatus, _lastModified, _deletedAt, updatedAt',
      syncQueue: 'id, entityType, entityId, operation, _syncStatus, nextAttemptAt, createdAt',
    })
  }
}

export const appDb = new AppDatabase()
