import { apiDelete, apiGet, apiPost, apiPut } from '@/shared/api/server-api'
import { DEFAULT_DOCUMENT_TEMPLATE_SECTIONS } from '@/shared/constants/document-template'
import { createEntityId, createSyncMetadata } from '@/shared/sync/sync-metadata'
import type { DocumentTemplate, DocumentTemplateSection } from '@/types/report'

export interface SaveDocumentTemplateInput {
  id: string
  name: string
  description: string
  sections: DocumentTemplateSection[]
}

const SEED_TEMPLATE_ID = 'document-template-quality-standard'

export class DocumentTemplateRepository {
  async ensureSeed(): Promise<void> {
    const templates = await this.list()

    if (templates.length) {
      return
    }

    const now = Date.now()

    await apiPost<DocumentTemplate>('/api/document-templates/seed', {
      id: SEED_TEMPLATE_ID,
      name: 'Стандартный отчет ОКК',
      description: 'Базовый макет отчета по инспекции качества.',
      status: 'active',
      sections: structuredClone(DEFAULT_DOCUMENT_TEMPLATE_SECTIONS),
      createdByAccountId: 'system',
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
      ...createSyncMetadata('synced'),
    })
  }

  async list(): Promise<DocumentTemplate[]> {
    return apiGet<DocumentTemplate[]>('/api/document-templates')
  }

  async getActive(): Promise<DocumentTemplate | null> {
    try {
      return await apiGet<DocumentTemplate>('/api/document-templates/active')
    } catch (error) {
      if (isNotFound(error)) {
        return null
      }

      throw error
    }
  }

  async getById(templateId: string): Promise<DocumentTemplate | null> {
    try {
      return await apiGet<DocumentTemplate>(
        `/api/document-templates/${encodeURIComponent(templateId)}`,
      )
    } catch (error) {
      if (isNotFound(error)) {
        return null
      }

      throw error
    }
  }

  async createEmpty(adminAccountId: string): Promise<DocumentTemplate> {
    const now = Date.now()
    const template: DocumentTemplate = {
      id: createEntityId('document-template'),
      name: 'Новый макет',
      description: '',
      status: 'draft',
      sections: [
        {
          id: createEntityId('template-section'),
          title: 'Новый раздел',
          description: '',
          sortOrder: 1,
          fields: [],
        },
      ],
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

  async save(
    input: SaveDocumentTemplateInput,
    adminAccountId: string,
  ): Promise<DocumentTemplate> {
    const existingTemplate = await this.getById(input.id)
    const name = input.name.trim()

    if (!existingTemplate) {
      throw new Error('Макет не найден')
    }

    if (!name) {
      throw new Error('Введите название макета')
    }

    if (!input.sections.length) {
      throw new Error('Добавьте хотя бы один раздел')
    }

    return apiPut<DocumentTemplate>(
      `/api/document-templates/${encodeURIComponent(input.id)}`,
      {
        ...existingTemplate,
        name,
        description: input.description.trim(),
        sections: normalizeSections(input.sections),
      },
      adminAccountId,
    )
  }

  async duplicate(templateId: string, adminAccountId: string): Promise<DocumentTemplate> {
    const sourceTemplate = await this.getById(templateId)

    if (!sourceTemplate) {
      throw new Error('Макет не найден')
    }

    const now = Date.now()
    const duplicate: DocumentTemplate = {
      ...structuredClone(sourceTemplate),
      id: createEntityId('document-template'),
      name: `${sourceTemplate.name} — копия`,
      status: 'draft',
      sections: regenerateNodeIds(sourceTemplate.sections),
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

    if (!template.sections.some((section) => section.fields.length > 0)) {
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
    await apiDelete(
      `/api/document-templates/${encodeURIComponent(templateId)}`,
      adminAccountId,
    )
  }
}

function normalizeSections(sections: DocumentTemplateSection[]): DocumentTemplateSection[] {
  return sections.map((section, sectionIndex) => ({
    ...section,
    title: section.title.trim() || `Раздел ${sectionIndex + 1}`,
    description: section.description.trim(),
    sortOrder: sectionIndex + 1,
    fields: section.fields.map((field, fieldIndex) => ({
      ...field,
      label: field.label.trim() || 'Поле без названия',
      placeholder: field.placeholder.trim(),
      helpText: field.helpText.trim(),
      sortOrder: fieldIndex + 1,
      options: (field.options ?? []).map((option, optionIndex) => ({
        id: option.id,
        label: option.label.trim() || `Вариант ${optionIndex + 1}`,
        sortOrder: optionIndex + 1,
      })),
    })),
  }))
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

export async function ensureSeedDocumentTemplates(): Promise<void> {
  await documentTemplateRepository.ensureSeed()
}

export async function listDocumentTemplates(): Promise<DocumentTemplate[]> {
  return documentTemplateRepository.list()
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
