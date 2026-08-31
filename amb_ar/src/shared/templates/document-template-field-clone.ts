import type { DocumentTemplateField } from '@/types/report'

export function cloneDocumentTemplateField(field: DocumentTemplateField): DocumentTemplateField {
  return {
    ...field,
    translations: field.translations
      ? {
          ru: { ...field.translations.ru },
          en: { ...field.translations.en },
          fa: { ...field.translations.fa },
        }
      : undefined,
    options: (field.options ?? []).map((option) => ({ ...option })),
    tableColumns: field.tableColumns?.map((column) => ({
      ...column,
      options: column.options?.map((option) => ({ ...option })),
    })),
    tableRows: field.tableRows?.map((row) => ({ ...row })),
    calculation: field.calculation
      ? {
          ...field.calculation,
          sourcePaths: [...field.calculation.sourcePaths],
        }
      : undefined,
  }
}
