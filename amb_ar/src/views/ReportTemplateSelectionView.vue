<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { localeTag } from '@/shared/i18n'
import { useDocumentTemplateStore } from '@/stores/document-template.store'
import { useReportDraftStore } from '@/stores/report-draft.store'

const router = useRouter()
const documentTemplateStore = useDocumentTemplateStore()
const reportDraftStore = useReportDraftStore()
const selectedTemplateId = ref<string | null>(null)
const viewStep = ref<'loading' | 'decision' | 'template'>('loading')

const selectedTemplate = computed(() =>
  documentTemplateStore.activeTemplates.find(
    (template) => template.id === selectedTemplateId.value,
  ),
)

onMounted(async () => {
  await Promise.all([
    documentTemplateStore.loadTemplates(),
    reportDraftStore.loadWorkerHistory(),
  ])

  viewStep.value = reportDraftStore.latestWorkerDraft ? 'decision' : 'template'
})

function continueLatestReport(): void {
  const report = reportDraftStore.latestWorkerDraft

  if (report) {
    void router.push({ name: 'edit-report', params: { reportId: report.id } })
  }
}

function chooseNewReport(): void {
  selectedTemplateId.value = null
  viewStep.value = 'template'
}

function goBack(): void {
  if (reportDraftStore.latestWorkerDraft && viewStep.value === 'template') {
    viewStep.value = 'decision'
    return
  }

  void router.push({ name: 'worker-reports' })
}

function getFieldCount(templateId: string): number {
  const template = documentTemplateStore.activeTemplates.find((item) => item.id === templateId)

  return (
    template?.sections.reduce((total, section) => total + section.fields.length, 0) ?? 0
  )
}

async function startReport(): Promise<void> {
  if (!selectedTemplate.value || reportDraftStore.isSaving) {
    return
  }

  const report = await reportDraftStore.startReportFromTemplate(selectedTemplate.value.id)

  if (report) {
    await router.push({ name: 'edit-report', params: { reportId: report.id } })
  }
}
</script>

<template>
  <main class="screen-page template-choice-page">
    <section v-if="viewStep === 'template'" class="choice-heading">
      <div>
        <h1>Выберите макет</h1>
        <p>Черновик создастся после подтверждения.</p>
      </div>
      <button class="secondary-button" type="button" @click="goBack">
        Назад
      </button>
    </section>

    <section v-else-if="viewStep === 'decision'" class="choice-heading choice-heading--compact">
      <button class="secondary-button" type="button" @click="goBack">Назад</button>
    </section>

    <p v-if="viewStep === 'loading'" class="choice-state">Загружаем…</p>

    <section v-else-if="viewStep === 'decision'" class="report-action-grid">
      <button class="report-action report-action--primary" type="button" @click="continueLatestReport">
        <span class="report-action__icon" aria-hidden="true">→</span>
        <span>
          <strong>Продолжить отчет</strong>
          <small v-if="reportDraftStore.latestWorkerDraft">
            Изменен
            {{ new Date(reportDraftStore.latestWorkerDraft.updatedAt).toLocaleString(localeTag) }}
          </small>
        </span>
      </button>

      <button class="report-action" type="button" @click="chooseNewReport">
        <span class="report-action__icon" aria-hidden="true">+</span>
        <span>
          <strong>Создать новый</strong>
          <small>Выбрать макет отчета</small>
        </span>
      </button>
    </section>

    <section
      v-else-if="documentTemplateStore.activeTemplates.length"
      class="template-grid"
    >
      <button
        v-for="template in documentTemplateStore.activeTemplates"
        :key="template.id"
        class="template-option app-card"
        :class="{ 'template-option--selected': selectedTemplateId === template.id }"
        type="button"
        @click="selectedTemplateId = template.id"
      >
        <span class="template-option__marker" aria-hidden="true" />
        <span class="template-option__content">
          <strong data-i18n-ignore>{{ template.name }}</strong>
          <small v-if="template.description" data-i18n-ignore>{{ template.description }}</small>
          <span>
            {{ template.sections.length }} разделов · {{ getFieldCount(template.id) }} полей
          </span>
        </span>
      </button>
    </section>

    <div v-else-if="viewStep === 'template'" class="empty-state">
      <strong>Нет доступных макетов</strong>
      <span>Попросите администратора опубликовать макет отчета.</span>
    </div>

    <footer
      v-if="viewStep === 'template' && documentTemplateStore.activeTemplates.length"
      class="choice-footer"
    >
      <button
        class="primary-button"
        type="button"
        :disabled="!selectedTemplate || reportDraftStore.isSaving"
        @click="startReport"
      >
        {{ reportDraftStore.isSaving ? 'Создаем…' : 'Начать отчет' }}
      </button>
    </footer>

    <p
      v-if="documentTemplateStore.errorMessage || reportDraftStore.errorMessage"
      class="error-message"
    >
      {{ documentTemplateStore.errorMessage || reportDraftStore.errorMessage }}
    </p>
  </main>
</template>

<style scoped>
.template-choice-page {
  max-width: 980px;
  gap: 16px;
}

.choice-heading,
.choice-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.choice-heading h1 {
  font-size: clamp(1.45rem, 3vw, 2rem);
  font-weight: 900;
}

.choice-heading p,
.choice-footer > span {
  color: var(--color-text-muted);
  font-size: 0.82rem;
}

.choice-heading p {
  margin-top: 3px;
}

.choice-heading--compact {
  justify-content: flex-end;
}

.report-action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.report-action {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  min-height: 92px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 16px;
  background: var(--color-surface);
  color: var(--color-text);
  text-align: left;
  box-shadow: 0 10px 24px var(--color-shadow);
}

.report-action:hover {
  border-color: #9fbaaa;
}

.report-action--primary {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #ffffff;
}

.report-action__icon {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 10px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 1.25rem;
  font-weight: 900;
}

.report-action--primary .report-action__icon {
  background: rgba(255, 255, 255, 0.14);
  color: #ffffff;
}

.report-action > span:last-child {
  display: grid;
  gap: 4px;
}

.report-action strong {
  font-size: 0.94rem;
  font-weight: 900;
}

.report-action small {
  color: var(--color-text-muted);
  font-size: 0.74rem;
}

.report-action--primary small {
  color: rgba(255, 255, 255, 0.7);
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.template-option {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  align-items: start;
  gap: 12px;
  width: 100%;
  border: 1px solid var(--color-border);
  padding: 16px;
  color: var(--color-text);
  text-align: left;
}

.template-option:hover {
  border-color: #9fbaaa;
}

.template-option--selected {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  box-shadow: 0 0 0 1px var(--color-primary);
}

.template-option__marker {
  width: 18px;
  height: 18px;
  border: 2px solid #aab7af;
  border-radius: 50%;
  margin-top: 1px;
  background: var(--color-surface);
}

.template-option--selected .template-option__marker {
  border: 5px solid var(--color-primary);
}

.template-option__content {
  display: grid;
  gap: 5px;
}

.template-option__content strong {
  font-size: 0.98rem;
  font-weight: 900;
}

.template-option__content small,
.template-option__content > span {
  color: var(--color-text-muted);
  font-size: 0.76rem;
  line-height: 1.4;
}

.template-option__content > span {
  margin-top: 4px;
  font-weight: 750;
}

.choice-footer {
  position: sticky;
  bottom: 16px;
  z-index: 5;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 14px 36px var(--color-shadow);
  backdrop-filter: blur(16px);
  justify-content: flex-end;
}

.choice-footer .primary-button {
  white-space: nowrap;
}

.choice-footer .primary-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.choice-state {
  padding: 32px;
  color: var(--color-text-muted);
  text-align: center;
}

@media (max-width: 620px) {
  .choice-heading {
    align-items: flex-start;
  }

  .choice-heading p {
    max-width: 220px;
  }

  .choice-heading .secondary-button {
    min-height: 38px;
    padding: 8px 11px;
  }

  .report-action-grid,
  .template-grid {
    grid-template-columns: 1fr;
  }

  .choice-footer {
    bottom: 82px;
  }

}
</style>
