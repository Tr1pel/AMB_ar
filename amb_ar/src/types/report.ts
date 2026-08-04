export type SyncStatus = 'synced' | 'pending' | 'conflicted'

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

export type DocumentTemplateStatus = 'draft' | 'active' | 'archived'

export type DocumentTemplateFieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'select'
  | 'textarea'
  | 'photo'
  | 'signature'

export type DocumentTemplateFieldWidth = 'half' | 'full'

export interface DocumentTemplateFieldOption {
  id: string
  label: string
  sortOrder: number
}

export interface DocumentTemplateField {
  id: string
  dataPath: string
  label: string
  type: DocumentTemplateFieldType
  required: boolean
  placeholder: string
  helpText: string
  width: DocumentTemplateFieldWidth
  sortOrder: number
  options: DocumentTemplateFieldOption[]
}

export interface DocumentTemplateSection {
  id: string
  title: string
  description: string
  sortOrder: number
  fields: DocumentTemplateField[]
}

export interface DocumentTemplate extends SyncableEntity {
  name: string
  description: string
  status: DocumentTemplateStatus
  sections: DocumentTemplateSection[]
  createdByAccountId: string
  createdAt: number
  updatedAt: number
  publishedAt?: number
}

export interface DocumentTemplateSnapshot {
  templateId: string
  name: string
  sections: DocumentTemplateSection[]
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
  templateId?: string
  templateSnapshot?: DocumentTemplateSnapshot
  workerAccountId: string
  productId: string
  productName: string
  inspectorName: string
  mainInfo: ReportMainInfo
  temperatureInfo: ReportTemperatureInfo
  inspectionResults: ReportInspectionResults
  descriptions: ReportDescriptions
  expertConclusion: string
  customFieldValues?: Record<string, string>
  sampling: ReportSampling
  signatures: ReportSignatures
  photoIds: string[]
  createdAt: number
  updatedAt: number
}

export interface ProductPhoto extends SyncableEntity {
  draftId: string
  templateFieldId?: string
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
  fileName: string
  mimeType: string
  blob: Blob
  generatedAt: number
  contentHash: string
}
