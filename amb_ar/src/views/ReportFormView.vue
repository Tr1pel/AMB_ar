<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'

import FormSection from '@/components/reports/FormSection.vue'
import PhotoPicker from '@/components/reports/PhotoPicker.vue'
import { currentLocale, localeTag } from '@/shared/i18n'
import { createEntityId } from '@/shared/sync/sync-metadata'
import {
  getLocalizedFieldText,
  getLocalizedSectionText,
} from '@/shared/templates/document-template-localization'
import { getTemplateInputSections } from '@/shared/templates/document-template-schema'
import { useAuthStore } from '@/stores/auth.store'
import { useDocumentTemplateStore } from '@/stores/document-template.store'
import { useReportDraftStore } from '@/stores/report-draft.store'
import { useReportTemplateStore } from '@/stores/report-template.store'
import type {
  DocumentTemplateField,
  DocumentTemplateFieldValue,
  DocumentTemplateSection,
  DocumentTemplateTableValue,
  ReportDraft,
  ReportInspectionResults,
  ReportMainInfo,
  ReportPhotoCategory,
  ReportSamplePoint,
  ReportTemplateField,
} from '@/types/report'

const props = defineProps<{
  reportId: string
}>()

type ReportStepId = string

interface ReportStep {
  id: ReportStepId
  title: string
  subtitle: string
}

interface DynamicSelectOption {
  id: string
  label: string
  value: string
}

interface LocalPhotoInput {
  id: string
  file: File
  url: string
  fileName: string
  templateFieldId?: string
  category: ReportPhotoCategory
  caption: string
  sortOrder: number
}

interface FieldDescriptor<T> {
  key: keyof T
  label: string
  placeholder?: string
  type?: string
}

const router = useRouter()
const authStore = useAuthStore()
const documentTemplateStore = useDocumentTemplateStore()
const reportDraftStore = useReportDraftStore()
const reportTemplateStore = useReportTemplateStore()

function getFieldLabel(field: DocumentTemplateField): string {
  return getLocalizedFieldText(field, 'label', currentLocale.value)
}

function getFieldPlaceholder(field: DocumentTemplateField): string {
  return getLocalizedFieldText(field, 'placeholder', currentLocale.value)
}

function getFieldHelpText(field: DocumentTemplateField): string {
  return getLocalizedFieldText(field, 'helpText', currentLocale.value)
}

const initialProductId = ''
const initialExpertConclusion = ''
const AUTOSAVE_DELAY_MS = 600

const initialMainInfo = {
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
}

const initialTemperatureInfo = {
  storageTemperature: '',
  pulpTemperature: '',
  temperatureViolation: 'Нет',
  sealNumber: '',
  thermographPresence: 'Нет',
  thermographViolation: 'Нет',
}

const initialInspectionResults = {
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
}

const initialDescriptions = {
  secondClassDefects: '',
  waste: '',
  caliberMismatch: '',
}

const initialSampling = {
  palletCount: 26,
  sampleCount: 15,
  seed: `${Date.now()}`,
}

const initialSignatures = {
  reportIssuedDate: '',
  expertName: '',
  retailRepresentativeName: '',
}

const activeStepId = ref<ReportStepId>('shipment')
const selectedTemplateId = ref('')
const productId = ref(initialProductId)
const expertConclusion = ref(initialExpertConclusion)
const photos = ref<LocalPhotoInput[]>([])
const draftId = ref<string | null>(null)
const autosaveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const lastSavedAt = ref<number | null>(null)
const isAutosaveReady = ref(false)
const isFormReady = ref(false)
const formLoadError = ref('')
const testAutofillNotice = ref('')
let autosaveTimer: ReturnType<typeof setTimeout> | null = null
let activeSavePromise: Promise<ReportDraft | null> | null = null

const mainInfo = reactive({ ...initialMainInfo })

const temperatureInfo = reactive({ ...initialTemperatureInfo })

const inspectionResults = reactive({ ...initialInspectionResults })

const descriptions = reactive({ ...initialDescriptions })
const customFieldValues = reactive<Record<string, DocumentTemplateFieldValue>>({})

const sampling = reactive({
  ...initialSampling,
  points: [] as ReportSamplePoint[],
})

const signatures = reactive({ ...initialSignatures })

const autosaveMessage = computed(() => {
  if (autosaveState.value === 'idle') {
    return 'Есть несохраненные изменения'
  }

  if (autosaveState.value === 'saving') {
    return 'Сохраняем на устройстве...'
  }

  if (autosaveState.value === 'error') {
    return 'Не удалось сохранить локально'
  }

  return lastSavedAt.value
    ? `Сохранено в ${new Intl.DateTimeFormat(localeTag.value, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(lastSavedAt.value)}`
    : 'Сохранено'
})

const legacySteps: ReportStep[] = [
  {
    id: 'shipment',
    title: 'Партия',
    subtitle: 'Заказ, поставщик, место инспекции и даты.',
  },
  {
    id: 'product',
    title: 'Продукт',
    subtitle: 'Товар, PLU, фасовка, упаковка и маркировка.',
  },
  {
    id: 'temperature',
    title: 'Температура',
    subtitle: 'Температурный режим, пломба и термографы.',
  },
  {
    id: 'results',
    title: 'Результаты',
    subtitle: 'Проценты категорий, отход, калибр, сорт и Brix.',
  },
  {
    id: 'defects',
    title: 'Дефекты',
    subtitle: 'Описание нестандарта, отхода и замечаний по калибру.',
  },
  {
    id: 'sampling',
    title: 'Выборка',
    subtitle: 'Генератор точек контроля по палетам.',
  },
  {
    id: 'photos',
    title: 'Фото',
    subtitle: 'Фотоотчет по категориям документа.',
  },
  {
    id: 'signatures',
    title: 'Подписи',
    subtitle: 'Выпуск отчета, эксперт и представитель ТС.',
  },
]

const shipmentFields: FieldDescriptor<ReportMainInfo>[] = [
  { key: 'orderNumber', label: 'Номер заказа' },
  { key: 'zost', label: 'ZOST' },
  { key: 'shipper', label: 'Поставщик' },
  { key: 'trailerNumber', label: 'Прицеп N' },
  { key: 'placeOfSurvey', label: 'Место инспекции' },
  { key: 'openingDate', label: 'Дата открытия', type: 'date' },
  { key: 'surveyDate', label: 'Дата инспекции', type: 'date' },
]

const productFields: FieldDescriptor<ReportMainInfo>[] = [
  { key: 'plu', label: 'PLU' },
  { key: 'boxMarking', label: 'Маркировка на коробках' },
]

const resultFields: FieldDescriptor<ReportInspectionResults>[] = [
  { key: 'firstCategoryPercent', label: 'Соответствует 1 категории' },
  { key: 'firstCategoryNonStandardPercent', label: 'Нестандарт для 1 категории' },
  { key: 'secondCategoryNonStandardPercent', label: 'Нестандарт для 2 категории' },
  { key: 'wastePercent', label: 'Отход' },
  { key: 'density', label: 'Плотность' },
  { key: 'brix', label: 'Brix / сахар' },
  { key: 'caliber', label: 'Калибр' },
  { key: 'caliberMismatch', label: 'Не соответствует калибру' },
  { key: 'variety', label: 'Сорт' },
]

const photoCategories: Array<{ id: ReportPhotoCategory; title: string; subtitle: string }> = [
  { id: 'vehicle', title: 'Транспортное средство', subtitle: 'Vehicle' },
  { id: 'temperature', title: 'Температура', subtitle: 'Temperature' },
  { id: 'facade', title: 'Аллея / фасад', subtitle: 'Facade' },
  { id: 'selection', title: 'ГСЗ / выборка', subtitle: 'Selection' },
  { id: 'goods', title: 'Общий вид товара', subtitle: 'Goods' },
  { id: 'destructiveTesting', title: 'Разрушающий контроль', subtitle: 'Destructive testing' },
  { id: 'caliber', title: 'Калибр', subtitle: 'Caliber' },
  { id: 'waste', title: 'Отход', subtitle: 'Waste' },
  { id: 'notStandard', title: 'Нестандарт', subtitle: 'Not correspond to the standard' },
]

const templateSections = computed<DocumentTemplateSection[]>(() =>
  [
    ...getTemplateInputSections(
      reportDraftStore.selectedReport?.templateSnapshot ?? selectedDocumentTemplate.value,
    ),
  ].sort((firstSection, secondSection) => firstSection.sortOrder - secondSection.sortOrder),
)
const steps = computed<ReportStep[]>(() =>
  templateSections.value.length
    ? templateSections.value.map((section) => ({
        id: section.id,
        title: getLocalizedSectionText(section, 'title', currentLocale.value),
        subtitle:
          getLocalizedSectionText(section, 'description', currentLocale.value) ||
          'Заполните поля этого раздела.',
      }))
    : legacySteps,
)
const activeTemplateSection = computed(() =>
  templateSections.value.find((section) => section.id === activeStepId.value),
)
const templatePhotoFieldIds = computed(() =>
  templateSections.value.flatMap((section) =>
    section.fields
      .filter((field) => field.type === 'photo' || field.dataPath === 'photos')
      .map((field) => field.id),
  ),
)
const hasTemplateProductField = computed(() =>
  templateSections.value.some((section) =>
    section.fields.some(
      (field) => field.dataPath === 'productId' || field.dataPath === 'mainInfo.productName',
    ),
  ),
)
const activeStep = computed(
  () =>
    steps.value.find((step) => step.id === activeStepId.value) ?? steps.value[0] ?? legacySteps[0]!,
)
const activeStepIndex = computed(() =>
  steps.value.findIndex((step) => step.id === activeStepId.value),
)
const isFirstStep = computed(() => activeStepIndex.value === 0)
const isLastStep = computed(() => activeStepIndex.value === steps.value.length - 1)
const completedStepCount = computed(() => activeStepIndex.value + 1)
const workerFullName = computed(() => authStore.currentAccount?.fullName ?? '')
const selectedDocumentTemplate = computed(() =>
  documentTemplateStore.templates.find((template) => template.id === selectedTemplateId.value),
)
const productOptions = computed(() =>
  reportTemplateStore.productOptions.length
    ? reportTemplateStore.productOptions
    : reportDraftStore.productOptions,
)
const packageOptions = computed(() => reportTemplateStore.getOptionsByField('packageName'))
const packingKindOptions = computed(() => reportTemplateStore.getOptionsByField('packingKind'))
const temperatureViolationOptions = computed(() =>
  reportTemplateStore.getOptionsByField('temperatureViolation'),
)
const thermographPresenceOptions = computed(() =>
  reportTemplateStore.getOptionsByField('thermographPresence'),
)
const thermographViolationOptions = computed(() =>
  reportTemplateStore.getOptionsByField('thermographViolation'),
)
const caliberPassportMatchOptions = computed(() =>
  reportTemplateStore.getOptionsByField('caliberPassportMatch'),
)
const varietyPassportMatchOptions = computed(() =>
  reportTemplateStore.getOptionsByField('varietyPassportMatch'),
)

const canSave = computed(
  () =>
    Boolean(authStore.currentAccount?.id) &&
    Boolean(selectedTemplateId.value) &&
    Boolean(workerFullName.value.trim()) &&
    templateSections.value.every((section) =>
      section.fields.every(
        (field) => !field.required || isProductTemplateField(field) || hasDynamicFieldValue(field),
      ),
    ),
)
watch(selectedTemplateId, () => {
  const firstSection = templateSections.value[0]

  if (firstSection) {
    activeStepId.value = firstSection.id
  }
})
watch(productId, (selectedProductId) => {
  if (!hasTemplateProductField.value) {
    return
  }

  const product = productOptions.value.find((option) => option.id === selectedProductId)

  if (product) {
    mainInfo.productName = product.label
  }
})

watch(productOptions, (options) => {
  if (!options.length || !hasTemplateProductField.value) {
    return
  }

  if (!options.some((option) => option.id === productId.value)) {
    productId.value = options[0]!.id
  }

  const selectedProduct = options.find((option) => option.id === productId.value)

  if (selectedProduct) {
    mainInfo.productName = selectedProduct.label
  }
})

watch(
  () => ({
    templateId: selectedTemplateId.value,
    productId: productId.value,
    expertConclusion: expertConclusion.value,
    mainInfo: { ...mainInfo },
    temperatureInfo: { ...temperatureInfo },
    inspectionResults: { ...inspectionResults },
    descriptions: { ...descriptions },
    customFieldValues: { ...customFieldValues },
    sampling: {
      ...sampling,
      points: sampling.points.map((point) => ({ ...point })),
    },
    signatures: { ...signatures },
    photos: photos.value.map((photo) => ({
      id: photo.id,
      file: photo.file,
      templateFieldId: photo.templateFieldId,
      caption: photo.caption,
      category: photo.category,
      sortOrder: photo.sortOrder,
    })),
  }),
  () => {
    if (isAutosaveReady.value) {
      scheduleAutosave()
    }
  },
  { deep: true },
)

onMounted(async () => {
  isFormReady.value = false
  formLoadError.value = ''

  try {
    await Promise.all([reportTemplateStore.loadOptions(), documentTemplateStore.loadTemplates()])
    await reportDraftStore.loadReport(props.reportId)

    if (!reportDraftStore.selectedReport) {
      formLoadError.value =
        reportDraftStore.errorMessage ?? 'Черновик не найден на этом устройстве.'
      return
    }

    if (reportDraftStore.selectedReport.status !== 'draft') {
      await router.replace({ name: 'report-details', params: { reportId: props.reportId } })
      return
    }

    hydrateExistingReport()

    isAutosaveReady.value = true
    await nextTick()
    isFormReady.value = true
  } catch (error) {
    formLoadError.value =
      error instanceof Error ? error.message : 'Не удалось открыть сохраненный черновик.'
  }
})

onUnmounted(() => {
  clearAutosaveTimer()
  photos.value.forEach((photo) => URL.revokeObjectURL(photo.url))
})

onBeforeRouteLeave(async () => {
  if (!isAutosaveReady.value) {
    return true
  }

  if (activeSavePromise) {
    const savedReport = await activeSavePromise

    if (!savedReport) {
      return false
    }
  }

  if (autosaveTimer) {
    clearAutosaveTimer()

    if (!(await persistDraft('draft'))) {
      return false
    }
  }

  return autosaveState.value !== 'error'
})

function setStep(stepId: ReportStepId): void {
  activeStepId.value = stepId
  scrollToFormTop()
}

function hasChangedString(currentValue: string, initialValue: string): boolean {
  return currentValue.trim() !== initialValue.trim()
}

function hasChangedFields<T extends Record<string, string>>(
  currentValues: T,
  initialValues: Partial<T>,
): boolean {
  return (Object.keys(initialValues) as Array<keyof T>).some((key) =>
    hasChangedString(currentValues[key] ?? '', initialValues[key] ?? ''),
  )
}

function getDynamicFieldValue(dataPath: string): string {
  if (dataPath === 'mainInfo.productName') {
    return productId.value
  }

  if (dataPath === 'expertConclusion') {
    return expertConclusion.value
  }

  if (dataPath.startsWith('custom.')) {
    return formatScalarValue(customFieldValues[dataPath])
  }

  const [rootKey, fieldKey] = dataPath.split('.')
  const roots: Record<string, Record<string, unknown>> = {
    mainInfo,
    temperatureInfo,
    inspectionResults,
    descriptions,
    signatures,
  }
  const root = rootKey ? roots[rootKey] : undefined
  const value = root && fieldKey ? root[fieldKey] : undefined

  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function setDynamicFieldValue(dataPath: string, value: string | boolean): void {
  if (dataPath === 'mainInfo.productName') {
    productId.value = String(value)
    return
  }

  if (dataPath === 'expertConclusion') {
    expertConclusion.value = String(value)
    return
  }

  if (dataPath.startsWith('custom.')) {
    customFieldValues[dataPath] = value
    return
  }

  const [rootKey, fieldKey] = dataPath.split('.')
  const roots: Record<string, Record<string, string>> = {
    mainInfo,
    temperatureInfo,
    inspectionResults,
    descriptions,
    signatures,
  }
  const root = rootKey ? roots[rootKey] : undefined

  if (root && fieldKey) {
    root[fieldKey] = String(value)
  }
}

function getDynamicBooleanValue(dataPath: string): boolean {
  return customFieldValues[dataPath] === true || getDynamicFieldValue(dataPath) === 'true'
}

function getDynamicTableValue(dataPath: string): DocumentTemplateTableValue {
  const value = customFieldValues[dataPath]

  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as DocumentTemplateTableValue)
    : {}
}

function getTableCellValue(
  dataPath: string,
  rowId: string,
  columnId: string,
): string | number | boolean {
  return getDynamicTableValue(dataPath)[rowId]?.[columnId] ?? ''
}

function setTableCellValue(
  dataPath: string,
  rowId: string,
  columnId: string,
  value: string | boolean,
): void {
  const currentTable = getDynamicTableValue(dataPath)

  customFieldValues[dataPath] = {
    ...currentTable,
    [rowId]: {
      ...currentTable[rowId],
      [columnId]: value,
    },
  }
}

function getCalculatedFieldValue(field: DocumentTemplateField): string {
  const calculation = field.calculation

  if (!calculation?.sourcePaths.length) {
    return getDynamicFieldValue(field.dataPath)
  }

  const values = calculation.sourcePaths
    .map((path) => Number.parseFloat(getDynamicFieldValue(path).replace(',', '.')))
    .filter(Number.isFinite)

  if (!values.length) {
    return ''
  }

  let result = values[0] ?? 0

  if (calculation.operator === 'sum') {
    result = values.reduce((sum, value) => sum + value, 0)
  } else if (calculation.operator === 'difference') {
    result = values.slice(1).reduce((difference, value) => difference - value, result)
  } else if (calculation.operator === 'average') {
    result = values.reduce((sum, value) => sum + value, 0) / values.length
  }

  return result.toFixed(calculation.precision ?? 2).replace(/\.00$/, '')
}

function formatScalarValue(value: DocumentTemplateFieldValue | undefined): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : ''
}

function getDynamicSelectOptions(field: DocumentTemplateField): DynamicSelectOption[] {
  const embeddedOptions = [...(field.options ?? [])].sort(
    (firstOption, secondOption) => firstOption.sortOrder - secondOption.sortOrder,
  )

  if (embeddedOptions.length) {
    return embeddedOptions.map((option) => ({
      id: option.id,
      label: option.label,
      value: option.label,
    }))
  }

  if (field.type === 'passFail') {
    return [
      { id: `${field.id}-pass`, label: 'Соответствует', value: 'pass' },
      { id: `${field.id}-fail`, label: 'Не соответствует', value: 'fail' },
    ]
  }

  const { dataPath } = field

  if (dataPath === 'mainInfo.productName') {
    return productOptions.value.map((option) => ({
      id: option.id,
      label: option.label,
      value: option.id,
    }))
  }

  const optionFieldMap: Partial<Record<string, ReportTemplateField>> = {
    'mainInfo.packageName': 'packageName',
    'mainInfo.packingKind': 'packingKind',
    'temperatureInfo.temperatureViolation': 'temperatureViolation',
    'temperatureInfo.thermographPresence': 'thermographPresence',
    'temperatureInfo.thermographViolation': 'thermographViolation',
    'inspectionResults.caliberPassportMatch': 'caliberPassportMatch',
    'inspectionResults.varietyPassportMatch': 'varietyPassportMatch',
  }
  const optionField = optionFieldMap[dataPath]

  if (!optionField) {
    return []
  }

  return reportTemplateStore.getOptionsByField(optionField).map((option) => ({
    id: option.id,
    label: option.label,
    value: option.value,
  }))
}

function getDynamicInputType(field: DocumentTemplateField): string {
  if (field.type === 'number' || field.type === 'date' || field.type === 'time') {
    return field.type
  }

  if (field.type === 'measurement') {
    return 'number'
  }

  return 'text'
}

function getEventValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value
}

function getEventChecked(event: Event): boolean {
  return (event.target as HTMLInputElement).checked
}

function hasDynamicFieldValue(field: DocumentTemplateField): boolean {
  if (field.type === 'signature') {
    return Boolean(workerFullName.value.trim())
  }

  if (field.type === 'photo' || field.dataPath === 'photos') {
    return getPhotosByTemplateField(field.id).length > 0
  }

  if (field.dataPath === 'sampling.points') {
    return sampling.points.length > 0
  }

  if (field.type === 'table') {
    return Object.values(getDynamicTableValue(field.dataPath)).some((row) =>
      Object.values(row).some((value) => value !== '' && value !== false),
    )
  }

  if (field.type === 'checkbox') {
    return getDynamicBooleanValue(field.dataPath)
  }

  return Boolean(
    (field.type === 'calculated'
      ? getCalculatedFieldValue(field)
      : getDynamicFieldValue(field.dataPath)
    ).trim(),
  )
}

function isAutomaticallyFilledField(field: DocumentTemplateField): boolean {
  return field.type === 'signature' || field.type === 'calculated'
}

function isProductTemplateField(field: DocumentTemplateField): boolean {
  return field.dataPath === 'productId' || field.dataPath === 'mainInfo.productName'
}

function isTemplateSectionComplete(section: DocumentTemplateSection): boolean {
  const userFields = section.fields.filter((field) => !isAutomaticallyFilledField(field))
  const requiredUserFields = userFields.filter((field) => field.required)
  const fieldsToCheck = requiredUserFields.length ? requiredUserFields : userFields

  return fieldsToCheck.length > 0 && fieldsToCheck.every((field) => hasDynamicFieldValue(field))
}

function isStepFilled(stepId: ReportStepId): boolean {
  if (templateSections.value.length) {
    const section = templateSections.value.find((item) => item.id === stepId)

    return section ? isTemplateSectionComplete(section) : false
  }

  switch (stepId) {
    case 'shipment':
      return hasChangedFields(mainInfo, {
        orderNumber: initialMainInfo.orderNumber,
        zost: initialMainInfo.zost,
        shipper: initialMainInfo.shipper,
        trailerNumber: initialMainInfo.trailerNumber,
        placeOfSurvey: initialMainInfo.placeOfSurvey,
        openingDate: initialMainInfo.openingDate,
        surveyDate: initialMainInfo.surveyDate,
      })
    case 'product':
      return (
        productId.value !== initialProductId ||
        hasChangedFields(mainInfo, {
          productName: initialMainInfo.productName,
          packageName: initialMainInfo.packageName,
          plu: initialMainInfo.plu,
          packingKind: initialMainInfo.packingKind,
          boxMarking: initialMainInfo.boxMarking,
        })
      )
    case 'temperature':
      return hasChangedFields(temperatureInfo, initialTemperatureInfo)
    case 'results':
      return hasChangedFields(inspectionResults, initialInspectionResults)
    case 'defects':
      return (
        hasChangedFields(descriptions, initialDescriptions) ||
        hasChangedString(expertConclusion.value, initialExpertConclusion)
      )
    case 'sampling':
      return (
        sampling.palletCount !== initialSampling.palletCount ||
        sampling.sampleCount !== initialSampling.sampleCount ||
        hasChangedString(sampling.seed, initialSampling.seed) ||
        sampling.points.length > 0
      )
    case 'photos':
      return photos.value.length > 0
    case 'signatures':
      return hasChangedFields(signatures, initialSignatures)
  }

  return false
}

function goToPreviousStep(): void {
  if (isFirstStep.value) {
    return
  }

  const previousStep = steps.value[activeStepIndex.value - 1]

  if (!previousStep) {
    return
  }

  activeStepId.value = previousStep.id
  scrollToFormTop()
}

function goToNextStep(): void {
  if (isLastStep.value) {
    return
  }

  const nextStep = steps.value[activeStepIndex.value + 1]

  if (!nextStep) {
    return
  }

  activeStepId.value = nextStep.id
  scrollToFormTop()
}

function scrollToFormTop(): void {
  window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
}

function getPhotosByCategory(category: ReportPhotoCategory): LocalPhotoInput[] {
  return photos.value.filter((photo) => !photo.templateFieldId && photo.category === category)
}

function handlePhotoSelected(category: ReportPhotoCategory, file: File): void {
  appendPhoto(file, category)
}

function getPhotosByTemplateField(fieldId: string): LocalPhotoInput[] {
  const firstPhotoFieldId = templatePhotoFieldIds.value[0]

  return photos.value.filter(
    (photo) =>
      photo.templateFieldId === fieldId ||
      (!photo.templateFieldId && fieldId === firstPhotoFieldId),
  )
}

function handleTemplatePhotoSelected(fieldId: string, file: File): void {
  appendPhoto(file, 'goods', fieldId)
}

function appendPhoto(file: File, category: ReportPhotoCategory, templateFieldId?: string): void {
  const nextOrder = photos.value.length + 1

  photos.value = [
    ...photos.value,
    {
      // Web Crypto is unavailable when the development server is opened over HTTP
      // from another device.  The shared helper falls back to a local identifier.
      id: createEntityId('photo'),
      file,
      url: URL.createObjectURL(file),
      fileName: file.name || 'Фото отчета',
      ...(templateFieldId ? { templateFieldId } : {}),
      category,
      caption: '',
      sortOrder: nextOrder,
    },
  ]
}

function updatePhotoCaption(photoId: string, caption: string): void {
  const photo = photos.value.find((item) => item.id === photoId)

  if (photo) {
    photo.caption = caption
  }
}

function removePhoto(photoId: string): void {
  const photo = photos.value.find((item) => item.id === photoId)

  if (photo) {
    URL.revokeObjectURL(photo.url)
  }

  photos.value = photos.value.filter((item) => item.id !== photoId)
}

function generateSampling(): void {
  const random = createSeededRandom(sampling.seed || `${Date.now()}`)
  const usedPallets = new Set<number>()
  const points: ReportSamplePoint[] = []

  while (points.length < sampling.sampleCount && usedPallets.size < sampling.palletCount) {
    const pallet = Math.floor(random() * sampling.palletCount) + 1

    if (usedPallets.has(pallet)) {
      continue
    }

    usedPallets.add(pallet)
    points.push({
      id: `sample-${points.length + 1}`,
      pallet: `${pallet}`,
      place: buildSamplePlace(random),
    })
  }

  sampling.points = points
}

function fillWithTestData(): void {
  const today = formatDateForInput(new Date())
  const compactDate = today.replaceAll('-', '')

  Object.assign(mainInfo, {
    orderNumber: `PO-${compactDate}-001`,
    zost: 'ZOST-TEST-01',
    shipper: 'ООО «Тестовый поставщик»',
    trailerNumber: 'А123ВС77',
    placeOfSurvey: 'Тестовый склад',
    packageName: packageOptions.value[0]?.value ?? 'Короб 10 кг',
    plu: 'TEST-PLU',
    openingDate: today,
    surveyDate: today,
    packingKind: packingKindOptions.value[0]?.value ?? 'Картонный короб',
    boxMarking: 'TEST / LOT-001',
  })

  const firstProduct = productOptions.value[0]
  if (firstProduct) {
    productId.value = firstProduct.id
  }

  Object.assign(temperatureInfo, {
    storageTemperature: '6',
    pulpTemperature: '5.8',
    temperatureViolation: temperatureViolationOptions.value[0]?.value ?? 'Нет',
    sealNumber: 'TEST-SEAL-001',
    thermographPresence: thermographPresenceOptions.value[0]?.value ?? 'Да',
    thermographViolation: thermographViolationOptions.value[0]?.value ?? 'Нет',
  })

  Object.assign(inspectionResults, {
    firstCategoryPercent: '96',
    firstCategoryNonStandardPercent: '2',
    secondCategoryNonStandardPercent: '1',
    wastePercent: '1',
    density: 'Плотный',
    brix: '7.5',
    caliber: '70–110 мм',
    caliberPassportMatch: caliberPassportMatchOptions.value[0]?.value ?? 'Да',
    caliberMismatch: '2',
    variety: 'Тестовый сорт',
    varietyPassportMatch: varietyPassportMatchOptions.value[0]?.value ?? 'Да',
  })

  Object.assign(descriptions, {
    secondClassDefects: 'Незначительные тестовые дефекты поверхности.',
    waste: 'Тестовое описание отходов.',
    caliberMismatch: 'Незначительное тестовое отклонение калибра.',
  })

  expertConclusion.value = 'Тестовая партия соответствует требованиям качества.'
  Object.assign(signatures, {
    reportIssuedDate: today,
    expertName: workerFullName.value || 'Тестовый инспектор',
    retailRepresentativeName: 'Тестовый представитель торговой сети',
  })
  Object.assign(sampling, {
    palletCount: 12,
    sampleCount: 6,
    seed: `test-${compactDate}`,
  })
  generateSampling()

  templateSections.value
    .flatMap((section) => section.fields)
    .forEach((field, fieldIndex) => fillDynamicFieldWithTestData(field, fieldIndex, today))

  testAutofillNotice.value =
    'Тестовые данные добавлены. Фото не создаются; черновик сохраняется на сервере автоматически.'
}

function fillDynamicFieldWithTestData(
  field: DocumentTemplateField,
  fieldIndex: number,
  today: string,
): void {
  if (field.type === 'photo' || field.type === 'signature' || field.type === 'calculated') {
    return
  }

  if (field.dataPath === 'sampling.points') {
    generateSampling()
    return
  }

  if (field.type === 'table') {
    customFieldValues[field.dataPath] = buildTestTableValue(field, fieldIndex)
    return
  }

  if (field.type === 'checkbox') {
    setDynamicFieldValue(field.dataPath, true)
    return
  }

  if (field.type === 'select' || field.type === 'radio' || field.type === 'passFail') {
    const firstOption = getDynamicSelectOptions(field)[0]
    setDynamicFieldValue(field.dataPath, firstOption?.value ?? 'Тестовое значение')
    return
  }

  if (field.type === 'date') {
    setDynamicFieldValue(field.dataPath, today)
    return
  }

  if (field.type === 'time') {
    setDynamicFieldValue(field.dataPath, '10:30')
    return
  }

  if (field.type === 'number' || field.type === 'measurement') {
    setDynamicFieldValue(field.dataPath, (5.8 + fieldIndex * 0.1).toFixed(1))
    return
  }

  if (field.type === 'textarea') {
    setDynamicFieldValue(field.dataPath, `Тестовое примечание для поля «${field.label}».`)
    return
  }

  if (!getDynamicFieldValue(field.dataPath).trim()) {
    setDynamicFieldValue(field.dataPath, field.label)
  }
}

function buildTestTableValue(
  field: DocumentTemplateField,
  fieldIndex: number,
): DocumentTemplateTableValue {
  const tableValue: DocumentTemplateTableValue = {}

  for (const [rowIndex, row] of (field.tableRows ?? []).entries()) {
    const rowValue: DocumentTemplateTableValue[string] = {}

    for (const [columnIndex, column] of (field.tableColumns ?? []).entries()) {
      if (column.type === 'checkbox') {
        rowValue[column.id] = true
      } else if (column.type === 'number') {
        rowValue[column.id] = Number((5.8 + rowIndex + columnIndex * 0.1).toFixed(1))
      } else if (column.type === 'select') {
        rowValue[column.id] =
          [...(column.options ?? [])].sort(
            (firstOption, secondOption) => firstOption.sortOrder - secondOption.sortOrder,
          )[0]?.label ?? 'Соответствует'
      } else {
        rowValue[column.id] = `Тест ${fieldIndex + 1}.${rowIndex + 1}`
      }
    }

    tableValue[row.id] = rowValue
  }

  return tableValue
}

function formatDateForInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

async function handleSave(): Promise<void> {
  if (!canSave.value || !authStore.currentAccount) {
    return
  }

  if (!sampling.points.length) {
    generateSampling()
  }

  isAutosaveReady.value = false
  clearAutosaveTimer()

  const savedReport = await persistDraft('draft')

  if (savedReport) {
    const generatedDocument = await reportDraftStore.generateDocument(savedReport.id)

    if (generatedDocument) {
      await router.push({ name: 'report-details', params: { reportId: savedReport.id } })
    } else {
      isAutosaveReady.value = true
    }
  } else {
    isAutosaveReady.value = true
  }
}

function scheduleAutosave(): void {
  clearAutosaveTimer()
  autosaveState.value = 'idle'
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null
    void persistDraft('draft')
  }, AUTOSAVE_DELAY_MS)
}

function clearAutosaveTimer(): void {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer)
    autosaveTimer = null
  }
}

async function persistDraft(status: 'draft' | 'ready') {
  if (!authStore.currentAccount) {
    return null
  }

  if (activeSavePromise) {
    await activeSavePromise
  }

  autosaveState.value = 'saving'

  const savePromise = reportDraftStore.createReport(buildReportInput(), {
    draftId: draftId.value ?? undefined,
    status,
  })

  activeSavePromise = savePromise

  try {
    const savedReport = await savePromise

    if (savedReport) {
      draftId.value = savedReport.id
      lastSavedAt.value = savedReport.updatedAt
      autosaveState.value = 'saved'
    } else {
      autosaveState.value = 'error'
    }

    return savedReport
  } finally {
    if (activeSavePromise === savePromise) {
      activeSavePromise = null
    }
  }
}

function buildReportInput() {
  const workerAccountId = authStore.currentAccount?.id

  if (!workerAccountId) {
    throw new Error('Не выбран аккаунт работника')
  }

  const resolvedCustomFieldValues = { ...customFieldValues }
  const resolvedMainInfo = { ...mainInfo }
  const resolvedTemperatureInfo = { ...temperatureInfo }
  const resolvedInspectionResults = { ...inspectionResults }
  const resolvedDescriptions = { ...descriptions }
  const resolvedSignatures = { ...signatures }
  let resolvedExpertConclusion = expertConclusion.value
  const resolvedRoots: Record<string, Record<string, string>> = {
    mainInfo: resolvedMainInfo,
    temperatureInfo: resolvedTemperatureInfo,
    inspectionResults: resolvedInspectionResults,
    descriptions: resolvedDescriptions,
    signatures: resolvedSignatures,
  }

  for (const field of templateSections.value.flatMap((section) => section.fields)) {
    if (field.type === 'calculated') {
      const calculatedValue = getCalculatedFieldValue(field)

      if (field.dataPath.startsWith('custom.')) {
        resolvedCustomFieldValues[field.dataPath] = calculatedValue
        continue
      }

      if (field.dataPath === 'expertConclusion') {
        resolvedExpertConclusion = calculatedValue
        continue
      }

      const [rootKey, fieldKey] = field.dataPath.split('.')
      const root = rootKey ? resolvedRoots[rootKey] : undefined

      if (root && fieldKey) {
        root[fieldKey] = calculatedValue
      }

      continue
    }

    if (field.type !== 'signature') {
      continue
    }

    if (field.dataPath.startsWith('custom.')) {
      resolvedCustomFieldValues[field.dataPath] = workerFullName.value
      continue
    }

    if (field.dataPath.startsWith('signatures.')) {
      const signatureKey = field.dataPath.slice('signatures.'.length) as keyof typeof signatures

      if (signatureKey in resolvedSignatures) {
        resolvedSignatures[signatureKey] = workerFullName.value
      }
    }
  }

  return {
    templateId: selectedTemplateId.value,
    workerAccountId,
    productId: productId.value,
    inspectorName: workerFullName.value,
    mainInfo: resolvedMainInfo,
    temperatureInfo: resolvedTemperatureInfo,
    inspectionResults: resolvedInspectionResults,
    descriptions: resolvedDescriptions,
    expertConclusion: resolvedExpertConclusion,
    customFieldValues: resolvedCustomFieldValues,
    sampling: {
      palletCount: sampling.palletCount,
      sampleCount: sampling.sampleCount,
      seed: sampling.seed,
      points: sampling.points.map((point) => ({ ...point })),
    },
    signatures: resolvedSignatures,
    photos: photos.value.map((photo) => ({
      id: photo.id,
      file: photo.file,
      templateFieldId: photo.templateFieldId,
      category: photo.category,
      caption: photo.caption,
      sortOrder: photo.sortOrder,
    })),
  }
}

function createSeededRandom(seed: string): () => number {
  let state = [...seed].reduce((hash, char) => hash + char.charCodeAt(0), 2166136261)

  return () => {
    state += 0x6d2b79f5
    let result = Math.imul(state ^ (state >>> 15), 1 | state)

    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result)

    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

function buildSamplePlace(random: () => number): string {
  const side = random() > 0.5 ? 'Лево' : 'Право'
  const row = Math.floor(random() * 2) + 1
  const height = Math.floor(random() * 11) + 1
  const depth = random() > 0.45 ? ' в глубь' : ''

  return `${side}_${row} Верх_${height}${depth}`
}

function hydrateExistingReport(): void {
  const report = reportDraftStore.selectedReport

  if (!report) {
    return
  }

  draftId.value = report.id
  selectedTemplateId.value = report.templateId ?? documentTemplateStore.activeTemplates[0]?.id ?? ''
  productId.value = report.productId
  expertConclusion.value = report.expertConclusion
  Object.assign(mainInfo, report.mainInfo)
  Object.assign(temperatureInfo, report.temperatureInfo)
  Object.assign(inspectionResults, report.inspectionResults)
  Object.assign(descriptions, report.descriptions)
  Object.assign(customFieldValues, report.customFieldValues ?? {})
  Object.assign(signatures, report.signatures)
  sampling.palletCount = report.sampling.palletCount
  sampling.sampleCount = report.sampling.sampleCount
  sampling.seed = report.sampling.seed
  sampling.points = report.sampling.points.map((point) => ({ ...point }))
  photos.value = reportDraftStore.selectedPhotos.map((photo) => {
    const file = new File([photo.blob], photo.fileName, {
      type: photo.mimeType,
      lastModified: photo.createdAt,
    })

    return {
      id: photo.id,
      file,
      url: URL.createObjectURL(photo.blob),
      fileName: photo.fileName,
      templateFieldId: photo.templateFieldId,
      category: photo.category,
      caption: photo.caption,
      sortOrder: photo.sortOrder,
    }
  })
  lastSavedAt.value = report.updatedAt
  autosaveState.value = 'saved'
}
</script>

<template>
  <main class="screen-page report-form-page">
    <section v-if="formLoadError" class="empty-state app-card" role="alert">
      <strong>Не удалось открыть черновик</strong>
      <span>{{ formLoadError }}</span>
      <button class="secondary-button" type="button" @click="router.back()">Вернуться назад</button>
    </section>

    <section v-else-if="!isFormReady" class="form-loading app-card" aria-live="polite">
      <span class="form-loading__spinner" aria-hidden="true" />
      <div>
        <strong>Загружаем выбранный макет…</strong>
        <span>Подготавливаем поля и сохраненный черновик.</span>
      </div>
    </section>

    <div v-if="isFormReady" class="form-local-strip">
      <strong>Шаг {{ completedStepCount }} из {{ steps.length }}</strong>
      <span class="autosave-status" :class="`autosave-status--${autosaveState}`" aria-live="polite">
        {{ autosaveMessage }}
      </span>
    </div>

    <form v-if="isFormReady" class="report-form" @submit.prevent="handleSave">
      <aside class="test-autofill-panel">
        <div>
          <strong>Тестовый режим</strong>
          <span>Временно заполняет обычные и динамические поля выбранного макета.</span>
        </div>
        <button
          class="secondary-button test-autofill-panel__button"
          type="button"
          :disabled="!isFormReady || !selectedTemplateId || reportDraftStore.isSaving"
          @click="fillWithTestData"
        >
          Заполнить тестовыми данными
        </button>
        <p v-if="testAutofillNotice" aria-live="polite">{{ testAutofillNotice }}</p>
      </aside>

      <nav class="report-steps" aria-label="Разделы отчета">
        <button
          v-for="(step, index) in steps"
          :key="step.id"
          class="report-step"
          :class="{
            'report-step--active': step.id === activeStepId,
            'report-step--filled': isStepFilled(step.id),
          }"
          type="button"
          @click="setStep(step.id)"
        >
          <span class="report-step__number">{{ index + 1 }}</span>
          <span
            class="report-step__text"
            :data-i18n-ignore="templateSections.length ? '' : undefined"
          >
            {{ step.title }}
          </span>
        </button>
      </nav>

      <p class="step-progress">
        <span>Шаг {{ completedStepCount }} из {{ steps.length }} ·&nbsp;</span>
        <span :data-i18n-ignore="templateSections.length ? '' : undefined">
          {{ activeStep.subtitle }}
        </span>
      </p>

      <FormSection
        v-if="activeTemplateSection"
        :title="activeTemplateSection.title"
        :subtitle="activeTemplateSection.description"
        content-is-template-data
      >
        <div class="dynamic-field-grid">
          <template v-for="field in activeTemplateSection.fields" :key="field.id">
            <section
              v-if="field.type === 'photo' || field.dataPath === 'photos'"
              class="dynamic-special-block dynamic-field--full"
            >
              <div class="dynamic-special-block__heading">
                <div>
                  <h3 data-i18n-ignore>{{ getFieldLabel(field) }}</h3>
                  <p v-if="getFieldHelpText(field)" data-i18n-ignore>
                    {{ getFieldHelpText(field) }}
                  </p>
                  <p v-else>Добавьте фотографии для этого поля.</p>
                </div>
                <strong v-if="field.required">Обязательно</strong>
              </div>

              <PhotoPicker
                :photos="getPhotosByTemplateField(field.id)"
                :disabled="reportDraftStore.isSaving"
                @select-photo="(file) => handleTemplatePhotoSelected(field.id, file)"
                @update-caption="updatePhotoCaption"
                @remove-photo="removePhoto"
              />
            </section>

            <section
              v-else-if="field.dataPath === 'sampling.points'"
              class="dynamic-special-block dynamic-field--full"
            >
              <div class="dynamic-special-block__heading">
                <div>
                  <h3 data-i18n-ignore>{{ getFieldLabel(field) }}</h3>
                  <p v-if="getFieldHelpText(field)" data-i18n-ignore>
                    {{ getFieldHelpText(field) }}
                  </p>
                  <p v-else>Сформируйте случайные точки контроля по палетам.</p>
                </div>
                <strong v-if="field.required">Обязательно</strong>
              </div>

              <div class="sampling-grid">
                <label class="field-label">
                  Палет
                  <input
                    v-model.number="sampling.palletCount"
                    class="field-control"
                    type="number"
                    min="1"
                  />
                </label>
                <label class="field-label">
                  Точек выборки
                  <input
                    v-model.number="sampling.sampleCount"
                    class="field-control"
                    type="number"
                    min="1"
                  />
                </label>
                <label class="field-label">
                  Seed
                  <input v-model="sampling.seed" class="field-control" />
                </label>
                <button class="secondary-button" type="button" @click="generateSampling">
                  Сгенерировать
                </button>
              </div>

              <div v-if="sampling.points.length" class="sample-table">
                <label v-for="point in sampling.points" :key="point.id" class="sample-row">
                  <input v-model="point.pallet" class="field-control" />
                  <input v-model="point.place" class="field-control" />
                </label>
              </div>
            </section>

            <section
              v-else-if="field.type === 'table'"
              class="dynamic-special-block dynamic-field--full mobile-check-table"
            >
              <div class="dynamic-special-block__heading">
                <div>
                  <h3 data-i18n-ignore>{{ getFieldLabel(field) }}</h3>
                  <p v-if="getFieldHelpText(field)" data-i18n-ignore>
                    {{ getFieldHelpText(field) }}
                  </p>
                  <p v-else>Заполните результаты проверки по пунктам.</p>
                </div>
                <strong v-if="field.required">Обязательно</strong>
              </div>

              <article
                v-for="(row, rowIndex) in field.tableRows ?? []"
                :key="row.id"
                class="mobile-check-row"
              >
                <div class="mobile-check-row__heading">
                  <span>{{ rowIndex + 1 }}</span>
                  <div>
                    <strong data-i18n-ignore>{{ row.label }}</strong>
                    <small v-if="row.helpText" data-i18n-ignore>{{ row.helpText }}</small>
                  </div>
                </div>
                <div class="mobile-check-row__fields">
                  <label
                    v-for="column in field.tableColumns ?? []"
                    :key="column.id"
                    class="field-label"
                  >
                    <span data-i18n-ignore>{{ column.label }}</span>
                    <input
                      v-if="column.type === 'checkbox'"
                      class="check-control"
                      type="checkbox"
                      :checked="getTableCellValue(field.dataPath, row.id, column.id) === true"
                      @change="
                        setTableCellValue(
                          field.dataPath,
                          row.id,
                          column.id,
                          getEventChecked($event),
                        )
                      "
                    />
                    <select
                      v-else-if="column.type === 'select'"
                      class="field-control"
                      :value="getTableCellValue(field.dataPath, row.id, column.id)"
                      @change="
                        setTableCellValue(field.dataPath, row.id, column.id, getEventValue($event))
                      "
                    >
                      <option value="" disabled hidden>Выберите</option>
                      <option
                        v-for="option in column.options ?? []"
                        :key="option.id"
                        :value="option.label"
                        data-i18n-ignore
                      >
                        {{ option.label }}
                      </option>
                    </select>
                    <span v-else class="input-with-unit">
                      <input
                        class="field-control"
                        :type="column.type === 'number' ? 'number' : 'text'"
                        :value="getTableCellValue(field.dataPath, row.id, column.id)"
                        @input="
                          setTableCellValue(
                            field.dataPath,
                            row.id,
                            column.id,
                            getEventValue($event),
                          )
                        "
                      />
                      <small v-if="column.unit">{{ column.unit }}</small>
                    </span>
                  </label>
                </div>
              </article>
            </section>

            <section
              v-else
              class="field-label dynamic-field"
              :class="{ 'dynamic-field--full': field.width === 'full' }"
            >
              <span data-i18n-ignore>
                {{ getFieldLabel(field) }}
                <em v-if="field.required">*</em>
              </span>

              <input
                v-if="field.type === 'signature'"
                class="field-control signature-field"
                type="text"
                :value="workerFullName"
                autocomplete="name"
                readonly
              />

              <label v-else-if="field.type === 'checkbox'" class="boolean-field">
                <input
                  type="checkbox"
                  :checked="getDynamicBooleanValue(field.dataPath)"
                  @change="setDynamicFieldValue(field.dataPath, getEventChecked($event))"
                />
                <span v-if="getFieldPlaceholder(field)" data-i18n-ignore>
                  {{ getFieldPlaceholder(field) }}
                </span>
                <span v-else>Подтверждаю</span>
              </label>

              <div
                v-else-if="field.type === 'radio' || field.type === 'passFail'"
                class="choice-card-grid"
              >
                <label
                  v-for="option in getDynamicSelectOptions(field)"
                  :key="option.id"
                  class="choice-card"
                >
                  <input
                    type="radio"
                    :name="field.id"
                    :value="option.value"
                    :checked="getDynamicFieldValue(field.dataPath) === option.value"
                    @change="setDynamicFieldValue(field.dataPath, option.value)"
                  />
                  <span data-i18n-ignore>{{ option.label }}</span>
                </label>
              </div>

              <output v-else-if="field.type === 'calculated'" class="calculated-field">
                {{ getCalculatedFieldValue(field) || 'Будет рассчитано автоматически' }}
                <small v-if="field.unit">{{ field.unit }}</small>
              </output>

              <select
                v-else-if="field.type === 'select' && getDynamicSelectOptions(field).length"
                class="field-control"
                :value="getDynamicFieldValue(field.dataPath)"
                :required="field.required"
                @change="setDynamicFieldValue(field.dataPath, getEventValue($event))"
              >
                <option v-if="getFieldPlaceholder(field)" value="" disabled hidden data-i18n-ignore>
                  {{ getFieldPlaceholder(field) }}
                </option>
                <option v-else value="" disabled hidden>Выберите значение</option>
                <option
                  v-for="option in getDynamicSelectOptions(field)"
                  :key="option.id"
                  :value="option.value"
                  data-i18n-ignore
                >
                  {{ option.label }}
                </option>
              </select>

              <textarea
                v-else-if="field.type === 'textarea'"
                class="field-control textarea"
                :value="getDynamicFieldValue(field.dataPath)"
                :placeholder="getFieldPlaceholder(field)"
                data-i18n-ignore
                :required="field.required"
                @input="setDynamicFieldValue(field.dataPath, getEventValue($event))"
              />

              <div v-else-if="field.type === 'measurement'" class="measurement-field">
                <div v-if="field.standardValue" class="measurement-field__standard">
                  Норма: <strong data-i18n-ignore>{{ field.standardValue }}</strong>
                </div>
                <span class="input-with-unit">
                  <input
                    class="field-control"
                    type="number"
                    inputmode="decimal"
                    :value="getDynamicFieldValue(field.dataPath)"
                    :placeholder="getFieldPlaceholder(field)"
                    data-i18n-ignore
                    :required="field.required"
                    @input="setDynamicFieldValue(field.dataPath, getEventValue($event))"
                  />
                  <small v-if="field.unit">{{ field.unit }}</small>
                </span>
              </div>

              <input
                v-else
                class="field-control"
                :type="getDynamicInputType(field)"
                :value="getDynamicFieldValue(field.dataPath)"
                :placeholder="getFieldPlaceholder(field)"
                data-i18n-ignore
                :required="field.required"
                @input="setDynamicFieldValue(field.dataPath, getEventValue($event))"
              />

              <small v-if="getFieldHelpText(field)" class="dynamic-field__help" data-i18n-ignore>
                {{ getFieldHelpText(field) }}
              </small>
            </section>
          </template>

          <p v-if="!activeTemplateSection.fields.length" class="empty-state dynamic-field--full">
            В этом разделе макета пока нет полей.
          </p>
        </div>
      </FormSection>

      <FormSection
        v-if="!selectedDocumentTemplate && activeStepId === 'shipment'"
        title="Партия и инспекция"
      >
        <div class="field-stack two-columns">
          <label class="field-label" for="inspectorName">
            Работник
            <input
              id="inspectorName"
              :value="workerFullName"
              class="field-control"
              type="text"
              autocomplete="name"
              readonly
            />
          </label>

          <label v-for="field in shipmentFields" :key="field.key" class="field-label">
            {{ field.label }}
            <input
              v-model="mainInfo[field.key]"
              class="field-control"
              :type="field.type ?? 'text'"
              :placeholder="field.placeholder"
            />
          </label>
        </div>
      </FormSection>

      <FormSection
        v-if="!selectedDocumentTemplate && activeStepId === 'product'"
        title="Продукт и упаковка"
        subtitle="После данных о партии укажите товар, фасовку, PLU и маркировку."
      >
        <div class="field-stack two-columns">
          <label class="field-label" for="productId">
            Тип товара
            <select id="productId" v-model="productId" class="field-control">
              <option v-for="product in productOptions" :key="product.id" :value="product.id">
                {{ product.label }}
              </option>
            </select>
          </label>

          <label class="field-label">
            Наименование товара
            <input :value="mainInfo.productName" class="field-control" readonly />
          </label>

          <label class="field-label">
            Фасовка
            <select v-model="mainInfo.packageName" class="field-control">
              <option v-for="option in packageOptions" :key="option.id" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>

          <label class="field-label">
            Вид упаковки
            <select v-model="mainInfo.packingKind" class="field-control">
              <option value="">Не выбрано</option>
              <option v-for="option in packingKindOptions" :key="option.id" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>

          <label v-for="field in productFields" :key="field.key" class="field-label">
            {{ field.label }}
            <input
              v-model="mainInfo[field.key]"
              class="field-control"
              :type="field.type ?? 'text'"
              :placeholder="field.placeholder"
            />
          </label>
        </div>
      </FormSection>

      <FormSection
        v-if="!selectedDocumentTemplate && activeStepId === 'temperature'"
        title="Температура и пломбы"
      >
        <div class="field-stack two-columns">
          <label class="field-label">
            Рекомендованная температура
            <input v-model="temperatureInfo.storageTemperature" class="field-control" />
          </label>
          <label class="field-label">
            Пульпа при открытии
            <input v-model="temperatureInfo.pulpTemperature" class="field-control" />
          </label>
          <label class="field-label">
            Нарушение температуры
            <select v-model="temperatureInfo.temperatureViolation" class="field-control">
              <option
                v-for="option in temperatureViolationOptions"
                :key="option.id"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>
          <label class="field-label">
            Пломба
            <input v-model="temperatureInfo.sealNumber" class="field-control" />
          </label>
          <label class="field-label">
            Наличие термографов
            <select v-model="temperatureInfo.thermographPresence" class="field-control">
              <option
                v-for="option in thermographPresenceOptions"
                :key="option.id"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>
          <label class="field-label">
            Нарушение термографов
            <select v-model="temperatureInfo.thermographViolation" class="field-control">
              <option
                v-for="option in thermographViolationOptions"
                :key="option.id"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>
        </div>
      </FormSection>

      <FormSection
        v-if="!selectedDocumentTemplate && activeStepId === 'results'"
        title="Результаты инспекции"
      >
        <div class="field-stack two-columns">
          <label v-for="field in resultFields" :key="field.key" class="field-label">
            {{ field.label }}
            <input v-model="inspectionResults[field.key]" class="field-control" />
          </label>
          <label class="field-label">
            Калибр соответствует ПК
            <select v-model="inspectionResults.caliberPassportMatch" class="field-control">
              <option
                v-for="option in caliberPassportMatchOptions"
                :key="option.id"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>
          <label class="field-label">
            Сорт соответствует ПК
            <select v-model="inspectionResults.varietyPassportMatch" class="field-control">
              <option
                v-for="option in varietyPassportMatchOptions"
                :key="option.id"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>
        </div>
      </FormSection>

      <FormSection
        v-if="!selectedDocumentTemplate && activeStepId === 'defects'"
        title="Описание дефектов"
      >
        <div class="field-stack">
          <label class="field-label">
            Нестандарт для 2 категории
            <textarea v-model="descriptions.secondClassDefects" class="field-control textarea" />
          </label>
          <label class="field-label">
            Отход
            <textarea v-model="descriptions.waste" class="field-control textarea" />
          </label>
          <label class="field-label">
            Не соответствует калибру
            <textarea v-model="descriptions.caliberMismatch" class="field-control textarea" />
          </label>
          <label class="field-label">
            Заключение эксперта
            <textarea v-model="expertConclusion" class="field-control textarea textarea--large" />
          </label>
        </div>
      </FormSection>

      <FormSection
        v-if="!selectedDocumentTemplate && activeStepId === 'sampling'"
        title="Генератор случайных значений"
      >
        <div class="sampling-grid">
          <label class="field-label">
            Палет
            <input
              v-model.number="sampling.palletCount"
              class="field-control"
              type="number"
              min="1"
            />
          </label>
          <label class="field-label">
            Точек выборки
            <input
              v-model.number="sampling.sampleCount"
              class="field-control"
              type="number"
              min="1"
            />
          </label>
          <label class="field-label">
            Seed
            <input v-model="sampling.seed" class="field-control" />
          </label>
          <button class="secondary-button" type="button" @click="generateSampling">
            Сгенерировать
          </button>
        </div>

        <div v-if="sampling.points.length" class="sample-table">
          <label v-for="point in sampling.points" :key="point.id" class="sample-row">
            <input v-model="point.pallet" class="field-control" />
            <input v-model="point.place" class="field-control" />
          </label>
        </div>
      </FormSection>

      <FormSection
        v-if="!selectedDocumentTemplate && activeStepId === 'photos'"
        title="Фотоотчет"
        subtitle="Добавьте снимки в нужные категории документа."
      >
        <div class="photo-category-stack">
          <section v-for="category in photoCategories" :key="category.id" class="photo-category">
            <div class="photo-category__header">
              <div>
                <h3>{{ category.title }}</h3>
                <p>{{ category.subtitle }}</p>
              </div>
              <span>{{ getPhotosByCategory(category.id).length }}</span>
            </div>

            <PhotoPicker
              :photos="getPhotosByCategory(category.id)"
              :disabled="reportDraftStore.isSaving"
              @select-photo="(file) => handlePhotoSelected(category.id, file)"
              @update-caption="updatePhotoCaption"
              @remove-photo="removePhoto"
            />
          </section>
        </div>
      </FormSection>

      <FormSection
        v-if="!selectedDocumentTemplate && activeStepId === 'signatures'"
        title="Подписи и выпуск"
      >
        <div class="field-stack two-columns">
          <label class="field-label">
            Отчет издан
            <input v-model="signatures.reportIssuedDate" class="field-control" type="date" />
          </label>
          <label class="field-label">
            Эксперт
            <input v-model="signatures.expertName" class="field-control" />
          </label>
          <label class="field-label">
            Представитель ТС
            <input v-model="signatures.retailRepresentativeName" class="field-control" />
          </label>
        </div>
      </FormSection>

      <div class="wizard-actions">
        <button
          class="secondary-button"
          type="button"
          :disabled="isFirstStep"
          @click="goToPreviousStep"
        >
          Назад
        </button>

        <button v-if="!isLastStep" class="primary-button" type="button" @click="goToNextStep">
          Далее
        </button>

        <button
          v-else
          class="primary-button"
          type="submit"
          :disabled="!canSave || reportDraftStore.isSaving"
        >
          {{ reportDraftStore.isSaving ? 'Создаем PDF...' : 'Сформировать и проверить PDF' }}
        </button>
      </div>

      <p v-if="isLastStep && !canSave" class="form-hint">
        Заполните обязательные поля, чтобы сформировать итоговый PDF.
      </p>

      <p v-if="reportDraftStore.errorMessage" class="error-message">
        {{ reportDraftStore.errorMessage }}
      </p>
    </form>
  </main>
</template>

<style scoped>
.report-form-page {
  width: min(100%, 980px);
  margin: 0 auto;
}

.report-form {
  display: grid;
  gap: 16px;
}

.form-loading {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 96px;
  padding: 20px;
}

.form-loading > div {
  display: grid;
  gap: 4px;
}

.form-loading strong {
  font-size: 0.92rem;
  font-weight: 900;
}

.form-loading span:last-child {
  color: var(--color-text-muted);
  font-size: 0.78rem;
}

.form-loading__spinner {
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  border: 3px solid var(--color-primary-soft);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: form-loading-spin 0.8s linear infinite;
}

@keyframes form-loading-spin {
  to {
    transform: rotate(360deg);
  }
}

.test-autofill-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px 14px;
  border: 1px dashed #b87a13;
  border-radius: 8px;
  padding: 12px;
  background: #fff8e8;
  color: var(--color-text);
}

.test-autofill-panel > div {
  display: grid;
  gap: 2px;
}

.test-autofill-panel strong {
  color: #8a5a00;
  font-size: 0.86rem;
  font-weight: 900;
}

.test-autofill-panel span,
.test-autofill-panel p {
  color: var(--color-text-muted);
  font-size: 0.78rem;
}

.test-autofill-panel p {
  grid-column: 1 / -1;
  margin: 0;
}

.test-autofill-panel__button {
  white-space: nowrap;
}

.dynamic-field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.dynamic-field--full {
  grid-column: 1 / -1;
}

.dynamic-field > span {
  color: var(--color-text);
  font-size: 0.84rem;
  font-weight: 800;
}

.dynamic-field em {
  color: var(--color-danger);
  font-style: normal;
}

.dynamic-field__help {
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 500;
}

.dynamic-special-block {
  display: grid;
  gap: 14px;
}

.dynamic-special-block__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 10px;
}

.dynamic-special-block__heading h3 {
  color: var(--color-text);
  font-size: 0.92rem;
  font-weight: 900;
}

.dynamic-special-block__heading p {
  margin-top: 3px;
  color: var(--color-text-muted);
  font-size: 0.76rem;
}

.dynamic-special-block__heading > strong {
  border-radius: 7px;
  padding: 5px 8px;
  background: var(--color-danger-soft);
  color: var(--color-danger);
  font-size: 0.66rem;
  font-weight: 900;
}

.mobile-check-table {
  gap: 12px;
}

.mobile-check-row {
  display: grid;
  gap: 12px;
  padding: 14px;
  background: #f7faf8;
  border: 1px solid var(--color-border);
  border-radius: 12px;
}

.mobile-check-row__heading {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.mobile-check-row__heading > span {
  display: grid;
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  place-items: center;
  color: #fff;
  background: var(--color-primary);
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 900;
}

.mobile-check-row__heading div,
.mobile-check-row__fields {
  display: grid;
  gap: 8px;
}

.mobile-check-row__heading small {
  color: var(--color-text-muted);
}

.mobile-check-row__fields {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.boolean-field,
.choice-card {
  display: flex;
  gap: 10px;
  align-items: center;
  min-height: 46px;
  padding: 10px 12px;
  background: #f7faf8;
  border: 1px solid var(--color-border);
  border-radius: 10px;
}

.choice-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
}

.choice-card:has(input:checked) {
  color: var(--color-primary);
  background: var(--color-primary-soft);
  border-color: var(--color-primary);
}

.measurement-field,
.input-with-unit {
  display: grid;
  gap: 6px;
}

.input-with-unit {
  display: flex;
  align-items: center;
  gap: 8px;
  direction: ltr;
}

.input-with-unit > .field-control {
  min-width: 0;
  flex: 1;
  direction: ltr;
  text-align: left;
}

.input-with-unit > small {
  flex: none;
  color: var(--color-text-muted);
}

.measurement-field__standard {
  color: var(--color-text-muted);
  font-size: 0.76rem;
}

.calculated-field {
  min-height: 46px;
  padding: 12px;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  border-radius: 10px;
  font-weight: 850;
}

.form-local-strip {
  position: sticky;
  z-index: 10;
  top: var(--workspace-topbar-offset, 72px);
  display: flex;
  align-self: start;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  border: 1px solid rgba(34, 57, 43, 0.16);
  border-radius: 8px;
  padding: 11px 12px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.form-local-strip span,
.form-local-strip strong {
  font-size: 0.82rem;
  font-weight: 850;
}

.autosave-status {
  margin-left: auto;
}

.autosave-status--idle,
.autosave-status--saving {
  color: #8a5a00;
}

.autosave-status--error {
  color: var(--color-danger);
}

.report-steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
  gap: 8px;
}

.report-step {
  display: flex;
  min-height: 54px;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 9px 10px;
  background: var(--color-surface);
  color: var(--color-text-muted);
  text-align: left;
  box-shadow: 0 8px 18px rgba(34, 57, 43, 0.06);
}

.report-step--filled {
  border-color: #bfd2c6;
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.report-step--active {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #ffffff;
}

.report-step__number {
  display: inline-flex;
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--color-surface-muted);
  font-size: 0.78rem;
  font-weight: 900;
}

.report-step--active .report-step__number {
  background: rgba(255, 255, 255, 0.18);
  color: #ffffff;
}

.report-step__text {
  overflow: hidden;
  font-size: 0.86rem;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-progress {
  border-left: 3px solid var(--color-accent);
  padding-left: 10px;
  color: var(--color-text-muted);
  font-size: 0.88rem;
  font-weight: 800;
}

.two-columns,
.sampling-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.textarea {
  min-height: 92px;
  resize: vertical;
}

.textarea--large {
  min-height: 150px;
}

.sampling-grid {
  display: grid;
  gap: 12px;
  align-items: end;
}

.secondary-button,
.text-button {
  min-height: 44px;
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--color-surface);
  color: var(--color-primary);
  font-weight: 850;
}

.secondary-button:disabled {
  opacity: 0.45;
}

.sample-table {
  display: grid;
  gap: 8px;
  margin-top: 14px;
}

.sample-row {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 8px;
}

.photo-category-stack {
  display: grid;
  gap: 14px;
}

.photo-category {
  display: grid;
  gap: 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 14px;
  background: var(--color-surface);
  box-shadow: 0 8px 20px rgba(34, 57, 43, 0.06);
}

.photo-category__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.photo-category__header h3 {
  color: var(--color-text);
  font-size: 0.98rem;
  font-weight: 800;
}

.photo-category__header p,
.form-hint {
  color: var(--color-text-muted);
  font-size: 0.86rem;
}

.photo-category__header span {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 4px 9px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 0.78rem;
  font-weight: 850;
}

.wizard-actions {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 10px;
  background: var(--color-surface);
  box-shadow: 0 10px 24px var(--color-shadow);
}

.wizard-actions .primary-button,
.wizard-actions .secondary-button {
  min-width: 150px;
}

.primary-button:disabled {
  background: var(--color-border-strong);
  color: var(--color-text-muted);
}

@media (max-width: 760px) {
  .two-columns,
  .sampling-grid,
  .sample-row,
  .dynamic-field-grid {
    grid-template-columns: 1fr;
  }

  .dynamic-field--full {
    grid-column: auto;
  }
}

@media (max-width: 520px) {
  .test-autofill-panel {
    grid-template-columns: 1fr;
  }

  .test-autofill-panel p {
    grid-column: auto;
  }

  .test-autofill-panel__button {
    width: 100%;
    white-space: normal;
  }

  .form-local-strip {
    gap: 8px;
  }

  .form-local-strip strong,
  .autosave-status {
    white-space: nowrap;
  }

  .wizard-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .wizard-actions .primary-button,
  .wizard-actions .secondary-button {
    min-width: 0;
    width: 100%;
    padding-inline: 8px;
  }
}
</style>
