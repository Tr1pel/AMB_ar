<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { generateQualityReportPdf } from '@/shared/documents/quality-report-pdf'
import {
  getReportDraftDetails,
  saveGeneratedDocument,
} from '@/shared/repositories/report-draft-repository'
import { useAuthStore } from '@/stores/auth.store'
import { useReportDraftStore } from '@/stores/report-draft.store'
import type { ReportDraft } from '@/types/report'

const authStore = useAuthStore()
const reportDraftStore = useReportDraftStore()
const searchQuery = ref('')

const filteredReports = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()

  return reportDraftStore.reports.filter((report) => {
    const searchValue = [
      report.productName,
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
  void reportDraftStore.loadWorkerHistory()
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

async function downloadReportPdf(report: ReportDraft): Promise<void> {
  const details = await getReportDraftDetails(report.id)

  if (!details) {
    return
  }

  const pdfBlob = await generateQualityReportPdf(details.draft, details.photos)
  const fileName = `${details.draft.mainInfo.orderNumber || details.draft.id}.pdf`
  const document = await saveGeneratedDocument(details.draft.id, pdfBlob, fileName, 'application/pdf')

  downloadBlob(document.blob, document.fileName)
  await reportDraftStore.refreshWorkerReports()
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
  <main class="screen-page worker-reports-page">
    <section class="worker-hero">
      <div class="worker-hero__topline">
        <p class="screen-kicker">Мои отчеты</p>
        <span>{{ authStore.currentAccount?.fullName }}</span>
      </div>

      <h1>История отчетов</h1>
      <p>Все отчеты, созданные под вашим аккаунтом.</p>
    </section>

    <section class="worker-metrics" aria-label="Сводка отчетов">
      <article class="metric-card">
        <span>Всего</span>
        <strong>{{ reportDraftStore.reports.length }}</strong>
      </article>
      <article class="metric-card">
        <span>Готовы</span>
        <strong>{{ readyReportCount }}</strong>
      </article>
    </section>

    <section class="report-controls app-card">
      <label class="field-label" for="workerReportSearch">
        Поиск
        <input
          id="workerReportSearch"
          v-model="searchQuery"
          class="field-control"
          type="search"
          placeholder="Товар, заказ, место"
        />
      </label>
    </section>

    <section class="reports-section">
      <div class="reports-section__header">
        <div>
          <p class="screen-kicker">Личная история</p>
          <h2>Сохраненные отчеты</h2>
        </div>
        <span>{{ filteredReports.length }}</span>
      </div>

      <div v-if="filteredReports.length" class="report-list">
        <article v-for="report in filteredReports" :key="report.id" class="report-card">
          <div>
            <h3>{{ report.productName || 'Товар не выбран' }}</h3>
            <p>{{ formatReportTime(report.createdAt) }}</p>

            <div class="report-card__chips">
              <span>{{ getReportOrder(report) }}</span>
              <span>{{ getReportPlace(report) }}</span>
              <span>{{ getReportPhotoCount(report) }} фото</span>
            </div>
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
        У вас пока нет сохраненных отчетов.
      </p>
    </section>

    <p v-if="reportDraftStore.errorMessage" class="error-message">
      {{ reportDraftStore.errorMessage }}
    </p>
  </main>
</template>

<style scoped>
.worker-reports-page {
  gap: 16px;
}

.worker-hero {
  display: grid;
  gap: 12px;
  border-radius: 0 0 8px 8px;
  margin: -18px -14px 0;
  padding: 24px 16px 18px;
  background: var(--color-primary);
  color: #ffffff;
}

.worker-hero .screen-kicker {
  margin: 0;
  color: rgba(255, 255, 255, 0.78);
}

.worker-hero__topline,
.reports-section__header,
.report-card,
.report-card__actions {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.worker-hero__topline span {
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  padding: 6px 9px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 0.78rem;
  font-weight: 850;
}

.worker-hero h1 {
  max-width: 620px;
  font-size: 2rem;
  font-weight: 900;
  line-height: 1.05;
}

.worker-hero p {
  max-width: 640px;
  color: rgba(255, 255, 255, 0.78);
  font-size: 0.98rem;
}

.worker-metrics {
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

.metric-card span {
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
  padding: 12px;
}

.reports-section,
.report-list {
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

.report-card {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 14px;
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: 0 10px 24px var(--color-shadow);
}

.report-card h3 {
  font-size: 1rem;
  font-weight: 900;
  line-height: 1.25;
}

.report-card p {
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

.report-card__actions {
  min-width: 108px;
}

.report-card__actions .primary-button,
.report-card__actions .secondary-button {
  min-height: 40px;
  padding: 9px 12px;
}

@media (min-width: 700px) {
  .worker-hero {
    margin: -26px -24px 0;
    padding: 34px 24px 24px;
  }
}

@media (max-width: 620px) {
  .report-card,
  .report-card__actions {
    display: grid;
  }

  .report-card__actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
