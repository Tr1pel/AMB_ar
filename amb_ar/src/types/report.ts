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
  | 'time'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'textarea'
  | 'measurement'
  | 'passFail'
  | 'table'
  | 'calculated'
  | 'photo'
  | 'signature'

export type DocumentTemplateFieldWidth = 'half' | 'full'

export interface DocumentTemplateFieldOption {
  id: string
  label: string
  sortOrder: number
}

export type DocumentTemplateTableColumnType = 'text' | 'number' | 'select' | 'checkbox'

export interface DocumentTemplateTableColumn {
  id: string
  label: string
  type: DocumentTemplateTableColumnType
  unit?: string
  options?: DocumentTemplateFieldOption[]
}

export interface DocumentTemplateTableRow {
  id: string
  label: string
  helpText?: string
}

export type DocumentTemplateCalculationOperator = 'sum' | 'difference' | 'average'

export interface DocumentTemplateCalculation {
  operator: DocumentTemplateCalculationOperator
  sourcePaths: string[]
  precision?: number
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
  unit?: string
  standardValue?: string
  tableColumns?: DocumentTemplateTableColumn[]
  tableRows?: DocumentTemplateTableRow[]
  calculation?: DocumentTemplateCalculation
}

export interface DocumentTemplateSection {
  id: string
  title: string
  description: string
  sortOrder: number
  fields: DocumentTemplateField[]
}

export interface DocumentInputSchema {
  version: 1
  steps: DocumentTemplateSection[]
}

export type DocumentRenderMode = 'flow'
export type DocumentRenderLayout = 'branded'

export interface DocumentRenderFieldSpec {
  dataPath: string
  label?: string
  width: DocumentTemplateFieldWidth
  display: 'value' | 'checkmark' | 'table'
  hideWhenEmpty: boolean
  hidden?: boolean
  page?: number
  x?: number
  y?: number
  widthPoints?: number
  heightPoints?: number
}

export interface DocumentRenderSectionSpec {
  id: string
  inputSectionId: string
  title: string
  pageBreakBefore: boolean
  columns: 1 | 2
  showDescription: boolean
  hidden?: boolean
  fields: DocumentRenderFieldSpec[]
}

export interface DocumentRenderSpec {
  version: 1
  mode: DocumentRenderMode
  layout: DocumentRenderLayout
  pageSize: 'A4'
  documentTitle: string
  sections: DocumentRenderSectionSpec[]
}

export interface DocumentTemplate extends SyncableEntity {
  name: string
  description: string
  status: DocumentTemplateStatus
  inputSchema: DocumentInputSchema
  renderSpec: DocumentRenderSpec
  /** @deprecated Compatibility mirror for templates created before inputSchema. */
  sections: DocumentTemplateSection[]
  createdByAccountId: string
  createdAt: number
  updatedAt: number
  publishedAt?: number
}

export interface DocumentTemplateSnapshot {
  templateId: string
  name: string
  inputSchema?: DocumentInputSchema
  renderSpec?: DocumentRenderSpec
  /** @deprecated Compatibility mirror for historical reports. */
  sections: DocumentTemplateSection[]
}

export type DocumentTemplateScalarValue = string | number | boolean
export type DocumentTemplateTableValue = Record<
  string,
  Record<string, DocumentTemplateScalarValue>
>
export type DocumentTemplateFieldValue =
  | DocumentTemplateScalarValue
  | string[]
  | DocumentTemplateTableValue

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
  /** Server-issued business number. LOCAL-* is temporary until the server confirms the save. */
  reportNumber?: string
  status: ReportStatus
  archivedFromStatus?: Exclude<ReportStatus, 'archived'>
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
  customFieldValues?: Record<string, DocumentTemplateFieldValue>
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
