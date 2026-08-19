<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { getReportDraftDetails } from '@/shared/repositories/report-draft-repository'
import {
  getReportDisplayTitle,
  reportHasProductField,
} from '@/shared/reports/report-display'
import { useAuthStore } from '@/stores/auth.store'
import { useReportDraftStore } from '@/stores/report-draft.store'
import type { ReportDraft, ReportStatus } from '@/types/report'

const reportDraftStore = useReportDraftStore()
const authStore = useAuthStore()
const searchQuery = ref('')
const activeActionReportId = ref<string | null>(null)
const isInitialLoading = ref(true)

const filteredReports = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()

  return reportDraftStore.reports.filter((report) => {
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
  () => reportDraftStore.reports.filter((report) => report.status !== 'draft').length,
)

onMounted(async () => {
  await reportDraftStore.loadWorkerHistory()
  isInitialLoading.value = false
})

function formatReportTime(timestamp: number): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

function getReportOrder(report: ReportDraft): string {
  return report.mainInfo?.orderNumber || 'Не указан'
}

function getReportNumber(report: ReportDraft): string {
  return report.reportNumber?.startsWith('AMB-QC-')
    ? report.reportNumber
    : 'Ожидает синхронизации'
}

function getReportPhotoCount(report: ReportDraft): number {
  return report.photoIds?.length ?? 0
}

function getStatusLabel(report: ReportDraft): string {
  const labels: Record<ReportStatus, string> = {
    draft: 'Черновик',
    ready: report._syncStatus === 'pending' ? 'Ожидает отправки' : 'Отправлен',
    exported: 'Отправлен · PDF',
    archived: 'Удален',
  }

  return labels[report.status]
}

async function downloadReportPdf(report: ReportDraft): Promise<void> {
  activeActionReportId.value = report.id
  reportDraftStore.clearError()

  try {
    const accountId = authStore.currentAccount?.id

    if (!accountId) {
      return
    }

    const details = await getReportDraftDetails(report.id, accountId)

    if (!details) {
      throw new Error('Отчет не найден на сервере')
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

async function deleteReport(report: ReportDraft): Promise<void> {
  const shouldDelete = window.confirm(
    `Удалить отчет «${report.productName || 'Без названия'}» из истории?`,
  )

  if (!shouldDelete) {
    return
  }

  activeActionReportId.value = report.id

  try {
    await reportDraftStore.deleteReport(report.id)
  } finally {
    activeActionReportId.value = null
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
  <main class="screen-page worker-reports-page">
    <section class="worker-hero">
      <div class="worker-hero__content">
        <div>
          <h1>Контроль качества</h1>
        </div>

        <RouterLink class="primary-button worker-hero__create" :to="{ name: 'new-report' }">
          <span aria-hidden="true">+</span>
          Новый отчет
        </RouterLink>
      </div>
    </section>

    <section class="worker-metrics" aria-label="Сводка отчетов">
      <article class="metric-card">
        <span>Всего отчетов</span>
        <strong>{{ isInitialLoading ? '—' : reportDraftStore.reports.length }}</strong>
      </article>
      <article class="metric-card">
        <span>Готовы и PDF</span>
        <strong>{{ isInitialLoading ? '—' : readyReportCount }}</strong>
      </article>
      <article class="metric-card metric-card--mode">
        <span>Черновики</span>
        <strong>{{ isInitialLoading ? '—' : reportDraftStore.reports.length - readyReportCount }}</strong>
        <small>Изменения сохраняются автоматически</small>
      </article>
    </section>

    <section class="report-controls app-card">
      <label class="field-label" for="workerReportSearch">
        Поиск по истории
        <input
          id="workerReportSearch"
          v-model="searchQuery"
          class="field-control"
          type="search"
          placeholder="Товар, заказ, работник или место"
        />
      </label>
    </section>

    <section class="reports-section">
      <div class="reports-section__header">
        <div>
          <h2>Сохраненные отчеты</h2>
        </div>
        <span>{{ isInitialLoading ? '—' : filteredReports.length }}</span>
      </div>

      <div v-if="isInitialLoading" class="empty-state empty-state--action" aria-live="polite">
        <strong>Загружаем сохранённые отчёты…</strong>
      </div>

      <div v-else-if="filteredReports.length" class="report-list">
        <article v-for="report in filteredReports" :key="report.id" class="report-card">
          <div class="report-card__heading">
            <div>
              <p class="report-card__eyebrow">
                {{ reportHasProductField(report) && report.productId ? 'Товар' : 'Макет' }}
              </p>
              <h3>{{ getReportDisplayTitle(report) }}</h3>
            </div>
            <span class="report-status" :class="`report-status--${report.status}`">
              {{ getStatusLabel(report) }}
            </span>
          </div>

          <dl class="report-card__details">
            <div>
              <dt>Номер отчета</dt>
              <dd>{{ getReportNumber(report) }}</dd>
            </div>
            <div>
              <dt>Номер заказа</dt>
              <dd>{{ getReportOrder(report) }}</dd>
            </div>
            <div>
              <dt>Дата изменения</dt>
              <dd>{{ formatReportTime(report.updatedAt) }}</dd>
            </div>
            <div>
              <dt>Работник</dt>
              <dd>{{ report.inspectorName || 'Не указан' }}</dd>
            </div>
            <div>
              <dt>Фотографии</dt>
              <dd>{{ getReportPhotoCount(report) }} шт.</dd>
            </div>
          </dl>

          <div class="report-card__actions">
            <RouterLink
              class="secondary-button"
              :to="{ name: 'report-details', params: { reportId: report.id } }"
            >
              Открыть
            </RouterLink>
            <RouterLink
              v-if="report.status === 'draft'"
              class="secondary-button"
              :to="{ name: 'edit-report', params: { reportId: report.id } }"
            >
              Продолжить
            </RouterLink>
            <button
              class="secondary-button"
              type="button"
              :disabled="activeActionReportId === report.id"
              @click="downloadReportPdf(report)"
            >
              {{ activeActionReportId === report.id ? 'Создаем...' : 'PDF' }}
            </button>
            <button
              v-if="report.status === 'draft'"
              class="delete-button"
              type="button"
              :disabled="activeActionReportId === report.id"
              @click="deleteReport(report)"
            >
              Удалить
            </button>
          </div>
        </article>
      </div>

      <div v-else class="empty-state empty-state--action">
        <strong>Отчетов пока нет</strong>
        <span>Выберите макет — после этого здесь появится черновик отчета.</span>
        <RouterLink class="primary-button" :to="{ name: 'new-report' }"> Новый отчет </RouterLink>
      </div>
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
  gap: 18px;
  border-radius: 0 0 8px 8px;
  margin: -18px -14px 0;
  padding: 24px 16px 20px;
  background: var(--color-primary);
  color: #ffffff;
}

.worker-hero__content,
.reports-section__header,
.report-card__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.worker-hero__content {
  align-items: end;
}

.worker-hero h1 {
  max-width: 620px;
  font-size: clamp(1.8rem, 6vw, 2.5rem);
  font-weight: 900;
  line-height: 1.05;
}

.worker-hero__create {
  flex: 0 0 auto;
  background: #ffffff;
  color: var(--color-primary);
}

.worker-hero__create span {
  margin-right: 8px;
  font-size: 1.35rem;
  line-height: 1;
}

.worker-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr)) minmax(210px, 1.5fr);
  gap: 8px;
}

.metric-card {
  display: grid;
  align-content: start;
  gap: 3px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 14px;
  background: var(--color-surface);
}

.metric-card span {
  color: var(--color-text-muted);
  font-size: 0.7rem;
  font-weight: 850;
  text-transform: uppercase;
}

.metric-card strong {
  color: var(--color-text);
  font-size: 1.5rem;
  font-weight: 900;
  line-height: 1.1;
}

.metric-card small {
  margin-top: 3px;
  color: var(--color-text-muted);
  font-size: 0.72rem;
}

.metric-card--mode {
  border-color: #bfd2c6;
  background: var(--color-primary-soft);
}

.metric-card--mode strong {
  color: var(--color-primary);
  font-size: 1rem;
}

.report-controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: end;
  gap: 12px;
  padding: 12px;
}

.delete-button {
  min-height: 46px;
  border: 1px solid #efb7b1;
  border-radius: 8px;
  padding: 10px 13px;
  background: var(--color-danger-soft);
  color: var(--color-danger);
  font-size: 0.82rem;
  font-weight: 850;
}

.delete-button:disabled {
  opacity: 0.45;
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
  display: grid;
  gap: 14px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 16px;
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: 0 10px 24px var(--color-shadow);
}

.report-card__eyebrow {
  color: var(--color-text-muted);
  font-size: 0.68rem;
  font-weight: 850;
  text-transform: uppercase;
}

.report-card h3 {
  margin-top: 2px;
  font-size: 1.05rem;
  font-weight: 900;
  line-height: 1.25;
}

.report-status {
  flex: 0 0 auto;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 6px 9px;
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
  font-size: 0.74rem;
  font-weight: 900;
  white-space: nowrap;
}

.report-status--ready {
  border-color: #b7dcc4;
  background: var(--color-success-soft);
  color: var(--color-success);
}

.report-status--exported {
  border-color: #b8c9f3;
  background: var(--color-info-soft);
  color: var(--color-info);
}

.report-card__details {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.report-card__details div {
  min-width: 0;
}

.report-card__details dt {
  color: var(--color-text-muted);
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
}

.report-card__details dd {
  overflow: hidden;
  margin-top: 3px;
  font-size: 0.86rem;
  font-weight: 800;
  text-overflow: ellipsis;
}

.report-card__actions {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 140px));
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
}

.report-card__actions .secondary-button,
.report-card__actions .delete-button {
  min-height: 40px;
  padding: 8px 11px;
}

.empty-state--action {
  display: grid;
  justify-items: center;
  gap: 8px;
}

.empty-state--action strong {
  color: var(--color-text);
  font-weight: 900;
}

.empty-state--action .primary-button {
  min-height: 42px;
  margin-top: 4px;
}

@media (min-width: 700px) {
  .worker-hero {
    margin: -26px -24px 0;
    padding: 34px 24px 26px;
  }
}

@media (max-width: 760px) {
  .worker-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .metric-card--mode {
    grid-column: 1 / -1;
  }

  .report-card__details {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .worker-hero__content,
  .report-controls {
    display: grid;
    grid-template-columns: 1fr;
  }

  .worker-hero__create,
  .report-card__actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .delete-button {
    grid-column: 1 / -1;
  }
}
</style>
