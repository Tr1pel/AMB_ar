<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import { localeTag } from '@/shared/i18n'
import {
  getReportDraftDetails,
  listReportPhotoPreviews,
} from '@/shared/repositories/report-draft-repository'
import { getReportDisplayTitle } from '@/shared/reports/report-display'
import { requestConfirmation } from '@/shared/ui/confirmation-dialog'
import { useAuthStore } from '@/stores/auth.store'
import { useReportDraftStore } from '@/stores/report-draft.store'
import type { ReportDraft, ReportStatus } from '@/types/report'

const props = withDefaults(
  defineProps<{
    archiveMode?: boolean
  }>(),
  {
    archiveMode: false,
  },
)

const reportDraftStore = useReportDraftStore()
const authStore = useAuthStore()
const searchQuery = ref('')
const activeActionReportId = ref<string | null>(null)
const activeArchiveReportId = ref<string | null>(null)
const activePermanentDeleteReportId = ref<string | null>(null)
const activeRestoreReportId = ref<string | null>(null)
const nowTimestamp = ref(Date.now())
const reportPhotoPreviewUrls = ref<Record<string, string[]>>({})
const isInitialLoading = ref(true)
const photoPreviewSignatures = new Map<string, string>()
let refreshTimer: ReturnType<typeof setInterval> | null = null
let photoPreviewGeneration = 0

const displayedReports = computed(() =>
  props.archiveMode ? reportDraftStore.archivedReports : reportDraftStore.reports,
)
const filteredReports = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()

  return displayedReports.value.filter((report) => {
    const searchValue = [
      report.reportNumber,
      report.productName,
      report.inspectorName,
      report.mainInfo?.orderNumber,
      report.mainInfo?.placeOfSurvey,
    ]
      .join(' ')
      .toLowerCase()

    return !query || searchValue.includes(query)
  })
})

const readyReportCount = computed(
  () => reportDraftStore.reports.filter((report) => report.status === 'ready').length,
)

onMounted(async () => {
  await refreshAdminReports()
  isInitialLoading.value = false
  refreshTimer = setInterval(() => void refreshAdminReports(), 20_000)
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

watch(
  () => props.archiveMode,
  async () => {
    isInitialLoading.value = true
    await refreshAdminReports()
    isInitialLoading.value = false
  },
)

onUnmounted(() => {
  photoPreviewGeneration += 1

  if (refreshTimer) {
    clearInterval(refreshTimer)
  }

  Object.values(reportPhotoPreviewUrls.value).flat().forEach(URL.revokeObjectURL)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

async function refreshAdminReports(): Promise<void> {
  nowTimestamp.value = Date.now()

  if (!reportDraftStore.isLoading) {
    await (props.archiveMode ? reportDraftStore.loadArchive() : reportDraftStore.loadHome())
    await refreshReportPhotoPreviews(displayedReports.value)
  }
}

async function refreshReportPhotoPreviews(reports: ReportDraft[]): Promise<void> {
  const accountId = authStore.currentAccount?.id

  if (!accountId) {
    return
  }

  const generation = ++photoPreviewGeneration
  const visibleReportIds = new Set(reports.map((report) => report.id))

  for (const reportId of Object.keys(reportPhotoPreviewUrls.value)) {
    if (!visibleReportIds.has(reportId)) {
      replaceReportPhotoPreviewUrls(reportId, [])
      photoPreviewSignatures.delete(reportId)
    }
  }

  const results = await Promise.allSettled(
    reports.map(async (report) => {
      const signature = (report.photoIds ?? []).slice(0, 3).join('|')

      if (photoPreviewSignatures.get(report.id) === signature) {
        return
      }

      if (!signature) {
        replaceReportPhotoPreviewUrls(report.id, [])
        photoPreviewSignatures.set(report.id, signature)
        return
      }

      const photos = await listReportPhotoPreviews(report.id, accountId)
      const urls = photos.map((photo) => URL.createObjectURL(photo.blob))

      if (generation !== photoPreviewGeneration) {
        urls.forEach(URL.revokeObjectURL)
        return
      }

      replaceReportPhotoPreviewUrls(report.id, urls)
      photoPreviewSignatures.set(report.id, signature)
    }),
  )
  const failedResult = results.find((result) => result.status === 'rejected')

  if (failedResult?.status === 'rejected' && generation === photoPreviewGeneration) {
    reportDraftStore.setError(failedResult.reason)
  }
}

function replaceReportPhotoPreviewUrls(reportId: string, urls: string[]): void {
  reportPhotoPreviewUrls.value[reportId]?.forEach(URL.revokeObjectURL)
  const nextPreviewUrls = { ...reportPhotoPreviewUrls.value }

  if (urls.length) {
    nextPreviewUrls[reportId] = urls
  } else {
    delete nextPreviewUrls[reportId]
  }

  reportPhotoPreviewUrls.value = nextPreviewUrls
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'visible') {
    void refreshAdminReports()
  }
}

function formatReportTime(timestamp: number): string {
  return new Intl.DateTimeFormat(localeTag.value, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

function formatArchiveDate(timestamp: number): string {
  return new Intl.DateTimeFormat(localeTag.value, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(timestamp)
}

function getArchivedAt(report: ReportDraft): number {
  return report._deletedAt ?? report.updatedAt
}

function getPermanentDeletionAt(report: ReportDraft): number {
  return addCalendarMonth(getArchivedAt(report))
}

function addCalendarMonth(timestamp: number): number {
  const date = new Date(timestamp)
  const originalDay = date.getUTCDate()

  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + 1)
  const lastDayOfTargetMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate()
  date.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth))

  return date.getTime()
}

function formatDeletionCountdown(report: ReportDraft): string {
  const remainingMs = Math.max(0, getPermanentDeletionAt(report) - nowTimestamp.value)

  if (remainingMs === 0) {
    return 'удалится при ближайшей очистке'
  }

  const remainingDays = remainingMs / (24 * 60 * 60 * 1000)

  if (remainingDays >= 1) {
    const days = Math.ceil(remainingDays)
    return `удалится через ${days} ${pluralize(days, 'день', 'дня', 'дней')}`
  }

  const remainingHours = remainingMs / (60 * 60 * 1000)

  if (remainingHours >= 1) {
    const hours = Math.ceil(remainingHours)
    return `удалится через ${hours} ${pluralize(hours, 'час', 'часа', 'часов')}`
  }

  const minutes = Math.max(1, Math.ceil(remainingMs / (60 * 1000)))
  return `удалится через ${minutes} ${pluralize(minutes, 'минуту', 'минуты', 'минут')}`
}

function pluralize(value: number, one: string, few: string, many: string): string {
  const lastTwoDigits = value % 100
  const lastDigit = value % 10

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return many
  if (lastDigit === 1) return one
  if (lastDigit >= 2 && lastDigit <= 4) return few
  return many
}

function getReportPlace(report: ReportDraft): string {
  return report.mainInfo?.placeOfSurvey || 'Место не указано'
}

function getReportOrder(report: ReportDraft): string {
  return report.mainInfo?.orderNumber ? `Заказ ${report.mainInfo.orderNumber}` : 'Без номера'
}

function getReportNumber(report: ReportDraft): string {
  return report.reportNumber?.startsWith('AMB-QC-')
    ? report.reportNumber
    : 'Ожидает синхронизации'
}

function getReportPhotoCount(report: ReportDraft): number {
  return report.photoIds?.length ?? 0
}

function getStatusLabel(status: ReportStatus): string {
  const labels: Record<ReportStatus, string> = {
    draft: 'Черновик',
    ready: 'Отправлен',
    exported: 'Отправлен · PDF',
    archived: 'В архиве',
  }

  return labels[status]
}

async function downloadReportPdf(report: ReportDraft): Promise<void> {
  activeActionReportId.value = report.id
  reportDraftStore.clearError()

  try {
    const accountId = authStore.currentAccount?.id

    if (!accountId) {
      throw new Error('Нужно войти под администратором')
    }

    const details = await getReportDraftDetails(report.id, accountId)

    if (!details) {
      throw new Error('Отчет не найден на сервере')
    }

    if (report.status === 'archived') {
      const latestDocument = details.documents.at(-1)

      if (latestDocument) {
        downloadBlob(latestDocument.blob, latestDocument.fileName)
        return
      }

      throw new Error('Для архивного отчёта PDF не найден')
    }

    const document = await reportDraftStore.generateDocument(details.draft.id)

    if (document) {
      downloadBlob(document.blob, document.fileName)
    }
  } catch (error) {
    reportDraftStore.setError(error)
  } finally {
    activeActionReportId.value = null
  }
}

async function archiveReport(report: ReportDraft): Promise<void> {
  const shouldArchive = await requestConfirmation({
    title: 'Переместить в архив?',
    message: `Отчет «${report.mainInfo.orderNumber || report.productName}» исчезнет из рабочего журнала и будет безвозвратно удален через месяц вместе с фотографиями и PDF. До этого срока он останется доступен в архиве.`,
    confirmLabel: 'Переместить',
    destructive: true,
  })

  if (!shouldArchive) {
    return
  }

  activeArchiveReportId.value = report.id
  await reportDraftStore.deleteReport(report.id)
  activeArchiveReportId.value = null
}

async function permanentlyDeleteReport(report: ReportDraft): Promise<void> {
  const shouldDelete = await requestConfirmation({
    title: 'Удалить навсегда?',
    message: `Выбранный отчет «${report.mainInfo.orderNumber || report.productName}», все его фотографии и PDF будут удалены немедленно без возможности восстановления. Остальные отчеты в архиве не изменятся.`,
    confirmLabel: 'Удалить',
    destructive: true,
  })

  if (!shouldDelete) {
    return
  }

  activePermanentDeleteReportId.value = report.id

  try {
    await reportDraftStore.deleteArchivedReport(report.id)
  } finally {
    activePermanentDeleteReportId.value = null
  }
}

async function restoreReport(report: ReportDraft): Promise<void> {
  const shouldRestore = await requestConfirmation({
    title: 'Вернуть отчёт?',
    message: `Вернуть отчет «${report.mainInfo.orderNumber || report.productName}» из архива?`,
    confirmLabel: 'Вернуть',
  })

  if (!shouldRestore) {
    return
  }

  activeRestoreReportId.value = report.id

  try {
    await reportDraftStore.restoreReport(report.id)
  } finally {
    activeRestoreReportId.value = null
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
</script>

<template>
  <main class="screen-page home-page">
    <section class="home-hero">
      <h1 class="home-hero__title">
        {{ props.archiveMode ? 'Архив отчетов' : 'Отчеты работников' }}
      </h1>
    </section>

    <section
      class="home-metrics"
      :class="{ 'home-metrics--single': props.archiveMode }"
      aria-label="Сводка отчетов"
    >
      <article class="metric-card">
        <span class="metric-card__label">{{ props.archiveMode ? 'В архиве' : 'Всего' }}</span>
        <strong>{{ isInitialLoading ? '—' : displayedReports.length }}</strong>
      </article>
      <article v-if="!props.archiveMode" class="metric-card">
        <span class="metric-card__label">Готовы</span>
        <strong>{{ isInitialLoading ? '—' : readyReportCount }}</strong>
      </article>
    </section>

    <section class="report-controls app-card">
      <label class="search-field" for="reportSearch">
        <span>Поиск</span>
        <input
          id="reportSearch"
          v-model="searchQuery"
          class="field-control"
          type="search"
          placeholder="Товар, заказ, инспектор"
        />
      </label>

      <button
        class="secondary-button"
        type="button"
        :disabled="reportDraftStore.isLoading"
        @click="refreshAdminReports"
      >
        {{ reportDraftStore.isLoading ? 'Обновляем...' : 'Обновить с сервера' }}
      </button>
    </section>

    <section class="reports-section">
      <div class="reports-section__header">
        <div>
          <h2>{{ props.archiveMode ? 'Архивные отчеты' : 'Все отчеты' }}</h2>
        </div>
        <span>{{ isInitialLoading ? '—' : filteredReports.length }}</span>
      </div>

      <p v-if="isInitialLoading" class="empty-state" aria-live="polite">
        Загружаем отчёты…
      </p>

      <div v-else-if="filteredReports.length" class="report-list">
        <article v-for="report in filteredReports" :key="report.id" class="report-card">
          <div class="report-card__body">
            <div class="report-card__title-row">
              <h3 class="report-card__title" data-i18n-ignore>
                {{ getReportDisplayTitle(report) }}
              </h3>
              <span class="report-status" :class="`report-status--${report.status}`">
                {{ getStatusLabel(report.status) }}
              </span>
            </div>

            <p class="report-card__meta">
              {{ report.inspectorName || 'Работник не указан' }} ·
              {{ formatReportTime(report.createdAt) }}
            </p>

            <p v-if="props.archiveMode" class="report-card__archive-meta">
              В архиве с {{ formatArchiveDate(getArchivedAt(report)) }} ·
              <strong>{{ formatDeletionCountdown(report) }}</strong>
              ({{ formatArchiveDate(getPermanentDeletionAt(report)) }})
            </p>

            <div class="report-card__chips">
              <span>{{ getReportNumber(report) }}</span>
              <span>{{ getReportOrder(report) }}</span>
              <span>{{ getReportPlace(report) }}</span>
              <span>{{ getReportPhotoCount(report) }} фото</span>
            </div>
          </div>

          <div class="report-card__photos" aria-hidden="true">
            <img
              v-for="(photoUrl, photoIndex) in reportPhotoPreviewUrls[report.id] ?? []"
              :key="`${report.id}-${photoIndex}`"
              class="report-card__photo"
              :src="photoUrl"
              alt=""
            />
          </div>

          <div class="report-card__actions">
            <RouterLink
              class="secondary-button"
              :to="{
                name: 'report-details',
                params: { reportId: report.id },
                query: props.archiveMode ? { from: 'archive' } : {},
              }"
            >
              Открыть
            </RouterLink>
            <button
              class="primary-button"
              type="button"
              :disabled="
                activeActionReportId === report.id ||
                activeArchiveReportId === report.id ||
                activeRestoreReportId === report.id ||
                activePermanentDeleteReportId === report.id
              "
              @click="downloadReportPdf(report)"
            >
              {{ activeActionReportId === report.id ? 'Создаем...' : 'PDF' }}
            </button>
            <button
              v-if="props.archiveMode"
              class="secondary-button"
              type="button"
              :disabled="activeRestoreReportId === report.id || reportDraftStore.isSaving"
              @click="restoreReport(report)"
            >
              {{ activeRestoreReportId === report.id ? 'Возвращаем...' : 'Вернуть из архива' }}
            </button>
            <button
              v-if="!props.archiveMode"
              class="danger-button"
              type="button"
              :disabled="activeArchiveReportId === report.id || reportDraftStore.isSaving"
              @click="archiveReport(report)"
            >
              {{ activeArchiveReportId === report.id ? 'Переносим...' : 'Удалить' }}
            </button>
            <button
              v-else
              class="danger-button"
              type="button"
              :disabled="activePermanentDeleteReportId === report.id || reportDraftStore.isSaving"
              @click="permanentlyDeleteReport(report)"
            >
              {{ activePermanentDeleteReportId === report.id ? 'Удаляем...' : 'Удалить навсегда' }}
            </button>
          </div>
        </article>
      </div>

      <p v-else class="empty-state">
        {{
          props.archiveMode
            ? 'В архиве пока нет отчетов.'
            : 'Отчетов пока нет. Когда работники сохранят документы, они появятся здесь.'
        }}
      </p>
    </section>

    <p v-if="reportDraftStore.errorMessage" class="error-message">
      {{ reportDraftStore.errorMessage }}
    </p>
  </main>
</template>

<style scoped>
.home-page {
  gap: 16px;
}

.home-hero {
  display: grid;
  gap: 14px;
  border-radius: 0 0 8px 8px;
  margin: -18px -14px 0;
  padding: 24px 16px 18px;
  background: var(--color-primary);
  color: #ffffff;
}

.report-card__title-row,
.reports-section__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.home-hero__title {
  max-width: 620px;
  font-size: 2rem;
  font-weight: 900;
  line-height: 1.05;
}

.home-hero__actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.home-hero .primary-button {
  background: #ffffff;
  color: var(--color-primary);
}

.home-hero .primary-button:hover {
  background: #f7faf8;
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.18);
}

.home-hero .secondary-button {
  border-color: rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.home-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.home-metrics--single {
  grid-template-columns: 1fr;
}

.metric-card {
  display: grid;
  gap: 2px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px;
  background: var(--color-surface);
}

.metric-card--accent {
  border-color: #f2c38b;
  background: var(--color-accent-soft);
}

.metric-card__label {
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 850;
  text-transform: uppercase;
}

.metric-card strong {
  color: var(--color-text);
  font-size: 1.42rem;
  font-weight: 900;
  line-height: 1.1;
}

.report-controls {
  display: grid;
  gap: 12px;
  padding: 12px;
}

.search-field {
  display: grid;
  gap: 8px;
  color: var(--color-text);
  font-size: 0.86rem;
  font-weight: 850;
}

.status-filter {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.status-filter__button {
  min-height: 40px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 8px;
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
  font-size: 0.78rem;
  font-weight: 850;
}

.status-filter__button--active {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #ffffff;
}

.reports-section {
  display: grid;
  gap: 12px;
}

.reports-section__header {
  color: var(--color-text);
}

.reports-section__header h2,
.reports-section__header > span {
  font-size: 1.05rem;
  font-weight: 900;
}

.report-list {
  display: grid;
  gap: 10px;
}

.report-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 14px;
  background: var(--color-surface);
  color: var(--color-text);
  text-decoration: none;
  box-shadow: 0 10px 24px var(--color-shadow);
}

.report-card__body {
  grid-column: 1;
  grid-row: 1;
  min-width: 0;
}

.report-card__title-row {
  align-items: flex-start;
  flex-wrap: nowrap;
}

.report-card__title {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 1rem;
  font-weight: 900;
  line-height: 1.25;
}

.report-status {
  flex: 0 0 auto;
  border: 1px solid #b7dcc4;
  border-radius: 8px;
  padding: 6px 9px;
  background: var(--color-success-soft);
  color: var(--color-success);
  font-size: 0.74rem;
  font-weight: 900;
  white-space: nowrap;
}

.report-status--exported {
  border-color: #b8c9f3;
  background: var(--color-info-soft);
  color: var(--color-info);
}

.report-status--archived {
  border-color: #e5bf7d;
  background: #fff8e8;
  color: #8a5a00;
}

.report-card__meta {
  margin-top: 4px;
  color: var(--color-text-muted);
  font-size: 0.86rem;
}

.report-card__archive-meta {
  margin-top: 5px;
  color: #8a5a00;
  font-size: 0.78rem;
  font-weight: 750;
}

.report-card__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.report-card__chips span {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 5px 8px;
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
  font-size: 0.74rem;
  font-weight: 800;
}

.report-card__photos {
  display: flex;
  grid-column: 1;
  grid-row: 1;
  align-items: center;
  align-self: end;
  justify-self: end;
}

.report-card__actions {
  display: grid;
  grid-column: 2;
  grid-row: 1;
  align-self: center;
  min-width: 108px;
  gap: 8px;
}

.report-card__actions .primary-button,
.report-card__actions .secondary-button,
.report-card__actions .danger-button {
  min-height: 40px;
  padding: 9px 12px;
}

.danger-button {
  border: 1px solid #e3b5b5;
  border-radius: 8px;
  background: var(--color-danger-soft);
  color: var(--color-danger);
  font-weight: 850;
}

.danger-button:disabled {
  cursor: default;
  opacity: 0.5;
}

.report-card__photo {
  width: 36px;
  height: 50px;
  border: 2px solid var(--color-surface);
  border-radius: 8px;
  margin-left: -12px;
  background: var(--color-surface-muted);
  box-shadow: 0 8px 18px rgba(34, 57, 43, 0.12);
  object-fit: cover;
}

.report-card__photo:first-child {
  margin-left: 0;
}

@media (min-width: 700px) {
  .home-hero {
    margin: -26px -24px 0;
    padding: 34px 24px 24px;
  }

  .home-hero__actions {
    grid-template-columns: max-content max-content;
  }
}

@media (min-width: 961px) {
  .home-hero {
    display: none;
  }
}

@media (max-width: 620px) {
  .report-card {
    grid-template-columns: 1fr;
  }

  .report-card__photos {
    display: none;
  }

  .report-card__actions {
    grid-column: 1;
    grid-row: auto;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
