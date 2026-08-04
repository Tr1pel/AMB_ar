<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import { generateQualityReportPdf } from '@/shared/documents/quality-report-pdf'
import { useAuthStore } from '@/stores/auth.store'
import { useReportDraftStore } from '@/stores/report-draft.store'
import type { ReportPhotoCategory, ReportSamplePoint } from '@/types/report'

interface StoredPhotoPreview {
  id: string
  url: string
  fileName: string
  caption: string
  templateFieldId?: string
  category: ReportPhotoCategory
}

interface PhotoDisplayGroup {
  id: string
  title: string
  subtitle: string
  photos: StoredPhotoPreview[]
}

const props = defineProps<{
  reportId: string
}>()

const reportDraftStore = useReportDraftStore()
const authStore = useAuthStore()
const router = useRouter()
const photoPreviews = ref<StoredPhotoPreview[]>([])

const photoCategories: Array<{ id: ReportPhotoCategory; title: string; subtitle: string }> = [
  { id: 'vehicle', title: 'Vehicle', subtitle: 'Транспортное средство' },
  { id: 'temperature', title: 'Temperature', subtitle: 'Температура' },
  { id: 'facade', title: 'Facade', subtitle: 'Аллея' },
  { id: 'selection', title: 'Selection', subtitle: 'ГСЗ' },
  { id: 'goods', title: 'Goods', subtitle: 'Общий вид товара' },
  { id: 'destructiveTesting', title: 'Destructive testing', subtitle: 'Разрушающий контроль' },
  { id: 'caliber', title: 'Caliber', subtitle: 'Калибр' },
  { id: 'waste', title: 'Waste', subtitle: 'Отход' },
  { id: 'notStandard', title: 'Not correspond to the standard', subtitle: 'Нестандарт' },
]

const photoDisplayGroups = computed<PhotoDisplayGroup[]>(() => {
  const photoFields = (reportDraftStore.selectedReport?.templateSnapshot?.sections ?? []).flatMap(
    (section) =>
      [...section.fields]
        .sort((firstField, secondField) => firstField.sortOrder - secondField.sortOrder)
        .filter((field) => field.type === 'photo' || field.dataPath === 'photos'),
  )

  if (photoFields.length) {
    return photoFields.map((field, fieldIndex) => ({
      id: field.id,
      title: field.label,
      subtitle: field.helpText,
      photos: photoPreviews.value.filter(
        (photo) =>
          photo.templateFieldId === field.id ||
          (!photo.templateFieldId && fieldIndex === 0),
      ),
    }))
  }

  return photoCategories.map((category) => ({
    ...category,
    photos: photoPreviews.value.filter((photo) => photo.category === category.id),
  }))
})

const savedAtLabel = computed(() => {
  if (!reportDraftStore.selectedReport) {
    return ''
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(reportDraftStore.selectedReport.updatedAt)
})
const backRoute = computed(() =>
  authStore.isAdmin ? { name: 'admin-reports' } : { name: 'worker-reports' },
)

const mainRows = computed(() => {
  const report = reportDraftStore.selectedReport

  if (!report) {
    return []
  }

  return [
    ['Number of order / Номер заказа', report.mainInfo.orderNumber],
    ['ZOST', report.mainInfo.zost],
    ['Shipper / Поставщик', report.mainInfo.shipper],
    ['Trailer N / Прицеп N', report.mainInfo.trailerNumber],
    ['Place of survey / Место инспекции', report.mainInfo.placeOfSurvey],
    ['Name of product / Наименование товара', report.mainInfo.productName],
    ['Package / Фасовка', report.mainInfo.packageName],
    ['PLU', report.mainInfo.plu],
    ['Date of opening / Дата открытия', formatDate(report.mainInfo.openingDate)],
    ['Date of survey / Дата инспекции', formatDate(report.mainInfo.surveyDate)],
    ['Kind of packing / Вид упаковки', report.mainInfo.packingKind],
    ['Marking of boxes / Маркировка на коробках', report.mainInfo.boxMarking],
  ]
})

const temperatureRows = computed(() => {
  const report = reportDraftStore.selectedReport

  if (!report) {
    return []
  }

  return [
    [
      'Storage temperature / Рекомендованная температура',
      report.temperatureInfo.storageTemperature,
    ],
    [
      'Of pulp at the time of opening / Пульпа при открытии',
      report.temperatureInfo.pulpTemperature,
    ],
    ['Temperature violation / Нарушение', report.temperatureInfo.temperatureViolation],
    ['Seal / Пломба', report.temperatureInfo.sealNumber],
    ['Thermographs presence / Наличие термографов', report.temperatureInfo.thermographPresence],
    ['Thermographs violation / Нарушение термографов', report.temperatureInfo.thermographViolation],
  ]
})

const resultRows = computed(() => {
  const report = reportDraftStore.selectedReport

  if (!report) {
    return []
  }

  return [
    [
      'Correspond to the 1st cat. / Соответствует 1 категории',
      report.inspectionResults.firstCategoryPercent,
    ],
    [
      'Not correspond to standard for 1st cat. / Нестандарт для 1 категории',
      report.inspectionResults.firstCategoryNonStandardPercent,
    ],
    [
      'Not correspond to standard for 2nd cat. / Нестандарт для 2 категории',
      report.inspectionResults.secondCategoryNonStandardPercent,
    ],
    ['Waste / Отход', report.inspectionResults.wastePercent],
    ['Density / Плотность', report.inspectionResults.density],
    ['Brix / Сахар', report.inspectionResults.brix],
    ['Caliber / Калибр', report.inspectionResults.caliber],
    [
      'Correspondence of caliber to passport / Соответствие калибра ПК',
      report.inspectionResults.caliberPassportMatch,
    ],
    [
      'Not correspond to caliber / Не соответствует калибру',
      report.inspectionResults.caliberMismatch,
    ],
    ['Variety / Сорт', report.inspectionResults.variety],
    [
      'Correspondence of variety to passport / Соответствие сорта ПК',
      report.inspectionResults.varietyPassportMatch,
    ],
  ]
})

watch(
  () => reportDraftStore.selectedPhotos,
  (photos, previousPhotos, onCleanup) => {
    const previews = photos.map((photo) => ({
      id: photo.id,
      url: URL.createObjectURL(photo.blob),
      fileName: photo.fileName,
      caption: photo.caption,
      templateFieldId: photo.templateFieldId,
      category: photo.category,
    }))

    photoPreviews.value = previews

    onCleanup(() => {
      previews.forEach((photo) => URL.revokeObjectURL(photo.url))
    })
  },
  { immediate: true },
)

onMounted(async () => {
  await reportDraftStore.loadReport(props.reportId)

  if (
    authStore.isWorker &&
    reportDraftStore.selectedReport?.workerAccountId &&
    reportDraftStore.selectedReport.workerAccountId !== authStore.currentAccount?.id
  ) {
    await router.replace({ name: 'new-report' })
  }
})

onUnmounted(() => {
  photoPreviews.value.forEach((photo) => URL.revokeObjectURL(photo.url))
})

function splitSamplePoints(
  points: ReportSamplePoint[],
): [ReportSamplePoint[], ReportSamplePoint[]] {
  const midpoint = Math.ceil(points.length / 2)

  return [points.slice(0, midpoint), points.slice(midpoint)]
}

function printReport(): void {
  window.print()
}

async function savePdfDocument(): Promise<void> {
  const report = reportDraftStore.selectedReport

  if (!report) {
    return
  }

  reportDraftStore.clearError()

  try {
    const pdfBlob = await generateQualityReportPdf(report, reportDraftStore.selectedPhotos)
    const fileName = `${report.mainInfo.orderNumber || report.id}.pdf`
    const document = await reportDraftStore.saveDocument(
      report.id,
      pdfBlob,
      fileName,
      'application/pdf',
    )

    if (document) {
      downloadBlob(document.blob, document.fileName)
    }
  } catch (error) {
    reportDraftStore.setError(error)
  }
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function formatDate(value: string): string {
  if (!value) {
    return '-'
  }

  return new Intl.DateTimeFormat('ru-RU').format(new Date(value))
}

function displayValue(value: string | number | undefined): string {
  if (value === undefined || value === '') {
    return '-'
  }

  return String(value)
}
</script>

<template>
  <main class="screen-page detail-page">
    <div class="non-printable detail-toolbar">
      <RouterLink class="back-link" :to="backRoute">
        {{ authStore.isAdmin ? 'Назад к отчетам' : 'Назад к истории' }}
      </RouterLink>
      <div class="detail-toolbar__actions">
        <RouterLink
          v-if="authStore.isWorker && reportDraftStore.selectedReport?.status === 'draft'"
          class="secondary-button"
          :to="{ name: 'edit-report', params: { reportId } }"
        >
          Редактировать
        </RouterLink>
        <button
          class="secondary-button"
          type="button"
          :disabled="reportDraftStore.isSaving || !reportDraftStore.selectedReport"
          @click="savePdfDocument"
        >
          {{ reportDraftStore.isSaving ? 'Сохраняем PDF...' : 'Скачать PDF' }}
        </button>
        <button class="primary-button" type="button" @click="printReport">Печать / PDF</button>
      </div>
    </div>

    <section v-if="reportDraftStore.selectedReport" class="non-printable screen-heading">
      <div>
        <p class="screen-kicker">Документ отчета</p>
        <h1 class="screen-title">{{ reportDraftStore.selectedReport.productName }}</h1>
        <p class="screen-subtitle">
          {{
            reportDraftStore.selectedReport.status === 'draft'
              ? 'Черновик сохранен'
              : 'Отправлен администратору'
          }}: {{ savedAtLabel }} · документов:
          {{ reportDraftStore.selectedDocuments.length }}
        </p>
      </div>
    </section>

    <p v-if="reportDraftStore.errorMessage" class="non-printable error-message">
      {{ reportDraftStore.errorMessage }}
    </p>

    <p
      v-else-if="!reportDraftStore.isLoading && !reportDraftStore.selectedReport"
      class="non-printable empty-state"
    >
      Отчет не найден или у вас нет доступа.
    </p>

    <section v-if="reportDraftStore.selectedReport" class="print-report">
      <article class="document-page">
        <section class="document-title">
          <h1>Quality inspection report</h1>
          <p>Отчет об осмотре груза на качество</p>
        </section>

        <table class="report-table">
          <tbody>
            <tr v-for="[label, value] in mainRows" :key="label">
              <th>{{ label }}</th>
              <td>{{ displayValue(value) }}</td>
            </tr>
          </tbody>
        </table>
      </article>

      <article class="document-page">
        <h2 class="section-title">
          Data on temperature and seals / Данные по температуре и пломбам
        </h2>
        <table class="report-table">
          <tbody>
            <tr v-for="[label, value] in temperatureRows" :key="label">
              <th>{{ label }}</th>
              <td>{{ displayValue(value) }}</td>
            </tr>
          </tbody>
        </table>

        <h2 class="section-title section-title--spaced">
          Results of inspection / Результаты инспекции
        </h2>
        <table class="report-table">
          <tbody>
            <tr v-for="[label, value] in resultRows" :key="label">
              <th>{{ label }}</th>
              <td>{{ displayValue(value) }}</td>
            </tr>
          </tbody>
        </table>
      </article>

      <article class="document-page">
        <h2 class="section-title">Description / Описание</h2>
        <div class="description-list">
          <p>
            <strong>Not correspond to requirements of standard for 2nd class</strong>
            {{ displayValue(reportDraftStore.selectedReport.descriptions.secondClassDefects) }}
          </p>
          <p>
            <strong>Waste / Отход</strong>
            {{ displayValue(reportDraftStore.selectedReport.descriptions.waste) }}
          </p>
          <p>
            <strong>Not correspond to the CALIBER / Не соответствует калибру</strong>
            {{ displayValue(reportDraftStore.selectedReport.descriptions.caliberMismatch) }}
          </p>
        </div>

        <h2 class="section-title section-title--spaced">
          Conclusion of Expert / Заключение эксперта
        </h2>
        <p class="conclusion">
          {{ displayValue(reportDraftStore.selectedReport.expertConclusion) }}
        </p>
      </article>

      <article class="document-page">
        <h2 class="section-title">Random value generator / Генератор случайных значений</h2>
        <div class="sample-grid">
          <table
            v-for="(sampleColumn, columnIndex) in splitSamplePoints(
              reportDraftStore.selectedReport.sampling.points,
            )"
            :key="columnIndex"
            class="report-table"
          >
            <thead>
              <tr>
                <th>Палета</th>
                <th>Место</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="point in sampleColumn" :key="point.id">
                <td>{{ point.pallet }}</td>
                <td>{{ point.place }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <article
        v-for="group in photoDisplayGroups"
        :key="group.id"
        class="document-page photo-page"
      >
        <h2 class="section-title">{{ group.title }}</h2>
        <p v-if="group.subtitle" class="section-subtitle">{{ group.subtitle }}</p>
        <figure v-for="photo in group.photos" :key="photo.id">
          <img :src="photo.url" :alt="photo.fileName" />
          <figcaption>{{ photo.caption || photo.fileName }}</figcaption>
        </figure>
        <p v-if="!group.photos.length" class="empty-document-block">
          Фото не добавлены.
        </p>
      </article>

      <article class="document-page">
        <p class="final-note">
          The photos attached show the amount of rotten and affected fruits as well as general cargo
          condition.
        </p>
        <p class="final-note">
          Прикрепленные фотографии показывают количество гнилых и пораженных плодов, а также общее
          состояние груза.
        </p>
        <p class="final-note">
          The report above reflects our findings at the time, date and place of inspection only and
          does not refer to any other matter.
        </p>
        <table class="report-table signature-table">
          <tbody>
            <tr>
              <th>Report issued / Отчет издан</th>
              <td>{{ formatDate(reportDraftStore.selectedReport.signatures.reportIssuedDate) }}</td>
            </tr>
            <tr>
              <th>Expert / Эксперт</th>
              <td>{{ displayValue(reportDraftStore.selectedReport.signatures.expertName) }}</td>
            </tr>
            <tr>
              <th>Retail's representative / Менеджер ОКК ТС</th>
              <td>
                {{
                  displayValue(reportDraftStore.selectedReport.signatures.retailRepresentativeName)
                }}
              </td>
            </tr>
          </tbody>
        </table>
      </article>
    </section>

    <p v-else class="empty-state">Отчет не найден или был удален.</p>
  </main>
</template>

<style scoped>
.detail-page {
  width: min(100%, 1180px);
  margin: 0 auto;
}

.detail-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 10px;
  background: var(--color-surface);
  box-shadow: 0 10px 24px var(--color-shadow);
}

.detail-toolbar__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.back-link {
  color: var(--color-primary);
  font-size: 0.9rem;
  font-weight: 850;
  text-decoration: none;
}

.secondary-button {
  display: inline-flex;
  min-height: 46px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  padding: 11px 14px;
  background: var(--color-surface);
  color: var(--color-primary);
  font-weight: 850;
}

.screen-heading {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 14px;
  background: var(--color-surface);
  box-shadow: 0 10px 24px var(--color-shadow);
}

.print-report {
  display: grid;
  gap: 18px;
}

.document-page {
  box-sizing: border-box;
  width: min(100%, 8.5in);
  min-height: 11in;
  margin: 0 auto;
  padding: 0.5in;
  background: #fff;
  color: #111827;
  font-family: Arial, sans-serif;
  box-shadow: 0 14px 34px rgba(34, 57, 43, 0.12);
  page-break-after: always;
}

.document-header {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
  font-size: 11px;
  line-height: 1.35;
}

.document-title {
  margin: 34px 0 24px;
  text-align: center;
}

.document-title h1 {
  margin: 0;
  font-size: 22px;
}

.document-title p {
  margin: 6px 0 0;
  font-size: 16px;
}

.report-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.report-table td,
.report-table th {
  border-bottom: 1px solid #d1d5db;
  padding: 9px 8px;
  vertical-align: top;
  font-size: 11px;
}

.report-table th {
  color: #4b5563;
  text-align: left;
  font-weight: 700;
}

.section-title {
  margin: 0 0 14px;
  font-size: 17px;
}

.section-title--spaced {
  margin-top: 28px;
}

.section-subtitle,
.empty-document-block {
  color: #4b5563;
  font-size: 12px;
}

.description-list {
  display: grid;
  gap: 12px;
  font-size: 12px;
}

.description-list strong {
  display: block;
  margin-bottom: 4px;
  color: #4b5563;
}

.conclusion {
  font-size: 13px;
  line-height: 1.45;
  white-space: pre-wrap;
}

.sample-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}

.photo-page {
  display: grid;
  align-content: start;
  gap: 14px;
}

.photo-page figure {
  margin: 0;
}

.photo-page img {
  width: 100%;
  max-height: 8.4in;
  border: 1px solid #d1d5db;
  object-fit: contain;
}

.photo-page figcaption {
  margin-top: 7px;
  color: #4b5563;
  font-size: 11px;
}

.final-note {
  margin-top: 22px;
  font-size: 13px;
  line-height: 1.5;
}

.signature-table {
  margin-top: 42px;
}

@media print {
  .non-printable {
    display: none !important;
  }

  .screen-page {
    min-height: 0;
    padding: 0;
  }

  .print-report {
    gap: 0;
  }

  .document-page {
    width: auto;
    min-height: 0;
    margin: 0;
    box-shadow: none;
  }
}

@media (max-width: 760px) {
  .detail-toolbar,
  .screen-heading,
  .document-header,
  .sample-grid {
    grid-template-columns: 1fr;
  }

  .detail-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .detail-toolbar__actions {
    display: grid;
  }

  .detail-toolbar__actions .primary-button,
  .detail-toolbar__actions .secondary-button {
    width: 100%;
  }
}
</style>
