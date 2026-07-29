import { getProductLabel } from '@/shared/constants/products'
import {
  fetchServerReports,
  fetchServerWorkerReports,
  uploadServerReport,
} from '@/shared/api/server-api'
import { appDb } from '@/shared/db/app-db'
import { createEntityId, createSyncMetadata } from '@/shared/sync/sync-metadata'
import { createSyncQueueItem, scheduleRetry } from '@/shared/sync/sync-queue'
import type {
  GeneratedDocument,
  ProductPhoto,
  ReportDescriptions,
  ReportDraft,
  ReportInspectionResults,
  ReportMainInfo,
  ReportPhotoCategory,
  ReportSampling,
  ReportSignatures,
  ReportTemperatureInfo,
} from '@/types/report'

export const QUALITY_REPORT_TEMPLATE_VERSION = 'quality-inspection-v1'

export interface CreateReportPhotoInput {
  file: File
  category: ReportPhotoCategory
  caption: string
  sortOrder: number
}

export interface CreateReportDraftInput {
  workerAccountId: string
  productId: string
  inspectorName: string
  mainInfo: ReportMainInfo
  temperatureInfo: ReportTemperatureInfo
  inspectionResults: ReportInspectionResults
  descriptions: ReportDescriptions
  expertConclusion: string
  sampling: ReportSampling
  signatures: ReportSignatures
  photos: CreateReportPhotoInput[]
}

export interface ReportDraftDetails {
  draft: ReportDraft
  photos: ProductPhoto[]
  documents: GeneratedDocument[]
}

export async function createReportDraft(
  input: CreateReportDraftInput,
): Promise<ReportDraftDetails> {
  const now = Date.now()
  const draftId = createEntityId('report')
  const productName = input.mainInfo.productName.trim() || getProductLabel(input.productId)
  const photos = input.photos.map<ProductPhoto>((photoInput) => ({
    id: createEntityId('photo'),
    draftId,
    category: photoInput.category,
    fileName: photoInput.file.name || 'quality-report-photo.jpg',
    mimeType: photoInput.file.type || 'application/octet-stream',
    size: photoInput.file.size,
    blob: photoInput.file,
    caption: photoInput.caption.trim(),
    sortOrder: photoInput.sortOrder,
    createdAt: now,
    ...createSyncMetadata('synced'),
  }))
  const draft: ReportDraft = {
    id: draftId,
    status: 'ready',
    templateVersion: QUALITY_REPORT_TEMPLATE_VERSION,
    workerAccountId: input.workerAccountId,
    productId: input.productId,
    productName,
    inspectorName: input.inspectorName.trim(),
    mainInfo: {
      ...input.mainInfo,
      productName,
    },
    temperatureInfo: input.temperatureInfo,
    inspectionResults: input.inspectionResults,
    descriptions: input.descriptions,
    expertConclusion: input.expertConclusion.trim(),
    sampling: input.sampling,
    signatures: input.signatures,
    photoIds: photos.map((photo) => photo.id),
    createdAt: now,
    updatedAt: now,
    ...createSyncMetadata('synced'),
  }
  const syncQueueItem = createSyncQueueItem('reportDraft', draft.id, 'upsert', { draft })

  await appDb.transaction(
    'rw',
    appDb.reportDrafts,
    appDb.productPhotos,
    appDb.syncQueue,
    async () => {
      await appDb.reportDrafts.put(draft)
      await appDb.syncQueue.put(syncQueueItem)

      if (photos.length) {
        await appDb.productPhotos.bulkPut(photos)
      }
    },
  )

  void syncReportDraftToServer(draft)

  return {
    draft,
    photos,
    documents: [],
  }
}

export async function listReportDrafts(adminAccountId?: string): Promise<ReportDraft[]> {
  if (adminAccountId) {
    try {
      const serverReports = await fetchServerReports(adminAccountId)

      if (serverReports.length) {
        await appDb.reportDrafts.bulkPut(serverReports)

        return serverReports
          .filter((draft) => draft._deletedAt === undefined && hasVisibleReportContent(draft))
          .sort((firstDraft, secondDraft) => secondDraft.updatedAt - firstDraft.updatedAt)
      }
    } catch {
      // Fall through to local cache when the server is offline.
    }
  }

  return appDb.reportDrafts
    .orderBy('updatedAt')
    .reverse()
    .filter((draft) => draft._deletedAt === undefined && hasVisibleReportContent(draft))
    .toArray()
}

export async function listWorkerReportDrafts(workerAccountId: string): Promise<ReportDraft[]> {
  try {
    const serverReports = await fetchServerWorkerReports(workerAccountId)

    if (serverReports.length) {
      await appDb.reportDrafts.bulkPut(serverReports)
    }
  } catch {
    // Fall through to the local cache when the server is offline.
  }

  const reports = await appDb.reportDrafts
    .where('workerAccountId')
    .equals(workerAccountId)
    .filter((draft) => draft._deletedAt === undefined && hasVisibleReportContent(draft))
    .toArray()

  return reports.sort((firstDraft, secondDraft) => secondDraft.updatedAt - firstDraft.updatedAt)
}

export async function getReportDraftDetails(draftId: string): Promise<ReportDraftDetails | null> {
  const draft = await appDb.reportDrafts.get(draftId)

  if (!draft || draft._deletedAt !== undefined) {
    return null
  }

  return {
    draft,
    photos: await getPhotosForDraft(draft.id),
    documents: await getGeneratedDocumentsForDraft(draft.id),
  }
}

export async function getPhotosForDraft(draftId: string): Promise<ProductPhoto[]> {
  return appDb.productPhotos
    .where('draftId')
    .equals(draftId)
    .filter((photo) => photo._deletedAt === undefined)
    .sortBy('sortOrder')
}

export async function getGeneratedDocumentsForDraft(draftId: string): Promise<GeneratedDocument[]> {
  return appDb.generatedDocuments
    .where('draftId')
    .equals(draftId)
    .filter((document) => document._deletedAt === undefined)
    .sortBy('generatedAt')
}

export async function saveGeneratedDocument(
  draftId: string,
  documentBlob: Blob,
  fileName: string,
  mimeType: string,
): Promise<GeneratedDocument> {
  const draft = await appDb.reportDrafts.get(draftId)

  if (!draft) {
    throw new Error('Report draft was not found')
  }

  const generatedAt = Date.now()
  const document: GeneratedDocument = {
    id: createEntityId('document'),
    draftId,
    templateVersion: draft.templateVersion,
    fileName,
    mimeType,
    blob: documentBlob,
    generatedAt,
    contentHash: await createBlobHash(documentBlob),
    ...createSyncMetadata('synced'),
  }
  const updatedDraft: ReportDraft = {
    ...draft,
    status: 'exported',
    updatedAt: generatedAt,
    ...createSyncMetadata('synced'),
  }

  await appDb.transaction(
    'rw',
    appDb.reportDrafts,
    appDb.generatedDocuments,
    async () => {
      await appDb.reportDrafts.put(updatedDraft)
      await appDb.generatedDocuments.put(document)
    },
  )

  return document
}

export async function softDeleteReportDraft(draftId: string): Promise<void> {
  await appDb.transaction(
    'rw',
    appDb.reportDrafts,
    appDb.productPhotos,
    appDb.generatedDocuments,
    async () => {
      const draft = await appDb.reportDrafts.get(draftId)

      if (!draft) {
        return
      }

      const deletedAt = Date.now()
      const deletedDraft: ReportDraft = {
        ...draft,
        status: 'archived',
        _deletedAt: deletedAt,
        updatedAt: deletedAt,
        ...createSyncMetadata('synced'),
      }
      const photos = await appDb.productPhotos.where('draftId').equals(draftId).toArray()
      const documents = await appDb.generatedDocuments.where('draftId').equals(draftId).toArray()
      const deletedPhotos = photos.map<ProductPhoto>((photo) => ({
        ...photo,
        _deletedAt: deletedAt,
        ...createSyncMetadata('synced'),
      }))
      const deletedDocuments = documents.map<GeneratedDocument>((document) => ({
        ...document,
        _deletedAt: deletedAt,
        ...createSyncMetadata('synced'),
      }))

      await appDb.reportDrafts.put(deletedDraft)
      await appDb.productPhotos.bulkPut(deletedPhotos)
      await appDb.generatedDocuments.bulkPut(deletedDocuments)
    },
  )
}

async function createBlobHash(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())

  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
}

function hasVisibleReportContent(draft: ReportDraft): boolean {
  return (
    Boolean(draft.productId) ||
    Boolean(draft.inspectorName.trim()) ||
    Boolean(draft.mainInfo?.orderNumber?.trim()) ||
    draft.photoIds.length > 0
  )
}

async function syncReportDraftToServer(draft: ReportDraft): Promise<void> {
  try {
    await uploadServerReport(draft)
    await appDb.syncQueue.delete(`reportDraft:${draft.id}:upsert`)
  } catch (error) {
    const queueItem = await appDb.syncQueue.get(`reportDraft:${draft.id}:upsert`)

    if (!queueItem) {
      return
    }

    await appDb.syncQueue.put(scheduleRetry(queueItem, getErrorMessage(error)))
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось отправить отчет на сервер'
}
