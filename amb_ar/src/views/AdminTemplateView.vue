<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import {
  REPORT_TEMPLATE_FIELD_LABELS,
} from '@/shared/constants/report-template-options'
import { useReportTemplateStore } from '@/stores/report-template.store'
import type { ReportTemplateField, ReportTemplateOption } from '@/types/report'

const reportTemplateStore = useReportTemplateStore()

const fields = Object.entries(REPORT_TEMPLATE_FIELD_LABELS).map(([value, label]) => ({
  value: value as ReportTemplateField,
  label,
}))
const selectedField = ref<ReportTemplateField>('productId')
const editingOptionId = ref<string | null>(null)
const optionForm = reactive({
  label: '',
  value: '',
  category: '',
})

const selectedFieldLabel = computed(() => REPORT_TEMPLATE_FIELD_LABELS[selectedField.value])
const selectedOptions = computed(() => reportTemplateStore.getOptionsByField(selectedField.value))

onMounted(() => {
  void reportTemplateStore.loadOptions()
})

function startCreate(): void {
  editingOptionId.value = null
  optionForm.label = ''
  optionForm.value = ''
  optionForm.category = selectedFieldLabel.value
}

function startEdit(option: ReportTemplateOption): void {
  editingOptionId.value = option.id
  optionForm.label = option.label
  optionForm.value = option.value
  optionForm.category = option.category
}

async function saveOption(): Promise<void> {
  if (!optionForm.label.trim()) {
    return
  }

  await reportTemplateStore.saveOption({
    id: editingOptionId.value ?? undefined,
    field: selectedField.value,
    label: optionForm.label,
    value: optionForm.value,
    category: optionForm.category || selectedFieldLabel.value,
  })
  startCreate()
}

async function deleteOption(optionId: string): Promise<void> {
  await reportTemplateStore.deleteOption(optionId)

  if (editingOptionId.value === optionId) {
    startCreate()
  }
}
</script>

<template>
  <main class="screen-page template-page">
    <section class="screen-heading">
      <div>
        <p class="screen-kicker">Администратор</p>
        <h1 class="screen-title">Параметры макета отчета</h1>
        <p class="screen-subtitle">
          Редактируйте варианты для полей, где работник выбирает значение из списка.
        </p>
      </div>
    </section>

    <section class="template-layout">
      <aside class="field-panel app-card">
        <button
          v-for="field in fields"
          :key="field.value"
          class="field-tab"
          :class="{ 'field-tab--active': field.value === selectedField }"
          type="button"
          @click="selectedField = field.value; startCreate()"
        >
          {{ field.label }}
        </button>
      </aside>

      <section class="option-panel app-card">
        <div class="option-panel__header">
          <div>
            <p class="screen-kicker">{{ selectedFieldLabel }}</p>
            <h2>Варианты</h2>
          </div>
          <span>{{ selectedOptions.length }}</span>
        </div>

        <form class="option-form" @submit.prevent="saveOption">
          <label class="field-label">
            Название
            <input v-model="optionForm.label" class="field-control" />
          </label>
          <label class="field-label">
            Значение
            <input v-model="optionForm.value" class="field-control" />
          </label>
          <label class="field-label">
            Группа
            <input v-model="optionForm.category" class="field-control" />
          </label>

          <div class="option-form__actions">
            <button class="primary-button" type="submit" :disabled="reportTemplateStore.isSaving">
              {{ editingOptionId ? 'Сохранить' : 'Добавить' }}
            </button>
            <button class="secondary-button" type="button" @click="startCreate">
              Очистить
            </button>
          </div>
        </form>

        <div v-if="selectedOptions.length" class="option-list">
          <article v-for="option in selectedOptions" :key="option.id" class="option-row">
            <div>
              <h3>{{ option.label }}</h3>
              <p>{{ option.value }} · {{ option.category || 'Без группы' }}</p>
            </div>
            <div class="option-row__actions">
              <button class="secondary-button" type="button" @click="startEdit(option)">
                Изменить
              </button>
              <button class="danger-button" type="button" @click="deleteOption(option.id)">
                Удалить
              </button>
            </div>
          </article>
        </div>

        <p v-else class="empty-state">
          Для этого поля пока нет вариантов.
        </p>

        <p v-if="reportTemplateStore.errorMessage" class="error-message">
          {{ reportTemplateStore.errorMessage }}
        </p>
      </section>
    </section>
  </main>
</template>

<style scoped>
.template-layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 14px;
}

.field-panel,
.option-panel {
  display: grid;
  align-content: start;
  gap: 10px;
  padding: 12px;
}

.field-tab {
  min-height: 46px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 10px;
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
  font-weight: 850;
  text-align: left;
}

.field-tab--active {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #ffffff;
}

.option-panel__header,
.option-row,
.option-row__actions,
.option-form__actions {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.option-panel__header h2,
.option-panel__header > span {
  color: var(--color-text);
  font-size: 1.08rem;
  font-weight: 900;
}

.option-panel__header > span {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 5px 9px;
  background: var(--color-surface-muted);
}

.option-form {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px;
  background: var(--color-surface-muted);
}

.option-form__actions {
  grid-column: 1 / -1;
  justify-content: flex-start;
}

.option-list {
  display: grid;
  gap: 8px;
}

.option-row {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px;
  background: var(--color-surface);
}

.option-row h3 {
  color: var(--color-text);
  font-size: 0.96rem;
  font-weight: 900;
}

.option-row p {
  margin-top: 3px;
  color: var(--color-text-muted);
  font-size: 0.84rem;
}

.danger-button {
  min-height: 46px;
  border: 1px solid #f1b3ad;
  border-radius: 8px;
  padding: 11px 14px;
  background: var(--color-danger-soft);
  color: var(--color-danger);
  font-weight: 850;
}

@media (max-width: 820px) {
  .template-layout,
  .option-form {
    grid-template-columns: 1fr;
  }
}
</style>
