<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'

import {
  DOCUMENT_TEMPLATE_FIELD_CATALOG,
  type DocumentTemplateFieldCatalogItem,
} from '@/shared/constants/document-template'
import {
  createDefaultRenderSpec,
  createInputSchema,
  getTemplateInputSections,
  getTemplateRenderSpec,
  syncRenderSpec,
} from '@/shared/templates/document-template-schema'
import { useDocumentTemplateStore } from '@/stores/document-template.store'
import type {
  DocumentTemplate,
  DocumentTemplateField,
  DocumentTemplateFieldOption,
  DocumentTemplateTableColumn,
  DocumentTemplateFieldType,
  DocumentRenderFieldSpec,
  DocumentRenderSectionSpec,
  DocumentTemplateSection,
} from '@/types/report'

type TemplateEditorMode = 'input' | 'render'

const documentTemplateStore = useDocumentTemplateStore()

const editorMode = ref<TemplateEditorMode>('input')
const editorTemplate = ref<DocumentTemplate | null>(null)
const selectedSectionId = ref<string | null>(null)
const selectedFieldId = ref<string | null>(null)
const expandedRenderSectionId = ref<string | null>(null)
const fieldCatalogSelection = ref('')
const editorNotice = ref('')
const catalogNotice = ref('')

const listOptionForm = reactive({
  label: '',
})
const tableOptionLabels = reactive<Record<string, string>>({})

const selectedSection = computed(() =>
  editorTemplate.value?.sections.find((section) => section.id === selectedSectionId.value),
)
const selectedTemplateField = computed(() =>
  selectedSection.value?.fields.find((field) => field.id === selectedFieldId.value),
)
const calculationSourceFields = computed(() => {
  const selectedField = selectedTemplateField.value

  if (!selectedField || !editorTemplate.value) {
    return []
  }

  return editorTemplate.value.sections.flatMap((section) =>
    section.fields.filter(
      (field) =>
        field.dataPath !== selectedField.dataPath &&
        (field.type === 'number' || field.type === 'measurement'),
    ),
  )
})
const unusedCalculationSourceFields = computed(() => {
  const sourcePaths = selectedTemplateField.value?.calculation?.sourcePaths ?? []

  return calculationSourceFields.value.filter((field) => !sourcePaths.includes(field.dataPath))
})
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
    editorTemplate.value?.sections.reduce((total, section) => total + section.fields.length, 0) ??
    0,
)

const fieldTypeOptions: Array<{ value: DocumentTemplateFieldType; label: string }> = [
  { value: 'text', label: 'Текст' },
  { value: 'number', label: 'Число' },
  { value: 'date', label: 'Дата' },
  { value: 'time', label: 'Время' },
  { value: 'select', label: 'Список' },
  { value: 'radio', label: 'Один вариант' },
  { value: 'checkbox', label: 'Флажок' },
  { value: 'textarea', label: 'Большой текст' },
  { value: 'measurement', label: 'Измерение' },
  { value: 'passFail', label: 'Соответствует / не соответствует' },
  { value: 'table', label: 'Таблица проверок' },
  { value: 'calculated', label: 'Вычисляемое значение' },
  { value: 'photo', label: 'Фото' },
  { value: 'signature', label: 'Подпись' },
]

onMounted(() => {
  void documentTemplateStore.loadTemplates()
})

watch(editorMode, (mode) => {
  if (mode !== 'render' || !editorTemplate.value) {
    return
  }

  editorTemplate.value.renderSpec = syncRenderSpec(
    editorTemplate.value.renderSpec,
    editorTemplate.value.sections,
    editorTemplate.value.name,
  )
  if (
    !editorTemplate.value.renderSpec.sections.some(
      (section) => section.id === expandedRenderSectionId.value,
    )
  ) {
    expandedRenderSectionId.value = null
  }
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
  const editableTemplate = structuredClone(template)
  const sections = getTemplateInputSections(editableTemplate)
  editableTemplate.inputSchema = createInputSchema(sections)
  editableTemplate.sections = editableTemplate.inputSchema.steps
  editableTemplate.renderSpec = getTemplateRenderSpec(editableTemplate)
  editorTemplate.value = editableTemplate
  editorTemplate.value.sections.forEach((section) => {
    section.fields.forEach((field) => {
      field.options ??= []
    })
  })
  selectedSectionId.value = editorTemplate.value.sections[0]?.id ?? null
  selectedFieldId.value = null
  expandedRenderSectionId.value = null
  fieldCatalogSelection.value = ''
  editorMode.value = 'input'
}

function closeEditor(): void {
  editorTemplate.value = null
  selectedSectionId.value = null
  selectedFieldId.value = null
  expandedRenderSectionId.value = null
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
    inputSchema: createInputSchema(editorTemplate.value.sections),
    renderSpec: syncRenderSpec(
      editorTemplate.value.renderSpec,
      editorTemplate.value.sections,
      editorTemplate.value.name,
    ),
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
    `Удалить макет «${template.name}»?\n\nОн исчезнет из списка и больше не будет доступен инспекторам для новых отчетов. Уже созданные отчеты сохранят использованную структуру. Это действие нельзя отменить.`,
  )

  if (!shouldDelete) {
    return
  }

  const deleted = await documentTemplateStore.deleteTemplate(template.id)

  if (deleted) {
    if (editorTemplate.value?.id === template.id) {
      closeEditor()
    }

    catalogNotice.value = `Макет «${template.name}» удален.`
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
    !section.fields.length || window.confirm(`Удалить раздел «${section.title}» и все его поля?`)

  if (!shouldDelete) {
    return
  }

  const sectionIndex = editorTemplate.value.sections.findIndex((item) => item.id === section.id)

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

    if (field.type === 'calculated') {
      ensureCalculation(field)
    }
  }

  listOptionForm.label = ''
}

function handleFieldTypeChange(field: DocumentTemplateField): void {
  if (field.type === 'calculated') {
    ensureCalculation(field)
    return
  }

  field.calculation = undefined
}

function ensureCalculation(field: DocumentTemplateField): void {
  if (field.calculation) {
    return
  }

  const firstSource = editorTemplate.value?.sections
    .flatMap((section) => section.fields)
    .find(
      (candidate) =>
        candidate.dataPath !== field.dataPath &&
        (candidate.type === 'number' || candidate.type === 'measurement'),
    )

  field.calculation = {
    operator: 'sum',
    sourcePaths: firstSource ? [firstSource.dataPath] : [],
    precision: 2,
  }
}

function addCalculationSource(field: DocumentTemplateField, dataPath: string): void {
  if (!dataPath) {
    return
  }

  ensureCalculation(field)

  if (!field.calculation!.sourcePaths.includes(dataPath)) {
    field.calculation!.sourcePaths.push(dataPath)
  }
}

function removeCalculationSource(field: DocumentTemplateField, dataPath: string): void {
  if (!field.calculation) {
    return
  }

  field.calculation.sourcePaths = field.calculation.sourcePaths.filter((path) => path !== dataPath)
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

function getRenderInputSection(
  renderSection: DocumentRenderSectionSpec,
): DocumentTemplateSection | undefined {
  return editorTemplate.value?.sections.find(
    (section) => section.id === renderSection.inputSectionId,
  )
}

function getRenderInputField(
  renderSection: DocumentRenderSectionSpec,
  renderField: DocumentRenderFieldSpec,
): DocumentTemplateField | undefined {
  return getRenderInputSection(renderSection)?.fields.find(
    (field) => field.dataPath === renderField.dataPath,
  )
}

function moveRenderSection(renderSectionId: string, direction: -1 | 1): void {
  const renderSections = editorTemplate.value?.renderSpec.sections

  if (!renderSections) {
    return
  }

  const sectionIndex = renderSections.findIndex((section) => section.id === renderSectionId)
  const targetIndex = sectionIndex + direction

  if (sectionIndex < 0 || targetIndex < 0 || targetIndex >= renderSections.length) {
    return
  }

  const [section] = renderSections.splice(sectionIndex, 1)

  if (section) {
    renderSections.splice(targetIndex, 0, section)
  }
}

function moveRenderField(
  renderSection: DocumentRenderSectionSpec,
  dataPath: string,
  direction: -1 | 1,
): void {
  const fieldIndex = renderSection.fields.findIndex((field) => field.dataPath === dataPath)
  const targetIndex = fieldIndex + direction

  if (fieldIndex < 0 || targetIndex < 0 || targetIndex >= renderSection.fields.length) {
    return
  }

  const [field] = renderSection.fields.splice(fieldIndex, 1)

  if (field) {
    renderSection.fields.splice(targetIndex, 0, field)
  }
}

function toggleRenderSection(renderSectionId: string): void {
  expandedRenderSectionId.value =
    expandedRenderSectionId.value === renderSectionId ? null : renderSectionId
}

function getVisibleRenderFieldCount(renderSection: DocumentRenderSectionSpec): number {
  return renderSection.fields.filter((field) => !field.hidden).length
}

function resetRenderSpec(): void {
  const template = editorTemplate.value

  if (
    !template ||
    !window.confirm('Сбросить порядок и настройки печатных полей по структуре мобильной формы?')
  ) {
    return
  }

  template.renderSpec = createDefaultRenderSpec(
    template.sections,
    template.renderSpec.documentTitle || template.name,
  )
}

function addListOption(): void {
  const field = selectedTemplateField.value
  const label = listOptionForm.label.trim()

  if (!field || !['select', 'radio', 'passFail'].includes(field.type) || !label) {
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

function addTableColumn(): void {
  const field = selectedTemplateField.value

  if (!field || field.type !== 'table') {
    return
  }

  field.tableColumns ??= []
  field.tableColumns.push({
    id: createLocalId('table-column'),
    label: `Колонка ${field.tableColumns.length + 1}`,
    type: 'text',
  })
}

function addTableColumnOption(column: DocumentTemplateTableColumn): void {
  const label = tableOptionLabels[column.id]?.trim()

  if (!label) {
    return
  }

  column.options ??= []
  column.options.push({
    id: createLocalId('table-column-option'),
    label,
    sortOrder: column.options.length + 1,
  })
  tableOptionLabels[column.id] = ''
}

function removeTableColumnOption(column: DocumentTemplateTableColumn, optionId: string): void {
  column.options = (column.options ?? []).filter((option) => option.id !== optionId)
  column.options.forEach((option, index) => {
    option.sortOrder = index + 1
  })
}

function removeTableColumn(columnId: string): void {
  const field = selectedTemplateField.value

  if (field) {
    field.tableColumns = (field.tableColumns ?? []).filter((column) => column.id !== columnId)
  }
}

function addTableRow(): void {
  const field = selectedTemplateField.value

  if (!field || field.type !== 'table') {
    return
  }

  field.tableRows ??= []
  field.tableRows.push({
    id: createLocalId('table-row'),
    label: `Проверка ${field.tableRows.length + 1}`,
  })
}

function removeTableRow(rowId: string): void {
  const field = selectedTemplateField.value

  if (field) {
    field.tableRows = (field.tableRows ?? []).filter((row) => row.id !== rowId)
  }
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
    width: catalogField.type === 'textarea' || catalogField.type === 'photo' ? 'full' : 'half',
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
</script>

<template>
  <main class="screen-page template-page">
    <template v-if="!editorTemplate">
      <section class="screen-heading template-heading">
        <div>
          <h1 class="screen-title">Макеты отчетов</h1>
          <p class="screen-subtitle">
            Создавайте структуру отчета, поля и варианты для каждого макета.
          </p>
        </div>
        <button
          class="primary-button"
          type="button"
          :disabled="documentTemplateStore.isSaving"
          @click="createTemplate"
        >
          <span aria-hidden="true">＋</span>
          Новый макет
        </button>
      </section>

      <section class="template-catalog">
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
            <span class="status-badge" :class="`status-badge--${template.status}`">
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
                {{ template.sections.reduce((total, section) => total + section.fields.length, 0) }}
              </dd>
            </div>
          </dl>

          <div class="template-card__footer">
            <small>Обновлен {{ formatDate(template.updatedAt) }}</small>
            <div>
              <button class="secondary-button" type="button" @click="editTemplate(template)">
                {{ template.status === 'draft' ? 'Продолжить' : 'Редактировать' }}
              </button>
              <button
                class="text-danger-button"
                type="button"
                aria-label="Удалить макет"
                title="Удалить"
                @click="deleteTemplate(template)"
              >
                Удалить
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
    </template>

    <template v-else>
      <section class="builder-toolbar">
        <button class="back-button" type="button" @click="closeEditor">
          <span aria-hidden="true">←</span>
          К макетам
        </button>
        <div class="builder-toolbar__title">
          <span class="status-badge" :class="`status-badge--${editorTemplate.status}`">
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

      <nav class="schema-tabs" aria-label="Части макета">
        <button
          type="button"
          :class="{ 'schema-tabs__button--active': editorMode === 'input' }"
          @click="editorMode = 'input'"
        >
          <strong>Форма инспектора</strong>
          <small>inputSchema · шаги и поля для телефона</small>
        </button>
        <button
          type="button"
          :class="{ 'schema-tabs__button--active': editorMode === 'render' }"
          @click="editorMode = 'render'"
        >
          <strong>Печатный PDF</strong>
          <small>renderSpec · страницы и размещение</small>
        </button>
      </nav>

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

      <section v-if="editorMode === 'input'" class="builder-layout">
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
                <button type="button" title="Удалить поле" @click.stop="removeField(field.id)">
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
                <optgroup v-for="(fields, group) in catalogGroups" :key="group" :label="group">
                  <option v-for="field in fields" :key="field.dataPath" :value="field.dataPath">
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
            <button class="ghost-button" type="button" @click="addCustomField">＋ Свое поле</button>
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
              <select
                v-model="selectedTemplateField.type"
                class="field-control"
                @change="handleFieldTypeChange(selectedTemplateField)"
              >
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
              v-if="['select', 'radio', 'passFail'].includes(selectedTemplateField.type)"
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

            <section v-if="selectedTemplateField.type === 'table'" class="table-schema-editor">
              <div class="list-options-editor__heading">
                <strong>Колонки таблицы</strong>
                <button class="text-button" type="button" @click="addTableColumn">+ Колонка</button>
              </div>
              <div
                v-for="column in selectedTemplateField.tableColumns ?? []"
                :key="column.id"
                class="table-schema-row"
              >
                <input v-model="column.label" class="field-control" aria-label="Название колонки" />
                <select v-model="column.type" class="field-control" aria-label="Тип колонки">
                  <option value="text">Текст</option>
                  <option value="number">Число</option>
                  <option value="select">Список</option>
                  <option value="checkbox">Флажок</option>
                </select>
                <button
                  type="button"
                  aria-label="Удалить колонку"
                  @click="removeTableColumn(column.id)"
                >
                  ×
                </button>
                <div v-if="column.type === 'select'" class="table-column-options">
                  <strong>Варианты списка</strong>
                  <div
                    v-for="option in column.options ?? []"
                    :key="option.id"
                    class="table-column-option"
                  >
                    <input
                      v-model="option.label"
                      class="field-control"
                      aria-label="Вариант колонки"
                    />
                    <button
                      type="button"
                      aria-label="Удалить вариант колонки"
                      @click="removeTableColumnOption(column, option.id)"
                    >
                      ×
                    </button>
                  </div>
                  <div class="table-column-option table-column-option--add">
                    <input
                      v-model="tableOptionLabels[column.id]"
                      class="field-control"
                      aria-label="Новый вариант колонки"
                      placeholder="Название варианта"
                      @keydown.enter.prevent="addTableColumnOption(column)"
                    />
                    <button type="button" @click="addTableColumnOption(column)">+</button>
                  </div>
                </div>
              </div>

              <div class="list-options-editor__heading table-schema-editor__rows">
                <strong>Строки проверки</strong>
                <button class="text-button" type="button" @click="addTableRow">+ Строка</button>
              </div>
              <div
                v-for="row in selectedTemplateField.tableRows ?? []"
                :key="row.id"
                class="table-schema-row table-schema-row--single"
              >
                <input v-model="row.label" class="field-control" aria-label="Название строки" />
                <button type="button" aria-label="Удалить строку" @click="removeTableRow(row.id)">
                  ×
                </button>
              </div>
            </section>

            <div v-if="selectedTemplateField.type === 'measurement'" class="measurement-properties">
              <label class="field-label">
                Единица измерения
                <input
                  v-model="selectedTemplateField.unit"
                  class="field-control"
                  placeholder="°C, %, кг"
                />
              </label>
              <label class="field-label">
                Норма
                <input
                  v-model="selectedTemplateField.standardValue"
                  class="field-control"
                  placeholder="Например, +6°C"
                />
              </label>
            </div>

            <section v-if="selectedTemplateField.type === 'calculated'" class="calculation-editor">
              <div class="list-options-editor__heading">
                <strong>Формула</strong>
              </div>
              <label class="field-label">
                Операция
                <select v-model="selectedTemplateField.calculation!.operator" class="field-control">
                  <option value="sum">Сумма</option>
                  <option value="difference">Разность</option>
                  <option value="average">Среднее</option>
                </select>
              </label>
              <label class="field-label">
                Знаков после запятой
                <input
                  v-model.number="selectedTemplateField.calculation!.precision"
                  class="field-control"
                  type="number"
                  min="0"
                  max="10"
                />
              </label>
              <div class="calculation-sources">
                <strong>Поля-источники</strong>
                <small v-if="!selectedTemplateField.calculation!.sourcePaths.length">
                  Добавьте хотя бы одно числовое поле — без него значение не рассчитывается.
                </small>
                <div
                  v-for="sourcePath in selectedTemplateField.calculation!.sourcePaths"
                  :key="sourcePath"
                  class="table-column-option"
                >
                  <span>{{
                    calculationSourceFields.find((field) => field.dataPath === sourcePath)?.label ??
                    sourcePath
                  }}</span>
                  <button
                    type="button"
                    aria-label="Удалить поле-источник"
                    @click="removeCalculationSource(selectedTemplateField, sourcePath)"
                  >
                    ×
                  </button>
                </div>
                <select
                  class="field-control"
                  aria-label="Добавить поле-источник"
                  @change="
                    addCalculationSource(
                      selectedTemplateField,
                      ($event.target as HTMLSelectElement).value,
                    )
                  "
                >
                  <option value="">Добавить числовое поле</option>
                  <option
                    v-for="sourceField in unusedCalculationSourceFields"
                    :key="sourceField.dataPath"
                    :value="sourceField.dataPath"
                  >
                    {{ sourceField.label }}
                  </option>
                </select>
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
                :type="
                  selectedTemplateField.type === 'number'
                    ? 'number'
                    : selectedTemplateField.type === 'date'
                      ? 'date'
                      : 'text'
                "
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

      <section v-else class="render-spec-editor app-card">
        <div class="render-spec-editor__heading">
          <div>
            <p class="screen-kicker">Печатный макет</p>
            <h2>Размещение данных в PDF</h2>
            <p>Стиль фиксирован; здесь задаются разделы, поля, таблицы и порядок печати.</p>
          </div>
          <button class="secondary-button" type="button" @click="resetRenderSpec">
            Сбросить размещение
          </button>
        </div>

        <div class="render-document-settings">
          <label class="field-label render-title-field">
            Заголовок документа
            <input v-model="editorTemplate.renderSpec.documentTitle" class="field-control" />
          </label>
          <div class="field-label render-title-field render-style-summary">
            Стиль выходного PDF
            <strong>Единый фирменный шаблон</strong>
            <small>Оформление фиксировано; состав и подписи полей задаются ниже.</small>
          </div>
        </div>

        <div class="render-section-list">
          <article
            v-for="(renderSection, index) in editorTemplate.renderSpec.sections"
            :key="renderSection.id"
            class="render-section-card"
            :class="{
              'render-section-card--hidden': renderSection.hidden,
              'render-section-card--expanded': expandedRenderSectionId === renderSection.id,
            }"
          >
            <header class="render-section-card__header">
              <span class="render-section-card__number">{{ index + 1 }}</span>
              <label class="field-label render-section-title">
                Заголовок печатного раздела
                <input v-model="renderSection.title" class="field-control" />
              </label>
              <span class="render-section-summary">
                {{ getVisibleRenderFieldCount(renderSection) }} / {{ renderSection.fields.length }}
                полей
              </span>
              <div class="render-section-actions">
                <div class="render-order-actions">
                  <button
                    type="button"
                    :disabled="index === 0"
                    aria-label="Поднять печатный раздел"
                    @click="moveRenderSection(renderSection.id, -1)"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    :disabled="index === editorTemplate.renderSpec.sections.length - 1"
                    aria-label="Опустить печатный раздел"
                    @click="moveRenderSection(renderSection.id, 1)"
                  >
                    ↓
                  </button>
                </div>
                <button
                  class="render-section-toggle"
                  type="button"
                  :aria-expanded="expandedRenderSectionId === renderSection.id"
                  @click="toggleRenderSection(renderSection.id)"
                >
                  {{ expandedRenderSectionId === renderSection.id ? 'Свернуть' : 'Настроить' }}
                </button>
              </div>
            </header>

            <div
              v-if="expandedRenderSectionId === renderSection.id"
              class="render-section-card__body"
            >
              <div class="render-section-settings">
                <label class="compact-choice">
                  Колонки
                  <select v-model.number="renderSection.columns" class="field-control">
                    <option :value="1">1</option>
                    <option :value="2">2</option>
                  </select>
                </label>
                <label class="toggle-row compact-toggle">
                  <span>С новой страницы</span>
                  <input v-model="renderSection.pageBreakBefore" type="checkbox" />
                </label>
                <label class="toggle-row compact-toggle">
                  <span>Описание раздела</span>
                  <input v-model="renderSection.showDescription" type="checkbox" />
                </label>
                <label class="toggle-row compact-toggle">
                  <span>Не печатать раздел</span>
                  <input v-model="renderSection.hidden" type="checkbox" />
                </label>
              </div>

              <div class="render-field-list">
                <div class="render-field-list__heading">
                  <strong>Поля в PDF</strong>
                  <small>Меняйте порядок, подпись, ширину и способ отображения.</small>
                </div>
                <div
                  v-for="(renderField, fieldIndex) in renderSection.fields"
                  :key="renderField.dataPath"
                  class="render-field-row"
                  :class="{ 'render-field-row--hidden': renderField.hidden }"
                >
                  <div class="render-field-order">
                    <button
                      type="button"
                      :disabled="fieldIndex === 0"
                      aria-label="Поднять поле"
                      @click="moveRenderField(renderSection, renderField.dataPath, -1)"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      :disabled="fieldIndex === renderSection.fields.length - 1"
                      aria-label="Опустить поле"
                      @click="moveRenderField(renderSection, renderField.dataPath, 1)"
                    >
                      ↓
                    </button>
                  </div>
                  <label class="field-label render-field-label">
                    Подпись в PDF
                    <input
                      v-model="renderField.label"
                      class="field-control"
                      :placeholder="getRenderInputField(renderSection, renderField)?.label"
                    />
                    <small>
                      {{
                        getFieldTypeLabel(
                          getRenderInputField(renderSection, renderField)?.type ?? 'text',
                        )
                      }}
                      · {{ renderField.dataPath }}
                    </small>
                  </label>
                  <label class="field-label render-field-compact">
                    Ширина
                    <select v-model="renderField.width" class="field-control">
                      <option value="half">½ строки</option>
                      <option value="full">Вся строка</option>
                    </select>
                  </label>
                  <label class="field-label render-field-compact">
                    Вид значения
                    <select v-model="renderField.display" class="field-control">
                      <option value="value">Текст</option>
                      <option value="checkmark">Отметка</option>
                      <option value="table">Таблица</option>
                    </select>
                  </label>
                  <div class="render-field-toggles">
                    <label class="toggle-row compact-toggle">
                      <span>Скрывать пустое</span>
                      <input v-model="renderField.hideWhenEmpty" type="checkbox" />
                    </label>
                    <label class="toggle-row compact-toggle">
                      <span>Не печатать</span>
                      <input v-model="renderField.hidden" type="checkbox" />
                    </label>
                  </div>
                </div>

                <p v-if="!renderSection.fields.length" class="render-field-empty">
                  В этом разделе пока нет полей мобильной формы.
                </p>
              </div>
            </div>
          </article>
        </div>

        <p class="render-spec-note">
          Изменения здесь влияют только на итоговый A4 PDF. Форма инспектора и сохранённые значения
          при перестановке или скрытии печатных полей не меняются.
        </p>
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
  min-height: 38px;
  border-radius: 8px;
  padding: 7px 10px;
  color: var(--color-danger);
  font-size: 0.78rem;
  font-weight: 850;
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

.schema-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.schema-tabs button {
  display: grid;
  gap: 0.2rem;
  padding: 1rem 1.1rem;
  text-align: left;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 1rem;
}

.schema-tabs button small {
  color: var(--color-text-muted);
}

.schema-tabs .schema-tabs__button--active {
  color: #fff;
  background: #175b2a;
  border-color: #175b2a;
}

.schema-tabs .schema-tabs__button--active small {
  color: #d9f4df;
}

.table-schema-editor,
.measurement-properties,
.calculation-editor,
.calculation-sources,
.table-column-options {
  display: grid;
  gap: 0.75rem;
}

.table-schema-editor__rows {
  margin-top: 0.75rem;
}

.table-schema-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 8rem auto;
  gap: 0.5rem;
  align-items: center;
}

.table-schema-row--single {
  grid-template-columns: minmax(0, 1fr) auto;
}

.table-column-options {
  grid-column: 1 / -1;
  padding: 0.75rem;
  background: var(--color-surface-muted);
  border-radius: 0.65rem;
}

.table-column-option {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.5rem;
  align-items: center;
}

.table-column-option--add button {
  color: #fff;
  background: var(--color-primary);
}

.table-schema-row button {
  width: 2.4rem;
  height: 2.4rem;
  border: 0;
  border-radius: 0.65rem;
}

.render-spec-editor {
  display: grid;
  gap: 1.25rem;
  padding: clamp(1rem, 2vw, 1.5rem);
}

.render-spec-editor__heading {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2rem;
  align-items: center;
}

.render-spec-editor__heading h2,
.render-spec-editor__heading p {
  margin: 0;
}

.render-section-list {
  display: grid;
  gap: 0.75rem;
}

.render-document-settings {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.render-style-summary {
  border: 1px solid #d9e9dc;
  border-radius: 0.75rem;
  padding: 0.8rem 0.9rem;
  color: #17391f;
  background: #f5faf6;
  line-height: 1.45;
}

.render-style-summary strong,
.render-style-summary small {
  display: block;
}

.render-style-summary small {
  color: #617267;
  font-size: 0.75rem;
}

.render-section-card {
  display: grid;
  gap: 0.75rem;
  padding: 0.85rem;
  background: #f5faf6;
  border: 1px solid #d9e9dc;
  border-radius: 0.9rem;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}

.render-section-card--expanded {
  border-color: #91b69a;
  box-shadow: 0 10px 26px rgba(21, 95, 36, 0.08);
}

.render-section-card--hidden,
.render-field-row--hidden {
  opacity: 0.58;
}

.render-section-card__header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  gap: 0.8rem;
  align-items: center;
}

.render-section-card__body {
  display: grid;
  gap: 0.8rem;
  border-top: 1px solid #d9e9dc;
  padding-top: 0.8rem;
}

.render-section-card small,
.render-spec-note {
  color: var(--color-text-muted);
}

.render-spec-note {
  margin: 0;
  padding: 0.15rem 0.1rem 0.1rem;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.render-section-card__number {
  display: grid;
  width: 2rem;
  height: 2rem;
  place-items: center;
  color: #fff;
  background: #175b2a;
  border-radius: 999px;
}

.render-section-title {
  gap: 0.3rem;
}

.render-section-summary {
  border-radius: 999px;
  padding: 0.4rem 0.65rem;
  color: var(--color-primary);
  background: #e4efe6;
  font-size: 0.72rem;
  font-weight: 850;
  white-space: nowrap;
}

.render-section-actions {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.render-section-toggle {
  min-width: 6.2rem;
  min-height: 2rem;
  border: 1px solid #9cbaa3;
  border-radius: 0.55rem;
  padding: 0.35rem 0.7rem;
  color: var(--color-primary);
  background: #fff;
  font-size: 0.72rem;
  font-weight: 850;
}

.render-section-card--expanded .render-section-toggle {
  color: #fff;
  background: var(--color-primary);
}

.render-order-actions,
.render-field-order {
  display: flex;
  gap: 0.35rem;
}

.render-order-actions button,
.render-field-order button {
  display: grid;
  width: 2rem;
  height: 2rem;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: 0.55rem;
  color: var(--color-primary);
  background: #fff;
  font-weight: 900;
}

.render-order-actions button:disabled,
.render-field-order button:disabled {
  opacity: 0.35;
}

.render-section-settings {
  display: grid;
  grid-template-columns: 8rem repeat(3, minmax(0, 1fr));
  gap: 0.7rem;
  align-items: center;
  border: 1px solid #dce8de;
  border-radius: 0.75rem;
  padding: 0.65rem 0.75rem;
  background: #fff;
}

.render-field-list {
  display: grid;
  gap: 0.55rem;
}

.render-field-list__heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}

.render-field-row {
  display: grid;
  grid-template-columns: auto minmax(14rem, 1fr) 8.5rem 9rem minmax(10rem, 0.65fr);
  gap: 0.65rem;
  align-items: center;
  border: 1px solid #dce8de;
  border-radius: 0.75rem;
  padding: 0.7rem;
  background: #fff;
}

.render-field-order {
  flex-direction: column;
}

.render-field-order button {
  width: 1.65rem;
  height: 1.45rem;
  font-size: 0.7rem;
}

.render-field-label,
.render-field-compact {
  gap: 0.25rem;
}

.render-field-label small {
  overflow: hidden;
  font-size: 0.66rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.render-field-toggles {
  display: grid;
  gap: 0.35rem;
}

.render-field-toggles .toggle-row,
.render-section-settings .toggle-row {
  min-height: 2.45rem;
  border: 0;
  border-radius: 0.55rem;
  padding: 0.45rem 0.55rem;
  background: #f5f8f5;
}

.render-field-empty {
  margin: 0;
  border: 1px dashed var(--color-border-strong);
  border-radius: 0.75rem;
  padding: 1.2rem;
  color: var(--color-text-muted);
  text-align: center;
}

.compact-choice,
.compact-toggle {
  font-size: 0.8rem;
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

  .render-field-row {
    grid-template-columns: auto minmax(14rem, 1fr) repeat(2, 8.5rem);
  }

  .render-field-toggles {
    grid-column: 2 / -1;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .builder-layout,
  .builder-meta,
  .render-spec-editor__heading,
  .render-document-settings {
    grid-template-columns: 1fr;
  }

  .render-section-settings {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .render-section-card__header {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
  }

  .render-section-summary,
  .render-section-actions {
    grid-column: 2;
  }

  .render-section-actions {
    justify-content: space-between;
  }

  .render-field-row {
    grid-template-columns: auto minmax(0, 1fr) minmax(8rem, 0.5fr);
  }

  .render-field-compact:last-of-type,
  .render-field-toggles {
    grid-column: 2 / -1;
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
  .schema-tabs,
  .field-builder-list,
  .section-navigation,
  .field-add-panel,
  .render-section-settings,
  .render-field-row {
    grid-template-columns: 1fr;
  }

  .render-field-order {
    flex-direction: row;
  }

  .render-field-compact:last-of-type,
  .render-field-toggles {
    grid-column: auto;
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
