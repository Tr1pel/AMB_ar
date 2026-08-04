import {
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  deserializeDocument,
  deserializePhoto,
  serializeDocument,
  serializePhoto,
  type SerializedGeneratedDocument,
  type ServerReportDetails,
} from '@/shared/api/server-api'
import { getProductLabel } from '@/shared/constants/products'
import { photoCompressionService } from '@/shared/photos/photo-compression-service'
import {
  ensureSeedDocumentTemplates,
  getActiveDocumentTemplate,
  getDocumentTemplateById,
} from '@/shared/repositories/document-template-repository'
import { createEntityId, createSyncMetadata } from '@/shared/sync/sync-metadata'
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
  customFieldValues?: Record<string, string>
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

const DEFAULT_REPORT_PRODUCT_ID = 'sweet-red-pepper'

export async function createReportDraftFromTemplate(
  templateId: string,
  workerAccountId: string,
  inspectorName: string,
): Promise<ReportDraftDetails> {
  const productName = getProductLabel(DEFAULT_REPORT_PRODUCT_ID)

  return createReportDraft(
    {
      templateId,
      workerAccountId,
      productId: DEFAULT_REPORT_PRODUCT_ID,
      inspectorName,
      mainInfo: {
        orderNumber: '',
        zost: '',
        shipper: '',
        trailerNumber: '',
        placeOfSurvey: '',
        productName,
        packageName: '1 кг',
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

  await ensureSeedDocumentTemplates()

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
  const productName = input.mainInfo.productName.trim() || getProductLabel(input.productId)
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
        ...createSyncMetadata('synced'),
      }
    }),
  )
  const draft: ReportDraft = {
    id: draftId,
    status: options.status ?? 'draft',
    templateId: selectedTemplate?.id ?? existingDraft?.templateId,
    templateSnapshot: selectedTemplate
      ? {
          templateId: selectedTemplate.id,
          name: selectedTemplate.name,
          sections: structuredClone(selectedTemplate.sections),
        }
      : existingDraft?.templateSnapshot,
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
    customFieldValues: { ...input.customFieldValues },
    sampling: input.sampling,
    signatures: input.signatures,
    photoIds: photos.map((photo) => photo.id),
    createdAt: existingDraft?.createdAt ?? now,
    updatedAt: now,
    ...createSyncMetadata('synced'),
  }
  const serverDetails = await apiPut<ServerReportDetails>(
    `/api/reports/${encodeURIComponent(draftId)}`,
    {
      draft,
      photos: await Promise.all(photos.map(serializePhoto)),
    },
    accountId,
  )

  return deserializeDetails(serverDetails)
}

export async function listReportDrafts(adminAccountId?: string): Promise<ReportDraft[]> {
  if (!adminAccountId) {
    return []
  }

  const reports = await apiGet<ReportDraft[]>('/api/reports', adminAccountId)
  return reports.filter(hasVisibleReportContent)
}

export async function listWorkerReportDrafts(workerAccountId: string): Promise<ReportDraft[]> {
  const reports = await apiGet<ReportDraft[]>('/api/reports/mine', workerAccountId)
  return reports.filter(hasVisibleReportContent)
}

export async function getReportDraftDetails(
  draftId: string,
  accountId: string,
): Promise<ReportDraftDetails | null> {
  try {
    const details = await apiGet<ServerReportDetails>(
      `/api/reports/${encodeURIComponent(draftId)}`,
      accountId,
    )

    return deserializeDetails(details)
  } catch (error) {
    if (isNotFound(error)) {
      return null
    }

    throw error
  }
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
    ...createSyncMetadata('synced'),
  }
  const savedDocument = await apiPost<SerializedGeneratedDocument>(
    `/api/reports/${encodeURIComponent(draftId)}/documents`,
    await serializeDocument(document),
    accountId,
  )

  return deserializeDocument(savedDocument)
}

export async function softDeleteReportDraft(
  draftId: string,
  accountId: string,
): Promise<void> {
  await apiDelete(`/api/reports/${encodeURIComponent(draftId)}`, accountId)
}

async function createBlobHash(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())

  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
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

function isNotFound(error: unknown): boolean {
  return error instanceof Error && /не найден|404/i.test(error.message)
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

  listForWorker(workerAccountId: string) {
    return listWorkerReportDrafts(workerAccountId)
  }

  getDetails(reportId: string, accountId: string) {
    return getReportDraftDetails(reportId, accountId)
  }

  softDelete(reportId: string, accountId: string) {
    return softDeleteReportDraft(reportId, accountId)
  }
}

export const reportRepository = new ReportRepository()
