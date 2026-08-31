import {
  apiDelete,
  apiGet,
  apiPost,
  deserializeDocument,
  deserializePhoto,
  type SerializedGeneratedDocument,
  type SerializedProductPhoto,
  type ServerReportDetails,
} from '@/shared/api/server-api'
import { getProductLabel } from '@/shared/constants/products'
import {
  enqueueReportSync,
  getLocalReportDetails,
  offlineDatabase,
  putReportDetails,
} from '@/shared/offline/offline-database'
import { triggerSynchronization } from '@/shared/offline/sync-engine'
import { photoCompressionService } from '@/shared/photos/photo-compression-service'
import {
  getActiveDocumentTemplate,
  getDocumentTemplateById,
} from '@/shared/repositories/document-template-repository'
import { createEntityId, createSyncMetadata } from '@/shared/sync/sync-metadata'
import type {
  DocumentTemplate,
  GeneratedDocument,
  DocumentTemplateFieldValue,
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

export interface CreateReportPhotoInput {
  id?: string
  file: File
  templateFieldId?: string
  category: ReportPhotoCategory
  caption: string
  sortOrder: number
}

export interface CreateReportDraftInput {
  templateId?: string
  workerAccountId: string
  productId: string
  inspectorName: string
  mainInfo: ReportMainInfo
  temperatureInfo: ReportTemperatureInfo
  inspectionResults: ReportInspectionResults
  descriptions: ReportDescriptions
  expertConclusion: string
  customFieldValues?: Record<string, DocumentTemplateFieldValue>
  sampling: ReportSampling
  signatures: ReportSignatures
  photos: CreateReportPhotoInput[]
}

export interface SaveReportDraftOptions {
  draftId?: string
  status?: ReportDraft['status']
  accountId?: string
}

export interface ReportDraftDetails {
  draft: ReportDraft
  photos: ProductPhoto[]
  documents: GeneratedDocument[]
}

export async function createReportDraftFromTemplate(
  templateId: string,
  workerAccountId: string,
  inspectorName: string,
): Promise<ReportDraftDetails> {
  return createReportDraft(
    {
      templateId,
      workerAccountId,
      productId: '',
      inspectorName,
      mainInfo: {
        orderNumber: '',
        zost: '',
        shipper: '',
        trailerNumber: '',
        placeOfSurvey: '',
        productName: '',
        packageName: '',
        plu: '',
        openingDate: '',
        surveyDate: '',
        packingKind: '',
        boxMarking: '',
      },
      temperatureInfo: {
        storageTemperature: '',
        pulpTemperature: '',
        temperatureViolation: 'Нет',
        sealNumber: '',
        thermographPresence: 'Нет',
        thermographViolation: 'Нет',
      },
      inspectionResults: {
        firstCategoryPercent: '',
        firstCategoryNonStandardPercent: '',
        secondCategoryNonStandardPercent: '',
        wastePercent: '',
        density: '',
        brix: '',
        caliber: '',
        caliberPassportMatch: 'Да',
        caliberMismatch: '',
        variety: '',
        varietyPassportMatch: 'Да',
      },
      descriptions: {
        secondClassDefects: '',
        waste: '',
        caliberMismatch: '',
      },
      expertConclusion: '',
      customFieldValues: {},
      sampling: {
        palletCount: 26,
        sampleCount: 15,
        seed: `${Date.now()}`,
        points: [],
      },
      signatures: {
        reportIssuedDate: '',
        expertName: '',
        retailRepresentativeName: '',
      },
      photos: [],
    },
    { status: 'draft', accountId: workerAccountId },
  )
}

export async function createReportDraft(
  input: CreateReportDraftInput,
  options: SaveReportDraftOptions = {},
): Promise<ReportDraftDetails> {
  const now = Date.now()
  const draftId = options.draftId ?? createEntityId('report')
  const accountId = options.accountId ?? input.workerAccountId
  const existingDetails = options.draftId
    ? await getReportDraftDetails(options.draftId, accountId)
    : null
  const existingDraft = existingDetails?.draft

  const requestedTemplate = input.templateId
    ? await getDocumentTemplateById(input.templateId)
    : null
  const selectedTemplate =
    requestedTemplate?.status === 'active'
      ? requestedTemplate
      : existingDraft
        ? null
        : await getActiveDocumentTemplate()
  const existingPhotosById = new Map(
    (existingDetails?.photos ?? []).map((photo) => [photo.id, photo]),
  )
  const reportTemplate = selectedTemplate ?? existingDraft?.templateSnapshot
  const hasProductField = templateHasProductField(reportTemplate)
  const productId = hasProductField ? input.productId : ''
  const selectedProductName = input.mainInfo.productName.trim() || getProductLabel(productId)
  const productName =
    productId && selectedProductName ? selectedProductName : (reportTemplate?.name ?? '')
  const photos = await Promise.all(
    input.photos.map<Promise<ProductPhoto>>(async (photoInput) => {
      const existingPhoto = existingPhotosById.get(photoInput.id ?? '')
      const compressedPhoto = existingPhoto
        ? {
            blob: existingPhoto.blob,
            mimeType: existingPhoto.mimeType,
            size: existingPhoto.size,
          }
        : await photoCompressionService.compress(photoInput.file)

      return {
        id: photoInput.id ?? createEntityId('photo'),
        draftId,
        ...(photoInput.templateFieldId ? { templateFieldId: photoInput.templateFieldId } : {}),
        category: photoInput.category,
        fileName: photoInput.file.name || 'quality-report-photo.jpg',
        mimeType: compressedPhoto.mimeType,
        size: compressedPhoto.size,
        blob: compressedPhoto.blob,
        caption: photoInput.caption.trim(),
        sortOrder: photoInput.sortOrder,
        createdAt: existingPhoto?.createdAt ?? now,
        ...createSyncMetadata('pending'),
      }
    }),
  )
  const draft: ReportDraft = {
    id: draftId,
    reportNumber: existingDraft?.reportNumber ?? createLocalReportNumber(draftId),
    status: options.status ?? 'draft',
    templateId: selectedTemplate?.id ?? existingDraft?.templateId,
    templateSnapshot: selectedTemplate
      ? {
          templateId: selectedTemplate.id,
          name: selectedTemplate.name,
          description: selectedTemplate.description,
          translations: cloneTemplateData(selectedTemplate.translations),
          inputSchema: cloneTemplateData(selectedTemplate.inputSchema),
          renderSpec: cloneTemplateData(selectedTemplate.renderSpec),
          sections: cloneTemplateData(selectedTemplate.sections),
        }
      : existingDraft?.templateSnapshot,
    workerAccountId: input.workerAccountId,
    productId,
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
    customFieldValues: { ...input.customFieldValues },
    sampling: input.sampling,
    signatures: input.signatures,
    photoIds: photos.map((photo) => photo.id),
    createdAt: existingDraft?.createdAt ?? now,
    updatedAt: now,
    ...createSyncMetadata('pending'),
  }
  await putReportDetails(draft, photos, [])
  await enqueueReportSync(draftId, accountId, 'save')
  triggerSynchronization()

  return { draft, photos, documents: [] }
}

function createLocalReportNumber(draftId: string): string {
  return `LOCAL-${draftId.replace(/^report_/, '')}`
}

export async function listReportDrafts(adminAccountId?: string): Promise<ReportDraft[]> {
  if (!adminAccountId) {
    return []
  }

  const reports = await apiGet<ReportDraft[]>('/api/reports', adminAccountId)
  return reports.filter(hasVisibleReportContent)
}

export async function listArchivedReportDrafts(adminAccountId: string): Promise<ReportDraft[]> {
  return apiGet<ReportDraft[]>('/api/reports/archive', adminAccountId)
}

export async function listWorkerReportDrafts(workerAccountId: string): Promise<ReportDraft[]> {
  const reports = await offlineDatabase.reports
    .where('workerAccountId')
    .equals(workerAccountId)
    .toArray()

  return reports
    .filter((report) => report._deletedAt === undefined && hasVisibleReportContent(report))
    .sort((first, second) => second.updatedAt - first.updatedAt)
}

export async function synchronizeWorkerReportDrafts(
  workerAccountId: string,
): Promise<ReportDraft[]> {
  if (!navigator.onLine) {
    return listWorkerReportDrafts(workerAccountId)
  }

  const serverReports = await apiGet<ReportDraft[]>('/api/reports/mine', workerAccountId)
  await hideLocallyArchivedWorkerReports(serverReports, workerAccountId)
  const reportsNeedingDetails = await cacheWorkerServerReportSummaries(serverReports)

  void cacheWorkerServerReportDetails(reportsNeedingDetails, workerAccountId).catch(() => undefined)
  return listWorkerReportDrafts(workerAccountId)
}

/**
 * The worker's history is rendered from IndexedDB to remain available offline.
 * An administrator archiving a submitted report removes it from `/mine`, so
 * reconcile that omission with the local cache as a soft delete.  Pending
 * local changes are deliberately preserved: they still need to be sent first.
 * When the administrator restores the report, its newer server summary is
 * cached again by `cacheWorkerServerReportSummaries` below.
 */
async function hideLocallyArchivedWorkerReports(
  serverReports: ReportDraft[],
  workerAccountId: string,
): Promise<void> {
  const visibleServerReportIds = new Set(serverReports.map((report) => report.id))
  const archivedAt = Date.now()

  await offlineDatabase.transaction('rw', offlineDatabase.reports, async () => {
    const localReports = await offlineDatabase.reports
      .where('workerAccountId')
      .equals(workerAccountId)
      .toArray()

    const reportsToHide = localReports
      .filter(
        (report) =>
          report._deletedAt === undefined &&
          report._syncStatus !== 'pending' &&
          !visibleServerReportIds.has(report.id),
      )
      .map((report) => ({ ...report, _deletedAt: archivedAt }))

    if (reportsToHide.length) {
      await offlineDatabase.reports.bulkPut(reportsToHide)
    }
  })
}

export async function getReportDraftDetails(
  draftId: string,
  accountId: string,
): Promise<ReportDraftDetails | null> {
  const localDetails = await getLocalReportDetails(draftId)

  // A worker draft is always stored together with its local photos and template
  // snapshot, so opening it must never wait for the server. A report list may
  // only cache a submitted report summary; refresh those reports when online so
  // an administrator receives the complete submitted report.
  if (
    localDetails &&
    localDetails.draft._deletedAt === undefined &&
    (localDetails.draft.status === 'draft' ||
      !navigator.onLine ||
      localDetails.draft._syncStatus === 'pending')
  ) {
    return localDetails
  }

  try {
    const details = await apiGet<ServerReportDetails>(
      `/api/reports/${encodeURIComponent(draftId)}`,
      accountId,
    )

    const deserialized = deserializeDetails(details)
    await putReportDetails(deserialized.draft, deserialized.photos, deserialized.documents)
    return deserialized
  } catch (error) {
    if (isNotFound(error)) {
      return null
    }

    // `navigator.onLine` can remain true when Wi-Fi is connected but the API is
    // unreachable. Keep cached reports usable instead of turning that condition
    // into a permanently loading details screen.
    if (localDetails && localDetails.draft._deletedAt === undefined) {
      return localDetails
    }

    throw error
  }
}

export async function listReportPhotoPreviews(
  draftId: string,
  accountId: string,
): Promise<ProductPhoto[]> {
  const photos = await apiGet<SerializedProductPhoto[]>(
    `/api/reports/${encodeURIComponent(draftId)}/photo-previews`,
    accountId,
  )

  return photos.map(deserializePhoto)
}

export async function saveGeneratedDocument(
  draftId: string,
  documentBlob: Blob,
  fileName: string,
  mimeType: string,
  accountId: string,
): Promise<GeneratedDocument> {
  const generatedAt = Date.now()
  const document: GeneratedDocument = {
    id: createEntityId('document'),
    draftId,
    fileName,
    mimeType,
    blob: documentBlob,
    generatedAt,
    contentHash: await createBlobHash(documentBlob),
    ...createSyncMetadata('pending'),
  }
  const details = await getLocalReportDetails(draftId)

  if (!details) {
    throw new Error('Отчет не найден')
  }

  // A generated PDF is part of the local report state.  Bump the draft version as
  // well, otherwise an already running save synchronization may overwrite this
  // document with the older snapshot it started with.
  const updatedDraft: ReportDraft = {
    ...details.draft,
    updatedAt: generatedAt,
    ...createSyncMetadata('pending'),
  }

  await putReportDetails(updatedDraft, details.photos, [document])
  await enqueueReportSync(draftId, accountId, 'save')
  triggerSynchronization()

  return document
}

export async function generateReportDocumentOnServer(
  draftId: string,
  accountId: string,
): Promise<GeneratedDocument> {
  const savedDocument = await apiPost<SerializedGeneratedDocument>(
    `/api/reports/${encodeURIComponent(draftId)}/documents/generate`,
    undefined,
    accountId,
  )

  return deserializeDocument(savedDocument)
}

export async function submitReportDraft(
  draftId: string,
  accountId: string,
): Promise<ReportDraftDetails> {
  const details = await getLocalReportDetails(draftId)

  if (!details) {
    throw new Error('Отчет не найден')
  }

  if (!details.documents.length) {
    throw new Error('Сначала сформируйте и проверьте актуальный PDF')
  }

  const pendingDraft: ReportDraft = {
    ...details.draft,
    status: 'ready',
    // Keep the report content timestamp paired with the generated PDF.  The
    // server requires the PDF to be at least as new as `draft.updatedAt`; a
    // submission-state transition does not change report content.
    ...createSyncMetadata('pending'),
  }
  await putReportDetails(pendingDraft, details.photos, details.documents)
  await enqueueReportSync(draftId, accountId, 'submit')
  triggerSynchronization()

  return { ...details, draft: pendingDraft }
}

export async function softDeleteReportDraft(draftId: string, accountId: string): Promise<void> {
  const details = await getLocalReportDetails(draftId)

  if (!details) {
    return
  }

  const deletedDraft: ReportDraft = {
    ...details.draft,
    _deletedAt: Date.now(),
    ...createSyncMetadata('pending'),
  }
  await putReportDetails(deletedDraft, details.photos, details.documents)
  await enqueueReportSync(draftId, accountId, 'delete')
  triggerSynchronization()
}

export async function archiveReportDraft(reportId: string, adminAccountId: string): Promise<void> {
  await apiDelete(`/api/reports/${encodeURIComponent(reportId)}`, adminAccountId)
}

export async function permanentlyDeleteArchivedReport(
  reportId: string,
  adminAccountId: string,
): Promise<void> {
  await apiDelete(`/api/reports/archive/${encodeURIComponent(reportId)}`, adminAccountId)
}

export async function restoreArchivedReport(
  reportId: string,
  adminAccountId: string,
): Promise<void> {
  await apiPost(`/api/reports/archive/${encodeURIComponent(reportId)}`, undefined, adminAccountId)
}

async function createBlobHash(blob: Blob): Promise<string> {
  const subtleCrypto = globalThis.crypto?.subtle

  if (!subtleCrypto) {
    // Web Crypto requires a secure context. The server recomputes the authoritative
    // SHA-256 hash when the locally saved document is synchronized, so this value
    // only needs to identify the unsynchronized local document.
    return `local-${blob.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }

  const digest = await subtleCrypto.digest('SHA-256', await blob.arrayBuffer())

  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
}

async function cacheWorkerServerReportSummaries(
  serverReports: ReportDraft[],
): Promise<ReportDraft[]> {
  const reportsNeedingDetails: ReportDraft[] = []

  await Promise.all(
    serverReports.map(async (report) => {
      const localReport = await offlineDatabase.reports.get(report.id)

      if (localReport?._syncStatus === 'pending') {
        return
      }

      if (!localReport || report.updatedAt > localReport.updatedAt) {
        await offlineDatabase.reports.put(report)
        reportsNeedingDetails.push(report)
      }
    }),
  )

  return reportsNeedingDetails
}

async function cacheWorkerServerReportDetails(
  serverReports: ReportDraft[],
  workerAccountId: string,
): Promise<void> {
  await Promise.all(
    serverReports.map(async (report) => {
      const localReport = await offlineDatabase.reports.get(report.id)

      if (localReport?._syncStatus === 'pending') {
        return
      }

      try {
        const details = await apiGet<ServerReportDetails>(
          `/api/reports/${encodeURIComponent(report.id)}`,
          workerAccountId,
        )
        const deserialized = deserializeDetails(details)
        await putReportDetails(deserialized.draft, deserialized.photos, deserialized.documents)
      } catch {
        await offlineDatabase.reports.put(report)
      }
    }),
  )
}

function deserializeDetails(details: ServerReportDetails): ReportDraftDetails {
  return {
    draft: details.draft,
    photos: details.photos.map(deserializePhoto),
    documents: details.documents.map(deserializeDocument),
  }
}

function hasVisibleReportContent(draft: ReportDraft): boolean {
  return (
    Boolean(draft.productId) ||
    Boolean(draft.inspectorName.trim()) ||
    Boolean(draft.mainInfo?.orderNumber?.trim()) ||
    draft.photoIds.length > 0
  )
}

function templateHasProductField(
  template: ReportDraft['templateSnapshot'] | DocumentTemplate | undefined,
): boolean {
  const sections = template?.inputSchema?.steps ?? template?.sections ?? []

  return sections.some((section) =>
    section.fields.some(
      (field) => field.dataPath === 'productId' || field.dataPath === 'mainInfo.productName',
    ),
  )
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && /не найден|404/i.test(error.message)
}

function cloneTemplateData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export class ReportRepository {
  createFromTemplate(templateId: string, workerAccountId: string, inspectorName: string) {
    return createReportDraftFromTemplate(templateId, workerAccountId, inspectorName)
  }

  create(input: CreateReportDraftInput, options: SaveReportDraftOptions = {}) {
    return createReportDraft(input, options)
  }

  listAll(adminAccountId?: string) {
    return listReportDrafts(adminAccountId)
  }

  listArchived(adminAccountId: string) {
    return listArchivedReportDrafts(adminAccountId)
  }

  listForWorker(workerAccountId: string) {
    return listWorkerReportDrafts(workerAccountId)
  }

  getDetails(reportId: string, accountId: string) {
    return getReportDraftDetails(reportId, accountId)
  }

  softDelete(reportId: string, accountId: string) {
    return softDeleteReportDraft(reportId, accountId)
  }

  permanentlyDeleteArchived(reportId: string, adminAccountId: string) {
    return permanentlyDeleteArchivedReport(reportId, adminAccountId)
  }
}

export const reportRepository = new ReportRepository()
