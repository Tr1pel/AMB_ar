<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import {
  DOCUMENT_TEMPLATE_FIELD_CATALOG,
  type DocumentTemplateFieldCatalogItem,
} from '@/shared/constants/document-template'
import { REPORT_TEMPLATE_FIELD_LABELS } from '@/shared/constants/report-template-options'
import { useDocumentTemplateStore } from '@/stores/document-template.store'
import { useReportTemplateStore } from '@/stores/report-template.store'
import type {
  DocumentTemplate,
  DocumentTemplateField,
  DocumentTemplateFieldOption,
  DocumentTemplateFieldType,
  DocumentTemplateSection,
  ReportTemplateField,
  ReportTemplateOption,
} from '@/types/report'

type WorkspaceTab = 'templates' | 'reference'

const documentTemplateStore = useDocumentTemplateStore()
const reportTemplateStore = useReportTemplateStore()

const activeWorkspaceTab = ref<WorkspaceTab>('templates')
const editorTemplate = ref<DocumentTemplate | null>(null)
const selectedSectionId = ref<string | null>(null)
const selectedFieldId = ref<string | null>(null)
const fieldCatalogSelection = ref('')
const editorNotice = ref('')
const catalogNotice = ref('')

const referenceFields = Object.entries(REPORT_TEMPLATE_FIELD_LABELS).map(([value, label]) => ({
  value: value as ReportTemplateField,
  label,
}))
const selectedReferenceField = ref<ReportTemplateField>('productId')
const editingOptionId = ref<string | null>(null)
const optionForm = reactive({
  label: '',
  value: '',
  category: '',
})
const listOptionForm = reactive({
  label: '',
})

const selectedSection = computed(() =>
  editorTemplate.value?.sections.find((section) => section.id === selectedSectionId.value),
)
const selectedTemplateField = computed(() =>
  selectedSection.value?.fields.find((field) => field.id === selectedFieldId.value),
)
const sortedSections = computed(() =>
  [...(editorTemplate.value?.sections ?? [])].sort(
    (firstSection, secondSection) => firstSection.sortOrder - secondSection.sortOrder,
  ),
)
const availableCatalogFields = computed(() => {
  const usedPaths = new Set(
    editorTemplate.value?.sections.flatMap((section) =>
      section.fields.map((field) => field.dataPath),
    ) ?? [],
  )

  return DOCUMENT_TEMPLATE_FIELD_CATALOG.filter((item) => !usedPaths.has(item.dataPath))
})
const catalogGroups = computed(() =>
  availableCatalogFields.value.reduce<Record<string, DocumentTemplateFieldCatalogItem[]>>(
    (groups, field) => {
      groups[field.group] = [...(groups[field.group] ?? []), field]
      return groups
    },
    {},
  ),
)
const totalFieldCount = computed(
  () =>
    editorTemplate.value?.sections.reduce(
      (total, section) => total + section.fields.length,
      0,
    ) ?? 0,
)
const selectedReferenceFieldLabel = computed(
  () => REPORT_TEMPLATE_FIELD_LABELS[selectedReferenceField.value],
)
const selectedOptions = computed(() =>
  reportTemplateStore.getOptionsByField(selectedReferenceField.value),
)

const fieldTypeOptions: Array<{ value: DocumentTemplateFieldType; label: string }> = [
  { value: 'text', label: 'Текст' },
  { value: 'number', label: 'Число' },
  { value: 'date', label: 'Дата' },
  { value: 'select', label: 'Список' },
  { value: 'textarea', label: 'Большой текст' },
  { value: 'photo', label: 'Фото' },
  { value: 'signature', label: 'Подпись' },
]

onMounted(() => {
  void Promise.all([
    documentTemplateStore.loadTemplates(),
    reportTemplateStore.loadOptions(),
  ])
})

async function createTemplate(): Promise<void> {
  const template = await documentTemplateStore.createEmpty()

  if (template) {
    openDraftInEditor(template)
    editorNotice.value = 'Макет создан на сервере. Добавьте разделы и поля.'
  }
}

async function editTemplate(template: DocumentTemplate): Promise<void> {
  const editableTemplate = await documentTemplateStore.edit(template.id)

  if (!editableTemplate) {
    return
  }

  openDraftInEditor(editableTemplate)
  editorNotice.value =
    template.status === 'draft'
      ? 'Продолжайте редактирование черновика.'
      : `Редактируется выбранный макет. Изменения будут сохранены в нем же.`
}

function openDraftInEditor(template: DocumentTemplate): void {
  catalogNotice.value = ''
  editorTemplate.value = structuredClone(template)
  editorTemplate.value.sections.forEach((section) => {
    section.fields.forEach((field) => {
      field.options ??= []
    })
  })
  selectedSectionId.value = editorTemplate.value.sections[0]?.id ?? null
  selectedFieldId.value = null
  fieldCatalogSelection.value = ''
}

function closeEditor(): void {
  editorTemplate.value = null
  selectedSectionId.value = null
  selectedFieldId.value = null
  editorNotice.value = ''
}

async function saveTemplate(): Promise<DocumentTemplate | null> {
  if (!editorTemplate.value) {
    return null
  }

  const previousSectionId = selectedSectionId.value
  const previousFieldId = selectedFieldId.value
  const savedTemplate = await documentTemplateStore.save({
    id: editorTemplate.value.id,
    name: editorTemplate.value.name,
    description: editorTemplate.value.description,
    sections: editorTemplate.value.sections,
  })

  if (savedTemplate) {
    openDraftInEditor(savedTemplate)
    if (savedTemplate.sections.some((section) => section.id === previousSectionId)) {
      selectedSectionId.value = previousSectionId
    }

    if (
      savedTemplate.sections.some((section) =>
        section.fields.some((field) => field.id === previousFieldId),
      )
    ) {
      selectedFieldId.value = previousFieldId
    }
    editorNotice.value = `Сохранено на сервере в ${formatTime(savedTemplate.updatedAt)}`
  }

  return savedTemplate
}

async function publishTemplate(): Promise<void> {
  const savedTemplate = await saveTemplate()

  if (!savedTemplate) {
    return
  }

  const shouldPublish = window.confirm(
    `Опубликовать «${savedTemplate.name}»? Проверяющие смогут выбрать его для новых отчетов.`,
  )

  if (!shouldPublish) {
    return
  }

  const publishedTemplate = await documentTemplateStore.publish(savedTemplate.id)

  if (publishedTemplate) {
    closeEditor()
    catalogNotice.value = `«${publishedTemplate.name}» опубликован и доступен проверяющим.`
  }
}

async function duplicateTemplate(template: DocumentTemplate): Promise<void> {
  const duplicate = await documentTemplateStore.duplicate(template.id)

  if (duplicate) {
    openDraftInEditor(duplicate)
    editorNotice.value = 'Создан независимый черновик-копия.'
  }
}

async function deleteTemplate(template: DocumentTemplate): Promise<void> {
  const shouldDelete = window.confirm(
    `Удалить макет «${template.name}»? Готовые отчеты сохранят использованную структуру.`,
  )

  if (!shouldDelete) {
    return
  }

  const deleted = await documentTemplateStore.deleteTemplate(template.id)

  if (deleted && editorTemplate.value?.id === template.id) {
    closeEditor()
  }
}

function addSection(): void {
  if (!editorTemplate.value) {
    return
  }

  const section: DocumentTemplateSection = {
    id: createLocalId('template-section'),
    title: `Раздел ${editorTemplate.value.sections.length + 1}`,
    description: '',
    sortOrder: editorTemplate.value.sections.length + 1,
    fields: [],
  }

  editorTemplate.value.sections.push(section)
  selectedSectionId.value = section.id
  selectedFieldId.value = null
}

function selectSection(sectionId: string): void {
  selectedSectionId.value = sectionId
  selectedFieldId.value = null
}

function removeSection(section: DocumentTemplateSection): void {
  if (!editorTemplate.value || editorTemplate.value.sections.length === 1) {
    return
  }

  const shouldDelete =
    !section.fields.length ||
    window.confirm(`Удалить раздел «${section.title}» и все его поля?`)

  if (!shouldDelete) {
    return
  }

  const sectionIndex = editorTemplate.value.sections.findIndex(
    (item) => item.id === section.id,
  )

  editorTemplate.value.sections.splice(sectionIndex, 1)
  normalizeSectionOrder()
  selectedSectionId.value = editorTemplate.value.sections[0]?.id ?? null
  selectedFieldId.value = null
}

function moveSection(sectionId: string, direction: -1 | 1): void {
  if (!editorTemplate.value) {
    return
  }

  const sectionIndex = editorTemplate.value.sections.findIndex(
    (section) => section.id === sectionId,
  )
  const targetIndex = sectionIndex + direction

  if (sectionIndex < 0 || targetIndex < 0 || targetIndex >= editorTemplate.value.sections.length) {
    return
  }

  const [section] = editorTemplate.value.sections.splice(sectionIndex, 1)

  if (section) {
    editorTemplate.value.sections.splice(targetIndex, 0, section)
    normalizeSectionOrder()
  }
}

function addSelectedCatalogField(): void {
  const section = selectedSection.value
  const catalogField = DOCUMENT_TEMPLATE_FIELD_CATALOG.find(
    (field) => field.dataPath === fieldCatalogSelection.value,
  )

  if (!section || !catalogField) {
    return
  }

  const field = createFieldFromCatalog(catalogField, section.fields.length + 1)

  section.fields.push(field)
  selectedFieldId.value = field.id
  fieldCatalogSelection.value = ''
}

function addCustomField(): void {
  const section = selectedSection.value

  if (!section) {
    return
  }

  const field: DocumentTemplateField = {
    id: createLocalId('template-field'),
    dataPath: `custom.${crypto.randomUUID()}`,
    label: 'Новое поле',
    type: 'text',
    required: false,
    placeholder: '',
    helpText: '',
    width: 'half',
    sortOrder: section.fields.length + 1,
    options: [],
  }

  section.fields.push(field)
  selectedFieldId.value = field.id
}

function selectTemplateField(sectionId: string, fieldId: string): void {
  selectedSectionId.value = sectionId
  selectedFieldId.value = fieldId
  const field = editorTemplate.value?.sections
    .find((section) => section.id === sectionId)
    ?.fields.find((templateField) => templateField.id === fieldId)

  if (field) {
    field.options ??= []
  }

  listOptionForm.label = ''
}

function removeField(fieldId: string): void {
  const section = selectedSection.value

  if (!section) {
    return
  }

  const fieldIndex = section.fields.findIndex((field) => field.id === fieldId)

  if (fieldIndex < 0) {
    return
  }

  section.fields.splice(fieldIndex, 1)
  normalizeFieldOrder(section)
  selectedFieldId.value = null
}

function moveField(fieldId: string, direction: -1 | 1): void {
  const section = selectedSection.value

  if (!section) {
    return
  }

  const fieldIndex = section.fields.findIndex((field) => field.id === fieldId)
  const targetIndex = fieldIndex + direction

  if (fieldIndex < 0 || targetIndex < 0 || targetIndex >= section.fields.length) {
    return
  }

  const [field] = section.fields.splice(fieldIndex, 1)

  if (field) {
    section.fields.splice(targetIndex, 0, field)
    normalizeFieldOrder(section)
  }
}

function normalizeSectionOrder(): void {
  editorTemplate.value?.sections.forEach((section, index) => {
    section.sortOrder = index + 1
  })
}

function normalizeFieldOrder(section: DocumentTemplateSection): void {
  section.fields.forEach((field, index) => {
    field.sortOrder = index + 1
  })
}

function addListOption(): void {
  const field = selectedTemplateField.value
  const label = listOptionForm.label.trim()

  if (!field || field.type !== 'select' || !label) {
    return
  }

  field.options ??= []
  const option: DocumentTemplateFieldOption = {
    id: createLocalId('template-field-option'),
    label,
    sortOrder: field.options.length + 1,
  }

  field.options.push(option)
  listOptionForm.label = ''
}

function removeListOption(optionId: string): void {
  const field = selectedTemplateField.value

  if (!field) {
    return
  }

  field.options = (field.options ?? []).filter((option) => option.id !== optionId)
  normalizeListOptionOrder(field)
}

function moveListOption(optionId: string, direction: -1 | 1): void {
  const field = selectedTemplateField.value

  if (!field) {
    return
  }

  field.options ??= []
  const optionIndex = field.options.findIndex((option) => option.id === optionId)
  const targetIndex = optionIndex + direction

  if (optionIndex < 0 || targetIndex < 0 || targetIndex >= field.options.length) {
    return
  }

  const [option] = field.options.splice(optionIndex, 1)

  if (option) {
    field.options.splice(targetIndex, 0, option)
    normalizeListOptionOrder(field)
  }
}

function normalizeListOptionOrder(field: DocumentTemplateField): void {
  field.options?.forEach((option, index) => {
    option.sortOrder = index + 1
  })
}

function createFieldFromCatalog(
  catalogField: DocumentTemplateFieldCatalogItem,
  sortOrder: number,
): DocumentTemplateField {
  return {
    id: createLocalId('template-field'),
    dataPath: catalogField.dataPath,
    label: catalogField.label,
    type: catalogField.type,
    required: false,
    placeholder: '',
    helpText: '',
    width:
      catalogField.type === 'textarea' || catalogField.type === 'photo' ? 'full' : 'half',
    sortOrder,
    options: [],
  }
}

function createLocalId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

function getTemplateStatusLabel(template: DocumentTemplate): string {
  if (template.status === 'active') {
    return 'Опубликован'
  }

  if (template.status === 'archived') {
    return 'Архив'
  }

  return 'Черновик'
}

function getFieldTypeLabel(type: DocumentTemplateFieldType): string {
  return fieldTypeOptions.find((option) => option.value === type)?.label ?? type
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(timestamp)
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

function startCreateOption(): void {
  editingOptionId.value = null
  optionForm.label = ''
  optionForm.value = ''
  optionForm.category = selectedReferenceFieldLabel.value
}

function startEditOption(option: ReportTemplateOption): void {
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
    field: selectedReferenceField.value,
    label: optionForm.label,
    value: optionForm.value,
    category: optionForm.category || selectedReferenceFieldLabel.value,
  })
  startCreateOption()
}

async function deleteOption(optionId: string): Promise<void> {
  const option = selectedOptions.value.find((item) => item.id === optionId)
  const shouldDelete = window.confirm(
    `Удалить вариант «${option?.label ?? optionId}» из справочника?`,
  )

  if (!shouldDelete) {
    return
  }

  await reportTemplateStore.deleteOption(optionId)

  if (editingOptionId.value === optionId) {
    startCreateOption()
  }
}
</script>

<template>
  <main class="screen-page template-page">
    <template v-if="!editorTemplate">
      <section class="screen-heading template-heading">
        <div>
          <p class="screen-kicker">Администратор</p>
          <h1 class="screen-title">Макеты отчетов</h1>
          <p class="screen-subtitle">
            Создавайте структуру отчета и настраивайте стандартные варианты выпадающих списков.
          </p>
        </div>
        <button
          v-if="activeWorkspaceTab === 'templates'"
          class="primary-button"
          type="button"
          :disabled="documentTemplateStore.isSaving"
          @click="createTemplate"
        >
          <span aria-hidden="true">＋</span>
          Новый макет
        </button>
      </section>

      <div class="workspace-tabs" role="tablist" aria-label="Настройки отчетов">
        <button
          type="button"
          :class="{ 'workspace-tab--active': activeWorkspaceTab === 'templates' }"
          @click="activeWorkspaceTab = 'templates'"
        >
          Макеты
          <span>{{ documentTemplateStore.templates.length }}</span>
        </button>
        <button
          type="button"
          :class="{ 'workspace-tab--active': activeWorkspaceTab === 'reference' }"
          @click="activeWorkspaceTab = 'reference'"
        >
          Варианты списков
        </button>
      </div>

      <section v-if="activeWorkspaceTab === 'templates'" class="template-catalog">
        <p v-if="catalogNotice" class="success-message catalog-message">
          {{ catalogNotice }}
        </p>
        <div v-if="documentTemplateStore.isLoading" class="empty-state">
          Загружаем макеты с сервера…
        </div>

        <article
          v-for="template in documentTemplateStore.templates"
          :key="template.id"
          class="template-card app-card"
          :class="{ 'template-card--active': template.status === 'active' }"
        >
          <div class="template-card__top">
            <span
              class="status-badge"
              :class="`status-badge--${template.status}`"
            >
              {{ getTemplateStatusLabel(template) }}
            </span>
            <button
              class="icon-button"
              type="button"
              title="Создать копию"
              aria-label="Создать копию"
              @click="duplicateTemplate(template)"
            >
              ⧉
            </button>
          </div>

          <div>
            <h2>{{ template.name }}</h2>
            <p>{{ template.description || 'Описание макета не добавлено.' }}</p>
          </div>

          <dl class="template-card__meta">
            <div>
              <dt>Разделов</dt>
              <dd>{{ template.sections.length }}</dd>
            </div>
            <div>
              <dt>Полей</dt>
              <dd>
                {{
                  template.sections.reduce(
                    (total, section) => total + section.fields.length,
                    0,
                  )
                }}
              </dd>
            </div>
          </dl>

          <div class="template-card__footer">
            <small>Обновлен {{ formatDate(template.updatedAt) }}</small>
            <div>
              <button
                class="secondary-button"
                type="button"
                @click="editTemplate(template)"
              >
                {{ template.status === 'draft' ? 'Продолжить' : 'Редактировать' }}
              </button>
              <button
                v-if="template.status === 'draft'"
                class="text-danger-button"
                type="button"
                aria-label="Удалить макет"
                title="Удалить"
                @click="deleteTemplate(template)"
              >
                ×
              </button>
            </div>
          </div>
        </article>

        <button
          class="create-template-card"
          type="button"
          :disabled="documentTemplateStore.isSaving"
          @click="createTemplate"
        >
          <span aria-hidden="true">＋</span>
          <strong>Создать с нуля</strong>
          <small>Пустой макет с одним разделом</small>
        </button>

        <p v-if="documentTemplateStore.errorMessage" class="error-message catalog-message">
          {{ documentTemplateStore.errorMessage }}
        </p>
      </section>

      <section v-else class="reference-layout">
        <aside class="reference-fields app-card">
          <button
            v-for="field in referenceFields"
            :key="field.value"
            class="reference-field-tab"
            :class="{ 'reference-field-tab--active': field.value === selectedReferenceField }"
            type="button"
            @click="selectedReferenceField = field.value; startCreateOption()"
          >
            {{ field.label }}
            <span>{{ reportTemplateStore.getOptionsByField(field.value).length }}</span>
          </button>
        </aside>

        <section class="reference-panel app-card">
          <div class="panel-heading">
            <div>
              <p class="screen-kicker">{{ selectedReferenceFieldLabel }}</p>
              <h2>Варианты для выпадающего списка</h2>
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
              <input
                v-model="optionForm.value"
                class="field-control"
                placeholder="Если пусто, используется название"
              />
            </label>
            <label class="field-label">
              Группа
              <input v-model="optionForm.category" class="field-control" />
            </label>

            <div class="option-form__actions">
              <button
                class="primary-button"
                type="submit"
                :disabled="reportTemplateStore.isSaving"
              >
                {{ editingOptionId ? 'Сохранить' : 'Добавить' }}
              </button>
              <button class="secondary-button" type="button" @click="startCreateOption">
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
                <button
                  class="secondary-button compact-button"
                  type="button"
                  @click="startEditOption(option)"
                >
                  Изменить
                </button>
                <button
                  class="danger-button compact-button"
                  type="button"
                  @click="deleteOption(option.id)"
                >
                  Удалить
                </button>
              </div>
            </article>
          </div>

          <p v-else class="empty-state">Для этого поля пока нет вариантов.</p>
          <p v-if="reportTemplateStore.errorMessage" class="error-message">
            {{ reportTemplateStore.errorMessage }}
          </p>
        </section>
      </section>
    </template>

    <template v-else>
      <section class="builder-toolbar">
        <button class="back-button" type="button" @click="closeEditor">
          <span aria-hidden="true">←</span>
          К макетам
        </button>
        <div class="builder-toolbar__title">
          <span
            class="status-badge"
            :class="`status-badge--${editorTemplate.status}`"
          >
            {{ getTemplateStatusLabel(editorTemplate) }}
          </span>
        </div>
        <div class="builder-toolbar__actions">
          <button
            class="secondary-button"
            type="button"
            :disabled="documentTemplateStore.isSaving"
            @click="saveTemplate"
          >
            Сохранить
          </button>
          <button
            class="primary-button"
            type="button"
            :disabled="documentTemplateStore.isSaving || editorTemplate.status === 'active'"
            @click="publishTemplate"
          >
            {{ editorTemplate.status === 'active' ? 'Опубликовано' : 'Опубликовать' }}
          </button>
        </div>
      </section>

      <p v-if="editorNotice" class="builder-notice">
        <span aria-hidden="true">✓</span>
        {{ editorNotice }}
      </p>

      <section class="builder-meta app-card">
        <label class="field-label">
          Название макета
          <input
            v-model="editorTemplate.name"
            class="field-control"
            placeholder="Например, Приемка свежих овощей"
          />
        </label>
        <label class="field-label">
          Описание
          <input
            v-model="editorTemplate.description"
            class="field-control"
            placeholder="Кратко опишите назначение"
          />
        </label>
        <dl>
          <div>
            <dt>Разделов</dt>
            <dd>{{ editorTemplate.sections.length }}</dd>
          </div>
          <div>
            <dt>Полей</dt>
            <dd>{{ totalFieldCount }}</dd>
          </div>
        </dl>
      </section>

      <section class="builder-layout">
        <aside class="builder-structure app-card">
          <div class="panel-heading">
            <div>
              <p class="screen-kicker">Структура</p>
              <h2>Разделы отчета</h2>
            </div>
            <button class="small-add-button" type="button" @click="addSection">＋</button>
          </div>

          <div class="section-navigation">
            <button
              v-for="(section, index) in sortedSections"
              :key="section.id"
              class="section-navigation__item"
              :class="{ 'section-navigation__item--active': section.id === selectedSectionId }"
              type="button"
              @click="selectSection(section.id)"
            >
              <span>{{ String(index + 1).padStart(2, '0') }}</span>
              <span>
                <strong>{{ section.title }}</strong>
                <small>{{ section.fields.length }} полей</small>
              </span>
            </button>
          </div>

          <button class="add-section-button" type="button" @click="addSection">
            ＋ Добавить раздел
          </button>
        </aside>

        <section v-if="selectedSection" class="builder-canvas app-card">
          <div class="canvas-section-heading">
            <div class="canvas-section-heading__inputs">
              <input
                v-model="selectedSection.title"
                class="section-title-input"
                aria-label="Название раздела"
              />
              <input
                v-model="selectedSection.description"
                class="section-description-input"
                aria-label="Описание раздела"
                placeholder="Описание раздела"
              />
            </div>
            <div class="inline-icon-actions">
              <button
                type="button"
                title="Переместить выше"
                @click="moveSection(selectedSection.id, -1)"
              >
                ↑
              </button>
              <button
                type="button"
                title="Переместить ниже"
                @click="moveSection(selectedSection.id, 1)"
              >
                ↓
              </button>
              <button
                type="button"
                title="Удалить раздел"
                :disabled="editorTemplate.sections.length === 1"
                @click="removeSection(selectedSection)"
              >
                ×
              </button>
            </div>
          </div>

          <div class="field-builder-list">
            <article
              v-for="(field, index) in selectedSection.fields"
              :key="field.id"
              class="field-builder-card"
              :class="{
                'field-builder-card--selected': field.id === selectedFieldId,
                'field-builder-card--full': field.width === 'full',
              }"
              @click="selectTemplateField(selectedSection.id, field.id)"
            >
              <span class="field-drag-handle" aria-hidden="true">⋮⋮</span>
              <div class="field-builder-card__body">
                <span>{{ getFieldTypeLabel(field.type) }}</span>
                <strong>
                  {{ field.label }}
                  <em v-if="field.required">*</em>
                </strong>
                <small v-if="field.helpText">{{ field.helpText }}</small>
              </div>
              <div class="inline-icon-actions field-actions">
                <button
                  type="button"
                  title="Переместить выше"
                  :disabled="index === 0"
                  @click.stop="moveField(field.id, -1)"
                >
                  ↑
                </button>
                <button
                  type="button"
                  title="Переместить ниже"
                  :disabled="index === selectedSection.fields.length - 1"
                  @click.stop="moveField(field.id, 1)"
                >
                  ↓
                </button>
                <button
                  type="button"
                  title="Удалить поле"
                  @click.stop="removeField(field.id)"
                >
                  ×
                </button>
              </div>
            </article>

            <div v-if="!selectedSection.fields.length" class="empty-field-drop">
              <span aria-hidden="true">▦</span>
              <strong>В разделе пока нет полей</strong>
              <small>Выберите готовое поле ниже или создайте свое.</small>
            </div>
          </div>

          <div class="field-add-panel">
            <label class="field-label">
              Добавить готовое поле
              <select v-model="fieldCatalogSelection" class="field-control">
                <option value="">Выберите поле</option>
                <optgroup
                  v-for="(fields, group) in catalogGroups"
                  :key="group"
                  :label="group"
                >
                  <option
                    v-for="field in fields"
                    :key="field.dataPath"
                    :value="field.dataPath"
                  >
                    {{ field.label }}
                  </option>
                </optgroup>
              </select>
            </label>
            <button
              class="secondary-button"
              type="button"
              :disabled="!fieldCatalogSelection"
              @click="addSelectedCatalogField"
            >
              Добавить
            </button>
            <button class="ghost-button" type="button" @click="addCustomField">
              ＋ Свое поле
            </button>
          </div>
        </section>

        <aside class="builder-properties app-card">
          <template v-if="selectedTemplateField">
            <div class="panel-heading">
              <div>
                <p class="screen-kicker">Свойства</p>
                <h2>Настройка поля</h2>
              </div>
              <span class="property-type-icon">Aa</span>
            </div>

            <label class="field-label">
              Название
              <input v-model="selectedTemplateField.label" class="field-control" />
            </label>
            <label class="field-label">
              Тип поля
              <select v-model="selectedTemplateField.type" class="field-control">
                <option
                  v-for="typeOption in fieldTypeOptions"
                  :key="typeOption.value"
                  :value="typeOption.value"
                >
                  {{ typeOption.label }}
                </option>
              </select>
            </label>

            <section
              v-if="selectedTemplateField.type === 'select'"
              class="list-options-editor"
            >
              <div class="list-options-editor__heading">
                <strong>Варианты списка</strong>
              </div>

              <div v-if="selectedTemplateField.options.length" class="list-option-rows">
                <div
                  v-for="(option, optionIndex) in selectedTemplateField.options"
                  :key="option.id"
                  class="list-option-row"
                >
                  <span class="list-option-row__number">{{ optionIndex + 1 }}</span>
                  <div class="list-option-row__fields">
                    <input
                      v-model="option.label"
                      class="field-control"
                      aria-label="Название варианта"
                      placeholder="Название"
                    />
                  </div>
                  <div class="list-option-row__actions">
                    <button
                      type="button"
                      aria-label="Поднять вариант"
                      :disabled="optionIndex === 0"
                      @click="moveListOption(option.id, -1)"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label="Опустить вариант"
                      :disabled="optionIndex === selectedTemplateField.options.length - 1"
                      @click="moveListOption(option.id, 1)"
                    >
                      ↓
                    </button>
                    <button
                      class="list-option-row__remove"
                      type="button"
                      aria-label="Удалить вариант"
                      @click="removeListOption(option.id)"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>

              <div class="list-option-add">
                <input
                  v-model="listOptionForm.label"
                  class="field-control"
                  placeholder="Например: Соответствует"
                  @keydown.enter.prevent="addListOption"
                />
                <button
                  class="secondary-button compact-button"
                  type="button"
                  :disabled="!listOptionForm.label.trim()"
                  @click="addListOption"
                >
                  + Добавить вариант
                </button>
              </div>
            </section>

            <p v-if="selectedTemplateField.type === 'signature'" class="automatic-field-note">
              ФИО инспектора подставляется автоматически и не редактируется в отчете.
            </p>

            <label v-else class="field-label">
              Подсказка внутри поля
              <input
                v-model="selectedTemplateField.placeholder"
                class="field-control"
                placeholder="Необязательно"
              />
            </label>
            <label class="field-label">
              Пояснение
              <textarea
                v-model="selectedTemplateField.helpText"
                class="field-control property-textarea"
                placeholder="Текст под полем"
              />
            </label>

            <div class="property-choice">
              <span>Ширина</span>
              <div>
                <button
                  type="button"
                  :class="{ 'choice-button--active': selectedTemplateField.width === 'half' }"
                  @click="selectedTemplateField.width = 'half'"
                >
                  ½
                </button>
                <button
                  type="button"
                  :class="{ 'choice-button--active': selectedTemplateField.width === 'full' }"
                  @click="selectedTemplateField.width = 'full'"
                >
                  1/1
                </button>
              </div>
            </div>

            <label class="toggle-row">
              <span>
                <strong>Обязательное поле</strong>
                <small>Без значения отчет нельзя завершить</small>
              </span>
              <input v-model="selectedTemplateField.required" type="checkbox" />
            </label>

            <div class="field-preview">
              <span>Предпросмотр</span>
              <label>
                {{ selectedTemplateField.label }}
                <em v-if="selectedTemplateField.required">*</em>
              </label>
              <textarea
                v-if="selectedTemplateField.type === 'textarea'"
                disabled
                :placeholder="selectedTemplateField.placeholder || 'Введите значение'"
              />
              <select v-else-if="selectedTemplateField.type === 'select'" disabled>
                <option value="">
                  {{ selectedTemplateField.placeholder || 'Выберите значение' }}
                </option>
                <option
                  v-for="option in selectedTemplateField.options"
                  :key="option.id"
                  :value="option.label"
                >
                  {{ option.label }}
                </option>
              </select>
              <input
                v-else-if="selectedTemplateField.type === 'signature'"
                disabled
                value="ФИО инспектора — автоматически"
              />
              <div v-else-if="selectedTemplateField.type === 'photo'" class="photo-placeholder">
                ＋ Добавить фото
              </div>
              <input
                v-else
                disabled
                :type="selectedTemplateField.type === 'number' ? 'number' : selectedTemplateField.type === 'date' ? 'date' : 'text'"
                :placeholder="selectedTemplateField.placeholder || 'Введите значение'"
              />
              <small v-if="selectedTemplateField.helpText">
                {{ selectedTemplateField.helpText }}
              </small>
            </div>

            <button
              class="remove-field-button"
              type="button"
              @click="removeField(selectedTemplateField.id)"
            >
              Удалить поле
            </button>
          </template>

          <div v-else class="property-empty">
            <span aria-hidden="true">↖</span>
            <strong>Выберите поле</strong>
            <p>Нажмите на поле в макете, чтобы изменить его название, тип и обязательность.</p>
          </div>
        </aside>
      </section>

      <p v-if="documentTemplateStore.errorMessage" class="error-message">
        {{ documentTemplateStore.errorMessage }}
      </p>
    </template>
  </main>
</template>

<style scoped>
.template-page {
  width: min(100%, 1440px);
}

.template-heading .primary-button {
  gap: 7px;
  white-space: nowrap;
}

.workspace-tabs {
  display: flex;
  gap: 22px;
  border-bottom: 1px solid var(--color-border);
}

.workspace-tabs button {
  display: inline-flex;
  min-height: 46px;
  align-items: center;
  gap: 8px;
  border-bottom: 2px solid transparent;
  color: var(--color-text-muted);
  font-size: 0.86rem;
  font-weight: 850;
}

.workspace-tabs button span {
  display: grid;
  min-width: 22px;
  height: 22px;
  place-items: center;
  border-radius: 7px;
  background: var(--color-surface-muted);
  font-size: 0.72rem;
}

.workspace-tabs .workspace-tab--active {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.template-catalog {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.template-card {
  display: grid;
  min-height: 280px;
  align-content: space-between;
  gap: 18px;
  padding: 18px;
  box-shadow: 0 8px 24px rgba(34, 57, 43, 0.06);
}

.template-card--active {
  border-color: #8db7a0;
  box-shadow: 0 10px 26px rgba(18, 55, 42, 0.11);
}

.template-card__top,
.template-card__footer,
.template-card__footer > div,
.panel-heading,
.canvas-section-heading,
.inline-icon-actions,
.builder-toolbar,
.builder-toolbar__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
}

.status-badge {
  display: inline-flex;
  min-height: 26px;
  align-items: center;
  border-radius: 999px;
  padding: 4px 9px;
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.status-badge--active {
  background: var(--color-success-soft);
  color: var(--color-success);
}

.status-badge--draft {
  background: #f7eddc;
  color: #91611e;
}

.status-badge--archived {
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
}

.icon-button,
.small-add-button,
.inline-icon-actions button {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: 1rem;
  font-weight: 900;
}

.template-card h2 {
  color: var(--color-text);
  font-size: 1.08rem;
  font-weight: 900;
}

.template-card p {
  min-height: 42px;
  margin-top: 7px;
  color: var(--color-text-muted);
  font-size: 0.84rem;
}

.template-card__meta {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  border-block: 1px solid var(--color-border);
  padding: 13px 0;
}

.template-card__meta div {
  display: grid;
  gap: 3px;
}

.template-card__meta dt {
  color: var(--color-text-muted);
  font-size: 0.68rem;
}

.template-card__meta dd {
  color: var(--color-text);
  font-size: 0.9rem;
  font-weight: 900;
}

.template-card__footer {
  align-items: flex-end;
}

.template-card__footer small {
  color: var(--color-text-muted);
  font-size: 0.7rem;
}

.template-card__footer .secondary-button {
  min-height: 38px;
  padding: 7px 12px;
}

.text-danger-button {
  min-width: 34px;
  min-height: 34px;
  border-radius: 8px;
  color: var(--color-danger);
  font-size: 1.3rem;
}

.create-template-card {
  display: grid;
  min-height: 280px;
  place-content: center;
  gap: 8px;
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.44);
  color: var(--color-primary);
  text-align: center;
}

.create-template-card > span {
  display: grid;
  width: 52px;
  height: 52px;
  margin: 0 auto 4px;
  place-items: center;
  border-radius: 14px;
  background: var(--color-primary-soft);
  font-size: 1.6rem;
}

.create-template-card small {
  color: var(--color-text-muted);
}

.catalog-message {
  grid-column: 1 / -1;
}

.reference-layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 14px;
}

.reference-fields,
.reference-panel {
  display: grid;
  align-content: start;
  gap: 10px;
  padding: 12px;
}

.reference-field-tab {
  display: flex;
  min-height: 46px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid transparent;
  border-radius: 9px;
  padding: 10px;
  color: var(--color-text-muted);
  font-size: 0.82rem;
  font-weight: 800;
  text-align: left;
}

.reference-field-tab span {
  min-width: 24px;
  border-radius: 7px;
  padding: 3px 6px;
  background: var(--color-surface-muted);
  text-align: center;
}

.reference-field-tab--active {
  border-color: var(--color-border);
  background: var(--color-primary);
  color: #ffffff;
}

.reference-field-tab--active span {
  background: rgba(255, 255, 255, 0.14);
}

.panel-heading {
  align-items: flex-start;
}

.panel-heading h2 {
  color: var(--color-text);
  font-size: 1rem;
  font-weight: 900;
}

.panel-heading > span:not(.property-type-icon) {
  border-radius: 8px;
  padding: 5px 9px;
  background: var(--color-surface-muted);
  color: var(--color-text);
  font-size: 0.78rem;
  font-weight: 900;
}

.option-form {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 12px;
  background: var(--color-surface-muted);
}

.option-form__actions,
.option-row,
.option-row__actions {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
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
  border-radius: 9px;
  padding: 12px;
}

.option-row h3 {
  color: var(--color-text);
  font-size: 0.9rem;
  font-weight: 900;
}

.option-row p {
  margin-top: 3px;
  color: var(--color-text-muted);
  font-size: 0.78rem;
}

.compact-button {
  min-height: 38px;
  padding: 7px 11px;
}

.builder-toolbar {
  position: sticky;
  z-index: 10;
  top: 84px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 10px 24px var(--color-shadow);
  backdrop-filter: blur(14px);
}

.back-button {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  gap: 7px;
  color: var(--color-primary);
  font-size: 0.82rem;
  font-weight: 850;
}

.builder-toolbar__title {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--color-text-muted);
  font-size: 0.76rem;
}

.builder-toolbar__actions .primary-button,
.builder-toolbar__actions .secondary-button {
  min-height: 40px;
  padding-block: 7px;
}

.builder-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: -8px;
  border-radius: 9px;
  padding: 9px 12px;
  background: var(--color-success-soft);
  color: var(--color-success);
  font-size: 0.78rem;
  font-weight: 800;
}

.builder-notice span {
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  border-radius: 50%;
  background: var(--color-success);
  color: #ffffff;
}

.builder-meta {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(300px, 1.4fr) auto;
  align-items: end;
  gap: 12px;
  padding: 14px;
}

.builder-meta dl {
  display: flex;
  gap: 8px;
}

.builder-meta dl div {
  min-width: 72px;
  border: 1px solid var(--color-border);
  border-radius: 9px;
  padding: 8px 10px;
  background: var(--color-surface-muted);
}

.builder-meta dt {
  color: var(--color-text-muted);
  font-size: 0.65rem;
}

.builder-meta dd {
  color: var(--color-text);
  font-size: 1rem;
  font-weight: 900;
}

.builder-layout {
  display: grid;
  grid-template-columns: 230px minmax(420px, 1fr) 300px;
  align-items: start;
  gap: 12px;
}

.builder-structure,
.builder-canvas,
.builder-properties {
  display: grid;
  align-content: start;
  gap: 13px;
  padding: 13px;
  box-shadow: 0 8px 22px rgba(34, 57, 43, 0.05);
}

.section-navigation {
  display: grid;
  gap: 6px;
}

.section-navigation__item {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-height: 54px;
  border: 1px solid transparent;
  border-radius: 9px;
  padding: 7px 8px;
  color: var(--color-text-muted);
  text-align: left;
}

.section-navigation__item > span:first-child {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 8px;
  background: var(--color-surface-muted);
  font-size: 0.7rem;
  font-weight: 900;
}

.section-navigation__item > span:last-child {
  display: grid;
  min-width: 0;
}

.section-navigation__item strong {
  overflow: hidden;
  color: var(--color-text);
  font-size: 0.78rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.section-navigation__item small {
  margin-top: 2px;
  font-size: 0.68rem;
}

.section-navigation__item--active {
  border-color: #b9cec1;
  background: var(--color-primary-soft);
}

.section-navigation__item--active > span:first-child {
  background: var(--color-primary);
  color: #ffffff;
}

.add-section-button {
  min-height: 40px;
  border: 1px dashed var(--color-border-strong);
  border-radius: 9px;
  color: var(--color-primary);
  font-size: 0.78rem;
  font-weight: 850;
}

.canvas-section-heading {
  align-items: flex-start;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 12px;
}

.canvas-section-heading__inputs {
  display: grid;
  min-width: 0;
  flex: 1;
}

.section-title-input,
.section-description-input {
  width: 100%;
  padding: 2px 4px;
  color: var(--color-text);
}

.section-title-input {
  font-size: 1.08rem;
  font-weight: 900;
}

.section-description-input {
  margin-top: 3px;
  color: var(--color-text-muted);
  font-size: 0.78rem;
}

.inline-icon-actions {
  justify-content: flex-end;
  gap: 4px;
}

.inline-icon-actions button {
  width: 30px;
  height: 30px;
  border-color: transparent;
  background: transparent;
  font-size: 0.85rem;
}

.inline-icon-actions button:hover:not(:disabled) {
  border-color: var(--color-border);
  background: var(--color-surface-muted);
}

.inline-icon-actions button:disabled {
  opacity: 0.3;
}

.field-builder-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.field-builder-card {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  min-height: 84px;
  border: 1px solid var(--color-border);
  border-radius: 9px;
  padding: 9px;
  background: var(--color-surface);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.field-builder-card--full {
  grid-column: 1 / -1;
}

.field-builder-card--selected {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(18, 55, 42, 0.1);
}

.field-drag-handle {
  color: var(--color-border-strong);
  font-weight: 900;
}

.field-builder-card__body {
  display: grid;
  min-width: 0;
}

.field-builder-card__body > span {
  color: var(--color-accent-dark);
  font-size: 0.59rem;
  font-weight: 900;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.field-builder-card__body strong {
  overflow: hidden;
  margin-top: 3px;
  color: var(--color-text);
  font-size: 0.8rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field-builder-card__body em,
.field-preview em {
  color: var(--color-danger);
  font-style: normal;
}

.field-builder-card__body small {
  overflow: hidden;
  margin-top: 3px;
  color: var(--color-text-muted);
  font-size: 0.64rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field-actions {
  opacity: 0;
  transition: opacity 0.15s ease;
}

.field-builder-card:hover .field-actions,
.field-builder-card--selected .field-actions {
  opacity: 1;
}

.empty-field-drop {
  display: grid;
  grid-column: 1 / -1;
  min-height: 180px;
  place-content: center;
  gap: 7px;
  border: 1px dashed var(--color-border-strong);
  border-radius: 10px;
  color: var(--color-text-muted);
  text-align: center;
}

.empty-field-drop > span {
  font-size: 1.5rem;
}

.empty-field-drop strong {
  color: var(--color-text);
  font-size: 0.84rem;
}

.empty-field-drop small {
  font-size: 0.72rem;
}

.field-add-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: end;
  gap: 8px;
  border-top: 1px solid var(--color-border);
  padding-top: 12px;
}

.field-add-panel .secondary-button {
  min-height: 50px;
}

.ghost-button {
  min-height: 50px;
  border-radius: 9px;
  padding: 10px 12px;
  color: var(--color-primary);
  font-size: 0.78rem;
  font-weight: 850;
}

.builder-properties {
  position: sticky;
  top: 150px;
}

.property-type-icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 9px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-family: Georgia, serif;
  font-weight: 900;
}

.property-textarea {
  min-height: 82px;
  resize: vertical;
}

.automatic-field-note {
  border: 1px solid #bfd2c6;
  border-radius: 9px;
  padding: 10px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 0.76rem;
  font-weight: 750;
  line-height: 1.4;
}

.list-options-editor {
  display: grid;
  gap: 9px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 10px;
  background: var(--color-surface-muted);
}

.list-options-editor__heading {
  display: block;
}

.list-options-editor__heading strong {
  color: var(--color-text);
  font-size: 0.8rem;
}

.list-option-rows,
.list-option-add {
  display: grid;
  gap: 7px;
}

.list-option-row {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  border-top: 1px solid var(--color-border);
  padding-top: 6px;
}

.list-option-row__number {
  display: grid;
  width: 22px;
  height: 32px;
  place-items: center;
  color: var(--color-text-muted);
  font-size: 0.68rem;
  font-weight: 850;
}

.list-option-row__fields {
  display: grid;
  gap: 5px;
}

.list-option-row__actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.list-option-row__fields .field-control {
  min-height: 32px;
  padding: 6px 8px;
  font-size: 0.72rem;
}

.list-option-row__actions button {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-weight: 900;
}

.list-option-row__actions button:disabled {
  opacity: 0.35;
}

.list-option-row__actions .list-option-row__remove {
  color: var(--color-danger);
}

.list-option-add {
  border-top: 1px solid var(--color-border);
  padding-top: 9px;
}

.list-option-add .field-control {
  min-height: 36px;
  padding: 7px 9px;
  font-size: 0.74rem;
}

.list-option-add .secondary-button {
  width: 100%;
}

.property-choice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--color-text);
  font-size: 0.82rem;
  font-weight: 800;
}

.property-choice > div {
  display: flex;
  gap: 4px;
}

.property-choice button {
  min-width: 44px;
  min-height: 34px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-weight: 850;
}

.property-choice .choice-button--active {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-block: 1px solid var(--color-border);
  padding: 12px 0;
}

.toggle-row > span {
  display: grid;
}

.toggle-row strong {
  color: var(--color-text);
  font-size: 0.8rem;
}

.toggle-row small {
  margin-top: 2px;
  color: var(--color-text-muted);
  font-size: 0.66rem;
}

.toggle-row input {
  width: 38px;
  height: 20px;
  accent-color: var(--color-primary);
}

.field-preview {
  display: grid;
  gap: 6px;
  border-radius: 9px;
  padding: 11px;
  background: var(--color-surface-muted);
}

.field-preview > span {
  margin-bottom: 3px;
  color: var(--color-text-muted);
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.field-preview label {
  color: var(--color-text);
  font-size: 0.75rem;
  font-weight: 800;
}

.field-preview input,
.field-preview textarea,
.field-preview select,
.photo-placeholder {
  width: 100%;
  min-height: 42px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 9px 10px;
  background: var(--color-surface);
  color: var(--color-text-muted);
}

.field-preview textarea {
  min-height: 70px;
}

.photo-placeholder {
  display: grid;
  place-items: center;
  border-style: dashed;
  font-size: 0.72rem;
  font-weight: 800;
}

.field-preview small {
  color: var(--color-text-muted);
  font-size: 0.66rem;
}

.remove-field-button {
  min-height: 40px;
  border: 1px solid #efb7b1;
  border-radius: 9px;
  background: var(--color-danger-soft);
  color: var(--color-danger);
  font-size: 0.76rem;
  font-weight: 850;
}

.property-empty {
  display: grid;
  min-height: 250px;
  place-content: center;
  gap: 8px;
  color: var(--color-text-muted);
  text-align: center;
}

.property-empty > span {
  font-size: 1.5rem;
}

.property-empty strong {
  color: var(--color-text);
  font-size: 0.9rem;
}

.property-empty p {
  font-size: 0.74rem;
}

@media (max-width: 1220px) {
  .builder-layout {
    grid-template-columns: 210px minmax(420px, 1fr);
  }

  .builder-properties {
    position: static;
    grid-column: 2;
  }

  .template-catalog {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .reference-layout,
  .builder-layout,
  .builder-meta {
    grid-template-columns: 1fr;
  }

  .builder-properties {
    grid-column: auto;
  }

  .builder-structure {
    order: 1;
  }

  .builder-canvas {
    order: 2;
  }

  .builder-properties {
    order: 3;
  }

  .section-navigation {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .builder-toolbar {
    top: 120px;
    flex-wrap: wrap;
  }

  .option-form {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 620px) {
  .template-catalog,
  .field-builder-list,
  .section-navigation,
  .field-add-panel {
    grid-template-columns: 1fr;
  }

  .field-builder-card--full {
    grid-column: auto;
  }

  .template-heading .primary-button {
    width: 100%;
  }

  .builder-toolbar__title {
    order: 3;
    width: 100%;
  }

  .builder-toolbar__actions {
    margin-left: auto;
  }

  .builder-meta dl {
    width: 100%;
  }

  .builder-meta dl div {
    flex: 1;
  }

  .canvas-section-heading {
    display: grid;
  }

  .field-actions {
    opacity: 1;
  }
}
</style>
