<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import FormSection from '@/components/reports/FormSection.vue'
import PhotoPicker from '@/components/reports/PhotoPicker.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useReportDraftStore } from '@/stores/report-draft.store'
import { useReportTemplateStore } from '@/stores/report-template.store'
import type {
  ReportInspectionResults,
  ReportMainInfo,
  ReportPhotoCategory,
  ReportSamplePoint,
} from '@/types/report'

type ReportStepId =
  | 'shipment'
  | 'product'
  | 'temperature'
  | 'results'
  | 'defects'
  | 'sampling'
  | 'photos'
  | 'signatures'

interface LocalPhotoInput {
  id: string
  file: File
  url: string
  fileName: string
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
const reportDraftStore = useReportDraftStore()
const reportTemplateStore = useReportTemplateStore()

const initialProductId = 'sweet-red-pepper'
const initialExpertConclusion = ''

const initialMainInfo = {
  orderNumber: '',
  zost: '',
  shipper: '',
  trailerNumber: '',
  placeOfSurvey: '',
  productName: 'Перец красный сладкий 1 кг',
  packageName: '1 кг',
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
const productId = ref(initialProductId)
const expertConclusion = ref(initialExpertConclusion)
const photos = ref<LocalPhotoInput[]>([])

const mainInfo = reactive({ ...initialMainInfo })

const temperatureInfo = reactive({ ...initialTemperatureInfo })

const inspectionResults = reactive({ ...initialInspectionResults })

const descriptions = reactive({ ...initialDescriptions })

const sampling = reactive({
  ...initialSampling,
  points: [] as ReportSamplePoint[],
})

const signatures = reactive({ ...initialSignatures })

const steps: Array<{ id: ReportStepId; title: string; subtitle: string }> = [
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

const activeStep = computed(() => steps.find((step) => step.id === activeStepId.value) ?? steps[0]!)
const activeStepIndex = computed(() => steps.findIndex((step) => step.id === activeStepId.value))
const isFirstStep = computed(() => activeStepIndex.value === 0)
const isLastStep = computed(() => activeStepIndex.value === steps.length - 1)
const completedStepCount = computed(() => activeStepIndex.value + 1)
const workerFullName = computed(() => authStore.currentAccount?.fullName ?? '')
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
    Boolean(productId.value) &&
    Boolean(workerFullName.value.trim()) &&
    Boolean(mainInfo.orderNumber.trim()) &&
    Boolean(mainInfo.placeOfSurvey.trim()),
)

watch(productId, (selectedProductId) => {
  const product = productOptions.value.find((option) => option.id === selectedProductId)

  if (product) {
    mainInfo.productName = product.label
  }
})

watch(productOptions, (options) => {
  if (!options.length) {
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

onMounted(() => {
  void reportTemplateStore.loadOptions()
})

onUnmounted(() => {
  photos.value.forEach((photo) => URL.revokeObjectURL(photo.url))
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

function isStepFilled(stepId: ReportStepId): boolean {
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
      return productId.value !== initialProductId || hasChangedFields(mainInfo, {
        productName: initialMainInfo.productName,
        packageName: initialMainInfo.packageName,
        plu: initialMainInfo.plu,
        packingKind: initialMainInfo.packingKind,
        boxMarking: initialMainInfo.boxMarking,
      })
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
}

function goToPreviousStep(): void {
  if (isFirstStep.value) {
    return
  }

  const previousStep = steps[activeStepIndex.value - 1]

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

  const nextStep = steps[activeStepIndex.value + 1]

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
  return photos.value.filter((photo) => photo.category === category)
}

function handlePhotoSelected(category: ReportPhotoCategory, file: File): void {
  const nextOrder = photos.value.length + 1

  photos.value = [
    ...photos.value,
    {
      id: `${category}-${file.name}-${file.lastModified}-${nextOrder}`,
      file,
      url: URL.createObjectURL(file),
      fileName: file.name || 'Фото отчета',
      category,
      caption: '',
      sortOrder: nextOrder,
    },
  ]
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

async function handleSave(): Promise<void> {
  if (!canSave.value || reportDraftStore.isSaving || !authStore.currentAccount) {
    return
  }

  if (!sampling.points.length) {
    generateSampling()
  }

  const savedReport = await reportDraftStore.createReport({
    workerAccountId: authStore.currentAccount.id,
    productId: productId.value,
    inspectorName: workerFullName.value,
    mainInfo: { ...mainInfo },
    temperatureInfo: { ...temperatureInfo },
    inspectionResults: { ...inspectionResults },
    descriptions: { ...descriptions },
    expertConclusion: expertConclusion.value,
    sampling: {
      palletCount: sampling.palletCount,
      sampleCount: sampling.sampleCount,
      seed: sampling.seed,
      points: sampling.points.map((point) => ({ ...point })),
    },
    signatures: { ...signatures },
    photos: photos.value.map((photo) => ({
      file: photo.file,
      category: photo.category,
      caption: photo.caption,
      sortOrder: photo.sortOrder,
    })),
  })

  if (savedReport) {
    await router.push({ name: 'report-details', params: { reportId: savedReport.id } })
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
</script>

<template>
  <main class="screen-page report-form-page">
    <section class="screen-heading">
      <div>
        <p class="screen-kicker">Новый отчет</p>
        <h1 class="screen-title">Quality inspection report</h1>
        <p class="screen-subtitle">
          Заполняйте отчет по шагам. Сохранение происходит локально, синхронизация уйдет в фон.
        </p>
      </div>
    </section>

    <div class="form-local-strip">
      <span>Локальный черновик</span>
      <strong>Шаг {{ completedStepCount }} из {{ steps.length }}</strong>
    </div>

    <form class="report-form" @submit.prevent="handleSave">
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
          <span class="report-step__text">{{ step.title }}</span>
        </button>
      </nav>

      <p class="step-progress">
        Шаг {{ completedStepCount }} из {{ steps.length }} · {{ activeStep.subtitle }}
      </p>

      <FormSection
        v-if="activeStepId === 'shipment'"
        title="Партия и инспекция"
        subtitle="Здесь заполняются данные о заказе, поставщике, транспорте и месте контроля."
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
        v-if="activeStepId === 'product'"
        title="Продукт и упаковка"
        subtitle="После данных о партии укажите товар, фасовку, PLU и маркировку."
      >
        <div class="field-stack two-columns">
          <label class="field-label" for="productId">
            Тип товара
            <select id="productId" v-model="productId" class="field-control">
              <option
                v-for="product in productOptions"
                :key="product.id"
                :value="product.id"
              >
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

      <FormSection v-if="activeStepId === 'temperature'" title="Температура и пломбы">
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

      <FormSection v-if="activeStepId === 'results'" title="Результаты инспекции">
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

      <FormSection v-if="activeStepId === 'defects'" title="Описание дефектов">
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

      <FormSection v-if="activeStepId === 'sampling'" title="Генератор случайных значений">
        <div class="sampling-grid">
          <label class="field-label">
            Палет
            <input v-model.number="sampling.palletCount" class="field-control" type="number" min="1" />
          </label>
          <label class="field-label">
            Точек выборки
            <input v-model.number="sampling.sampleCount" class="field-control" type="number" min="1" />
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
        v-if="activeStepId === 'photos'"
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
            />

            <label
              v-for="photo in getPhotosByCategory(category.id)"
              :key="photo.id"
              class="field-label photo-caption"
            >
              Подпись к фото
              <input v-model="photo.caption" class="field-control" />
              <button class="text-button" type="button" @click="removePhoto(photo.id)">
                Удалить фото
              </button>
            </label>
          </section>
        </div>
      </FormSection>

      <FormSection v-if="activeStepId === 'signatures'" title="Подписи и выпуск">
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
          {{
            reportDraftStore.isSaving ? 'Сохраняем локально...' : 'Сохранить и открыть документ'
          }}
        </button>
      </div>

      <p v-if="isLastStep && !canSave" class="form-hint">
        Минимум для документа: товар, инспектор, номер заказа и место инспекции.
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

.form-local-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
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

.photo-caption {
  margin-top: 4px;
}

.text-button {
  justify-self: start;
  min-height: 36px;
  color: var(--color-danger);
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
  .sample-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .wizard-actions {
    display: grid;
  }

  .wizard-actions .primary-button,
  .wizard-actions .secondary-button {
    width: 100%;
  }
}
</style>
