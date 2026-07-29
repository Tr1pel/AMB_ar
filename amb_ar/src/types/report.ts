export type SyncStatus = 'synced' | 'pending' | 'conflicted'

export type SyncOperation = 'upsert' | 'delete'

export type SyncEntityType =
  | 'reportDraft'
  | 'productPhoto'
  | 'generatedDocument'
  | 'account'
  | 'reportTemplateOption'

export type AccountRole = 'admin' | 'worker'

export type ReportStatus = 'draft' | 'ready' | 'exported' | 'archived'

export type ReportPhotoCategory =
  | 'vehicle'
  | 'temperature'
  | 'facade'
  | 'selection'
  | 'goods'
  | 'destructiveTesting'
  | 'caliber'
  | 'waste'
  | 'notStandard'

export interface SyncableEntity {
  id: string
  _syncStatus: SyncStatus
  _lastModified: number
  _localVersion: string
  _serverTimestamp?: number
  _serverVersion?: string
  _deletedAt?: number
}

export interface ProductOption {
  id: string
  label: string
  category: string
}

export type ReportTemplateField =
  | 'productId'
  | 'packageName'
  | 'packingKind'
  | 'temperatureViolation'
  | 'thermographPresence'
  | 'thermographViolation'
  | 'caliberPassportMatch'
  | 'varietyPassportMatch'

export interface Account extends SyncableEntity {
  loginNumber: string
  fullName: string
  role: AccountRole
  isActive: boolean
  createdAt: number
  updatedAt: number
}

export interface ReportTemplateOption extends SyncableEntity {
  field: ReportTemplateField
  label: string
  value: string
  category: string
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface ReportMainInfo {
  orderNumber: string
  zost: string
  shipper: string
  trailerNumber: string
  placeOfSurvey: string
  productName: string
  packageName: string
  plu: string
  openingDate: string
  surveyDate: string
  packingKind: string
  boxMarking: string
}

export interface ReportTemperatureInfo {
  storageTemperature: string
  pulpTemperature: string
  temperatureViolation: string
  sealNumber: string
  thermographPresence: string
  thermographViolation: string
}

export interface ReportInspectionResults {
  firstCategoryPercent: string
  firstCategoryNonStandardPercent: string
  secondCategoryNonStandardPercent: string
  wastePercent: string
  density: string
  brix: string
  caliber: string
  caliberPassportMatch: string
  caliberMismatch: string
  variety: string
  varietyPassportMatch: string
}

export interface ReportDescriptions {
  secondClassDefects: string
  waste: string
  caliberMismatch: string
}

export interface ReportSamplePoint {
  id: string
  pallet: string
  place: string
}

export interface ReportSampling {
  palletCount: number
  sampleCount: number
  seed: string
  points: ReportSamplePoint[]
}

export interface ReportSignatures {
  reportIssuedDate: string
  expertName: string
  retailRepresentativeName: string
}

export interface ReportDraft extends SyncableEntity {
  status: ReportStatus
  templateVersion: string
  workerAccountId: string
  productId: string
  productName: string
  inspectorName: string
  mainInfo: ReportMainInfo
  temperatureInfo: ReportTemperatureInfo
  inspectionResults: ReportInspectionResults
  descriptions: ReportDescriptions
  expertConclusion: string
  sampling: ReportSampling
  signatures: ReportSignatures
  photoIds: string[]
  createdAt: number
  updatedAt: number
}

export interface ProductPhoto extends SyncableEntity {
  draftId: string
  category: ReportPhotoCategory
  fileName: string
  mimeType: string
  size: number
  blob: Blob
  caption: string
  sortOrder: number
  createdAt: number
}

export interface GeneratedDocument extends SyncableEntity {
  draftId: string
  templateVersion: string
  fileName: string
  mimeType: string
  blob: Blob
  generatedAt: number
  contentHash: string
}

export interface SyncQueueItem extends SyncableEntity {
  entityType: SyncEntityType
  entityId: string
  operation: SyncOperation
  payload: Record<string, unknown>
  retryCount: number
  nextAttemptAt: number
  createdAt: number
  lastError?: string
}
