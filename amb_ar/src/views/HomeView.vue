<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { generateQualityReportPdf } from '@/shared/documents/quality-report-pdf'
import {
  getReportDraftDetails,
  saveGeneratedDocument,
} from '@/shared/repositories/report-draft-repository'
import { useReportDraftStore } from '@/stores/report-draft.store'
import type { ReportDraft } from '@/types/report'

const reportDraftStore = useReportDraftStore()
const searchQuery = ref('')

const filteredReports = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()

  return reportDraftStore.reports.filter((report) => {
    const searchValue = [
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

onMounted(() => {
  void reportDraftStore.loadHome()
})

function formatReportTime(timestamp: number): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

function getReportPlace(report: ReportDraft): string {
  return report.mainInfo?.placeOfSurvey || 'Место не указано'
}

function getReportOrder(report: ReportDraft): string {
  return report.mainInfo?.orderNumber ? `Заказ ${report.mainInfo.orderNumber}` : 'Без номера'
}

function getReportPhotoCount(report: ReportDraft): number {
  return report.photoIds?.length ?? 0
}

function getReportPhotoPreviewIds(report: ReportDraft): string[] {
  return report.photoIds?.slice(0, 3) ?? []
}

async function downloadReportPdf(report: ReportDraft): Promise<void> {
  const details = await getReportDraftDetails(report.id)

  if (!details) {
    return
  }

  const pdfBlob = await generateQualityReportPdf(details.draft, details.photos)
  const fileName = `${details.draft.mainInfo.orderNumber || details.draft.id}.pdf`
  const document = await saveGeneratedDocument(details.draft.id, pdfBlob, fileName, 'application/pdf')

  downloadBlob(document.blob, document.fileName)
  await reportDraftStore.refreshReports()
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
      <div class="home-hero__topline">
        <p class="screen-kicker">АМБАР QC</p>
        <span class="home-hero__mode">
          Администратор
        </span>
      </div>

      <h1 class="home-hero__title">Отчеты работников</h1>
      <p class="home-hero__subtitle">
        Просматривайте готовые отчеты, автора, дату создания и товар. Документы хранятся локально.
      </p>
    </section>

    <section class="home-metrics" aria-label="Сводка отчетов">
      <article class="metric-card">
        <span class="metric-card__label">Всего</span>
        <strong>{{ reportDraftStore.reports.length }}</strong>
      </article>
      <article class="metric-card">
        <span class="metric-card__label">Готовы</span>
        <strong>{{ readyReportCount }}</strong>
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

    </section>

    <section class="reports-section">
      <div class="reports-section__header">
        <div>
          <p class="screen-kicker">Локальная база</p>
          <h2>Все отчеты</h2>
        </div>
        <span>{{ filteredReports.length }}</span>
      </div>

      <div v-if="filteredReports.length" class="report-list">
        <article
          v-for="report in filteredReports"
          :key="report.id"
          class="report-card"
        >
          <div class="report-card__body">
            <div class="report-card__title-row">
              <h3 class="report-card__title">
                {{ report.productName || 'Товар не выбран' }}
              </h3>
            </div>

            <p class="report-card__meta">
              {{ report.inspectorName || 'Работник не указан' }} ·
              {{ formatReportTime(report.createdAt) }}
            </p>

            <div class="report-card__chips">
              <span>{{ getReportOrder(report) }}</span>
              <span>{{ getReportPlace(report) }}</span>
              <span>{{ getReportPhotoCount(report) }} фото</span>
            </div>
          </div>

          <div class="report-card__photos" aria-hidden="true">
            <span
              v-for="photoId in getReportPhotoPreviewIds(report)"
              :key="photoId"
              class="report-card__photo"
            />
            <span v-if="!getReportPhotoCount(report)" class="report-card__photo report-card__photo--empty" />
          </div>

          <div class="report-card__actions">
            <RouterLink
              class="secondary-button"
              :to="{ name: 'report-details', params: { reportId: report.id } }"
            >
              Открыть
            </RouterLink>
            <button class="primary-button" type="button" @click="downloadReportPdf(report)">
              PDF
            </button>
          </div>
        </article>
      </div>

      <p v-else class="empty-state">
        Отчетов пока нет. Когда работники сохранят документы, они появятся здесь.
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

.home-hero .screen-kicker {
  margin: 0;
  color: rgba(255, 255, 255, 0.78);
}

.home-hero__topline,
.report-card__title-row,
.reports-section__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.home-hero__mode {
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  padding: 6px 9px;
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
  font-size: 0.78rem;
  font-weight: 850;
  text-decoration: none;
  white-space: nowrap;
}

.home-hero__title {
  max-width: 620px;
  font-size: 2rem;
  font-weight: 900;
  line-height: 1.05;
}

.home-hero__subtitle {
  max-width: 640px;
  color: rgba(255, 255, 255, 0.78);
  font-size: 0.98rem;
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
  grid-template-columns: minmax(0, 1fr) auto auto;
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
  min-width: 0;
}

.report-card__title-row {
  align-items: flex-start;
}

.report-card__title {
  min-width: 0;
  font-size: 1rem;
  font-weight: 900;
  line-height: 1.25;
}

.report-card__meta {
  margin-top: 4px;
  color: var(--color-text-muted);
  font-size: 0.86rem;
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
  align-items: center;
  align-self: stretch;
}

.report-card__actions {
  display: grid;
  min-width: 108px;
  gap: 8px;
}

.report-card__actions .primary-button,
.report-card__actions .secondary-button {
  min-height: 40px;
  padding: 9px 12px;
}

.report-card__photo {
  width: 36px;
  height: 50px;
  border: 2px solid var(--color-surface);
  border-radius: 8px;
  margin-left: -12px;
  background:
    linear-gradient(135deg, rgba(34, 57, 43, 0.18), rgba(184, 111, 28, 0.16)),
    var(--color-primary-soft);
  box-shadow: 0 8px 18px rgba(34, 57, 43, 0.12);
}

.report-card__photo:first-child {
  margin-left: 0;
}

.report-card__photo--empty {
  background:
    linear-gradient(180deg, transparent 42%, rgba(34, 57, 43, 0.08) 42% 58%, transparent 58%),
    var(--color-surface-muted);
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

@media (max-width: 620px) {
  .report-card {
    grid-template-columns: 1fr;
  }

  .report-card__photos {
    display: none;
  }

  .report-card__actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
