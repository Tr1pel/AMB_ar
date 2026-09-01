import type {
  DocumentInputSchema,
  DocumentRenderFieldSpec,
  DocumentRenderSectionSpec,
  DocumentRenderSpec,
  DocumentTemplate,
  DocumentTemplateField,
  DocumentTemplateSection,
  DocumentTemplateSnapshot,
} from '@/types/report'
import {
  getMultilingualFieldText,
  getMultilingualSectionText,
} from '@/shared/templates/document-template-localization'
type TemplateSchemaSource =
  | Pick<DocumentTemplate, 'id' | 'name' | 'sections' | 'inputSchema' | 'renderSpec'>
  | DocumentTemplateSnapshot

export function getTemplateInputSections(
  template: TemplateSchemaSource | null | undefined,
): DocumentTemplateSection[] {
  return template?.inputSchema?.steps ?? template?.sections ?? []
}

export function createInputSchema(sections: DocumentTemplateSection[]): DocumentInputSchema {
  return {
    version: 1,
    steps: sections,
  }
}

export function createDefaultRenderSpec(
  sections: DocumentTemplateSection[],
  documentTitle = 'Отчёт о контроле качества',
): DocumentRenderSpec {
  return {
    version: 1,
    mode: 'flow',
    layout: 'branded',
    pageSize: 'A4',
    documentTitle,
    sections: sections.map((section) => createRenderSection(section)),
  }
}

export function getTemplateRenderSpec(template: TemplateSchemaSource): DocumentRenderSpec {
  return syncRenderSpec(
    template.renderSpec ??
      createDefaultRenderSpec(getTemplateInputSections(template), template.name),
    getTemplateInputSections(template),
    template.name,
  )
}

export function syncRenderSpec(
  renderSpec: DocumentRenderSpec,
  sections: DocumentTemplateSection[],
  documentTitle: string,
): DocumentRenderSpec {
  const inputSections = new Map(sections.map((section) => [section.id, section]))
  const existingSections = new Map(
    (renderSpec.sections ?? []).map((section) => [section.inputSectionId, section]),
  )
  const orderedSections = [
    ...(renderSpec.sections ?? [])
      .map((section) => inputSections.get(section.inputSectionId))
      .filter((section): section is DocumentTemplateSection => Boolean(section)),
    ...sections.filter((section) => !existingSections.has(section.id)),
  ]

  return {
    version: 1,
    mode: 'flow',
    layout: 'branded',
    pageSize: 'A4',
    documentTitle: renderSpec.documentTitle?.trim() || documentTitle,
    sections: orderedSections.map((section) => {
      const existing = existingSections.get(section.id)
      const inputFields = new Map(section.fields.map((field) => [field.dataPath, field]))
      const existingFields = new Map(
        (existing?.fields ?? []).map((field) => [field.dataPath, field]),
      )
      const orderedFields = [
        ...(existing?.fields ?? [])
          .map((field) => inputFields.get(field.dataPath))
          .filter((field): field is DocumentTemplateField => Boolean(field)),
        ...section.fields.filter((field) => !existingFields.has(field.dataPath)),
      ]

      return {
        ...createRenderSection(section),
        ...existing,
        id: existing?.id ?? `render-${section.id}`,
        inputSectionId: section.id,
        title: getMultilingualSectionText(section, 'title'),
        fields: orderedFields.map((field) => ({
          ...createRenderField(field),
          ...existingFields.get(field.dataPath),
          dataPath: field.dataPath,
          label: getMultilingualFieldText(field, 'label'),
        })),
      }
    }),
  }
}

function createRenderSection(section: DocumentTemplateSection): DocumentRenderSectionSpec {
  return {
    id: `render-${section.id}`,
    inputSectionId: section.id,
    title: getMultilingualSectionText(section, 'title'),
    pageBreakBefore: false,
    columns: section.fields.length > 8 ? 2 : 1,
    showDescription: true,
    hidden: false,
    fields: section.fields.map(createRenderField),
  }
}

function createRenderField(field: DocumentTemplateField): DocumentRenderFieldSpec {
  return {
    dataPath: field.dataPath,
    label: getMultilingualFieldText(field, 'label'),
    width: field.width,
    display:
      field.type === 'table'
        ? 'table'
        : field.type === 'checkbox' || field.type === 'passFail'
          ? 'checkmark'
          : 'value',
    hideWhenEmpty: false,
    hidden: false,
  }
}
