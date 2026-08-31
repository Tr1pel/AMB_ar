import { apiDelete, apiGet, apiPut } from '@/shared/api/server-api'
import {
  synchronizeDocumentTemplateCache,
  offlineDatabase,
} from '@/shared/offline/offline-database'
import { createEntityId, createSyncMetadata } from '@/shared/sync/sync-metadata'
import {
  createDefaultRenderSpec,
  createInputSchema,
  getTemplateInputSections,
  syncRenderSpec,
} from '@/shared/templates/document-template-schema'
import { cloneDocumentTemplateField } from '@/shared/templates/document-template-field-clone'
import {
  synchronizeLegacyFieldText,
  synchronizeLegacySectionText,
  synchronizeLegacyTemplateText,
} from '@/shared/templates/document-template-localization'
import type {
  DocumentInputSchema,
  DocumentRenderSpec,
  DocumentTemplate,
  DocumentTemplateSection,
  DocumentTemplateTranslations,
} from '@/types/report'

export interface SaveDocumentTemplateInput {
  id: string
  name: string
  description: string
  translations?: DocumentTemplateTranslations
  inputSchema: DocumentInputSchema
  renderSpec: DocumentRenderSpec
}

export class DocumentTemplateRepository {
  async listCached(): Promise<DocumentTemplate[]> {
    return offlineDatabase.documentTemplates
      .filter((template) => template._deletedAt === undefined)
      .sortBy('updatedAt')
  }

  async synchronize(): Promise<DocumentTemplate[]> {
    if (!navigator.onLine) {
      return this.listCached()
    }

    const templates = await apiGet<DocumentTemplate[]>('/api/document-templates')
    await synchronizeDocumentTemplateCache(templates)
    return this.listCached()
  }

  async list(): Promise<DocumentTemplate[]> {
    try {
      return await this.synchronize()
    } catch (error) {
      const cachedTemplates = await this.listCached()

      if (!cachedTemplates.length) {
        throw error
      }

      return cachedTemplates
    }
  }

  async getActive(): Promise<DocumentTemplate | null> {
    const templates = await this.list()
    return templates.find((template) => template.status === 'active') ?? null
  }

  async getById(templateId: string): Promise<DocumentTemplate | null> {
    const cached = await offlineDatabase.documentTemplates.get(templateId)

    if (cached && cached._deletedAt === undefined) {
      return cached
    }

    try {
      const template = await apiGet<DocumentTemplate>(
        `/api/document-templates/${encodeURIComponent(templateId)}`,
      )
      await offlineDatabase.documentTemplates.put(template)
      return template
    } catch (error) {
      if (isNotFound(error)) {
        return null
      }

      throw error
    }
  }

  async createEmpty(adminAccountId: string): Promise<DocumentTemplate> {
    const now = Date.now()
    const sections: DocumentTemplateSection[] = [
      {
        id: createEntityId('template-section'),
        title: 'Новый раздел',
        description: '',
        sortOrder: 1,
        fields: [],
      },
    ]
    const template: DocumentTemplate = {
      id: createEntityId('document-template'),
      name: 'Новый макет',
      description: '',
      translations: {
        ru: { name: 'Новый макет', description: '' },
        en: { name: 'New template', description: '' },
        fa: { name: 'قالب جدید', description: '' },
      },
      status: 'draft',
      inputSchema: createInputSchema(sections),
      renderSpec: createDefaultRenderSpec(sections, 'Новый макет'),
      sections,
      createdByAccountId: adminAccountId,
      createdAt: now,
      updatedAt: now,
      ...createSyncMetadata('synced'),
    }

    return apiPut<DocumentTemplate>(
      `/api/document-templates/${encodeURIComponent(template.id)}`,
      template,
      adminAccountId,
    )
  }

  async save(input: SaveDocumentTemplateInput, adminAccountId: string): Promise<DocumentTemplate> {
    const existingTemplate = await this.getById(input.id)
    const editableTemplate = {
      name: input.name,
      description: input.description,
      translations: input.translations ? cloneTemplateTranslations(input.translations) : undefined,
    }
    synchronizeLegacyTemplateText(editableTemplate)
    const name = editableTemplate.name.trim()

    if (!existingTemplate) {
      throw new Error('Макет не найден')
    }

    if (!name) {
      throw new Error('Введите название макета')
    }

    if (!input.inputSchema.steps.length) {
      throw new Error('Добавьте хотя бы один раздел')
    }

    const sections = normalizeSections(input.inputSchema.steps)
    const renderSpec = syncRenderSpec(input.renderSpec, sections, name)
    const savedTemplate = await apiPut<DocumentTemplate>(
      `/api/document-templates/${encodeURIComponent(input.id)}`,
      {
        ...existingTemplate,
        name,
        description: editableTemplate.description.trim(),
        translations: editableTemplate.translations,
        inputSchema: createInputSchema(sections),
        renderSpec,
        sections,
      },
      adminAccountId,
    )

    if (savedTemplate.renderSpec?.layout !== renderSpec.layout) {
      throw new Error(
        'Сервер не подтвердил сохранение стиля PDF. Перезапустите сервер приложения и повторите сохранение.',
      )
    }

    return savedTemplate
  }

  async duplicate(templateId: string, adminAccountId: string): Promise<DocumentTemplate> {
    const sourceTemplate = await this.getById(templateId)

    if (!sourceTemplate) {
      throw new Error('Макет не найден')
    }

    const now = Date.now()
    const sourceSections = getTemplateInputSections(sourceTemplate)
    const duplicateSections = regenerateNodeIds(sourceSections)
    const duplicateSectionIdBySourceId = new Map(
      sourceSections.map((section, index) => [section.id, duplicateSections[index]?.id]),
    )
    const remappedRenderSpec: DocumentRenderSpec = {
      ...structuredClone(sourceTemplate.renderSpec),
      documentTitle: `${sourceTemplate.name} — копия`,
      sections: sourceTemplate.renderSpec.sections.flatMap((section) => {
        const duplicateSectionId = duplicateSectionIdBySourceId.get(section.inputSectionId)

        return duplicateSectionId
          ? [
              {
                ...structuredClone(section),
                id: `render-${duplicateSectionId}`,
                inputSectionId: duplicateSectionId,
              },
            ]
          : []
      }),
    }
    const duplicate: DocumentTemplate = {
      ...structuredClone(sourceTemplate),
      id: createEntityId('document-template'),
      name: `${sourceTemplate.name} — копия`,
      status: 'draft',
      inputSchema: createInputSchema(duplicateSections),
      renderSpec: syncRenderSpec(
        remappedRenderSpec,
        duplicateSections,
        `${sourceTemplate.name} — копия`,
      ),
      sections: duplicateSections,
      createdByAccountId: adminAccountId,
      createdAt: now,
      updatedAt: now,
      publishedAt: undefined,
      _deletedAt: undefined,
      ...createSyncMetadata('synced'),
    }

    return apiPut<DocumentTemplate>(
      `/api/document-templates/${encodeURIComponent(duplicate.id)}`,
      duplicate,
      adminAccountId,
    )
  }

  async publish(templateId: string, adminAccountId: string): Promise<DocumentTemplate> {
    const template = await this.getById(templateId)

    if (!template) {
      throw new Error('Макет не найден')
    }

    if (!getTemplateInputSections(template).some((section) => section.fields.length > 0)) {
      throw new Error('Добавьте в макет хотя бы одно поле')
    }

    return apiPut<DocumentTemplate>(
      `/api/document-templates/${encodeURIComponent(templateId)}`,
      {
        ...template,
        status: 'active',
        publishedAt: Date.now(),
      },
      adminAccountId,
    )
  }

  async softDelete(templateId: string, adminAccountId: string): Promise<void> {
    await apiDelete(`/api/document-templates/${encodeURIComponent(templateId)}`, adminAccountId)
  }
}

function normalizeSections(sections: DocumentTemplateSection[]): DocumentTemplateSection[] {
  return sections.map((sourceSection, sectionIndex) => {
    const section = cloneDocumentTemplateSection(sourceSection)
    synchronizeLegacySectionText(section)

    return {
      ...section,
      title: section.title.trim() || `Раздел ${sectionIndex + 1}`,
      description: section.description.trim(),
      sortOrder: sectionIndex + 1,
      fields: section.fields.map((sourceField, fieldIndex) => {
        const field = synchronizeLegacyFieldText(cloneDocumentTemplateField(sourceField))
        const fallbackLabel = field.label.trim() || 'Поле без названия'

        return {
          ...field,
          label: fallbackLabel,
          placeholder: field.placeholder.trim(),
          helpText: field.helpText.trim(),
          translations: {
            ru: normalizeFieldTranslation(field.translations!.ru),
            en: normalizeFieldTranslation(field.translations!.en),
            fa: normalizeFieldTranslation(field.translations!.fa),
          },
          sortOrder: fieldIndex + 1,
          options: (field.options ?? []).map((option, optionIndex) => ({
            id: option.id,
            label: option.label.trim() || `Вариант ${optionIndex + 1}`,
            sortOrder: optionIndex + 1,
          })),
        }
      }),
    }
  })
}

function cloneDocumentTemplateSection(section: DocumentTemplateSection): DocumentTemplateSection {
  return {
    ...section,
    translations: section.translations
      ? {
          ru: { ...section.translations.ru },
          en: { ...section.translations.en },
          fa: { ...section.translations.fa },
        }
      : undefined,
  }
}

function cloneTemplateTranslations(
  translations: DocumentTemplateTranslations,
): DocumentTemplateTranslations {
  return {
    ru: { ...translations.ru },
    en: { ...translations.en },
    fa: { ...translations.fa },
  }
}

function normalizeFieldTranslation(translation: {
  label: string
  placeholder: string
  helpText: string
}) {
  return {
    label: translation.label.trim(),
    placeholder: translation.placeholder.trim(),
    helpText: translation.helpText.trim(),
  }
}

function regenerateNodeIds(sections: DocumentTemplateSection[]): DocumentTemplateSection[] {
  return sections.map((section) => ({
    ...structuredClone(section),
    id: createEntityId('template-section'),
    fields: section.fields.map((field) => ({
      ...structuredClone(field),
      id: createEntityId('template-field'),
      options: (field.options ?? []).map((option) => ({
        id: createEntityId('template-field-option'),
        label: option.label,
        sortOrder: option.sortOrder,
      })),
    })),
  }))
}

export const documentTemplateRepository = new DocumentTemplateRepository()

export async function listDocumentTemplates(): Promise<DocumentTemplate[]> {
  return documentTemplateRepository.list()
}

export async function listCachedDocumentTemplates(): Promise<DocumentTemplate[]> {
  return documentTemplateRepository.listCached()
}

export async function synchronizeDocumentTemplates(): Promise<DocumentTemplate[]> {
  return documentTemplateRepository.synchronize()
}

export async function getActiveDocumentTemplate(): Promise<DocumentTemplate | null> {
  return documentTemplateRepository.getActive()
}

export async function getDocumentTemplateById(
  templateId: string,
): Promise<DocumentTemplate | null> {
  return documentTemplateRepository.getById(templateId)
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && /не найден|404/i.test(error.message)
}
