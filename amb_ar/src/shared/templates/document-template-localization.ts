import { tForLocale } from '@/shared/i18n'
import type {
  DocumentTemplateField,
  DocumentTemplateFieldTranslation,
  DocumentTemplateFieldTranslations,
  DocumentTemplateLocale,
  DocumentTemplate,
  DocumentTemplateSection,
  DocumentTemplateSectionTranslation,
  DocumentTemplateSectionTranslations,
  DocumentTemplateTranslation,
  DocumentTemplateTranslations,
} from '@/types/report'

export type DocumentTemplateFieldTextKey = keyof DocumentTemplateFieldTranslation

interface InferredLocalizedText {
  ru: string
  en: string
  fa: string
}

export const DOCUMENT_TEMPLATE_LOCALES: ReadonlyArray<{
  value: DocumentTemplateLocale
  label: string
  shortLabel: string
  dir: 'ltr' | 'rtl'
}> = [
  { value: 'ru', label: 'Русский', shortLabel: 'RU', dir: 'ltr' },
  { value: 'en', label: 'English', shortLabel: 'EN', dir: 'ltr' },
  { value: 'fa', label: 'فارسی', shortLabel: 'FA', dir: 'rtl' },
]

export function createFieldTranslations(
  label = '',
  placeholder = '',
  helpText = '',
): DocumentTemplateFieldTranslations {
  const inferredLabel = inferLegacyText(label)
  const inferredPlaceholder = inferLegacyText(placeholder)
  const inferredHelpText = inferLegacyText(helpText)

  return {
    ru: {
      label: inferredLabel?.ru ?? label,
      placeholder: inferredPlaceholder?.ru ?? placeholder,
      helpText: inferredHelpText?.ru ?? helpText,
    },
    en: {
      label: inferredLabel?.en ?? '',
      placeholder: inferredPlaceholder?.en ?? '',
      helpText: inferredHelpText?.en ?? '',
    },
    fa: {
      label: inferredLabel?.fa ?? '',
      placeholder: inferredPlaceholder?.fa ?? '',
      helpText: inferredHelpText?.fa ?? '',
    },
  }
}

export function createTemplateTranslations(
  name = '',
  description = '',
): DocumentTemplateTranslations {
  return createTranslations(name, description, 'name')
}

export function ensureTemplateTranslations(
  template: Pick<DocumentTemplate, 'name' | 'description' | 'translations'>,
): DocumentTemplateTranslations {
  const fallback = createTemplateTranslations(template.name, template.description)
  template.translations = normalizeTranslations(template.translations, fallback)
  fillKnownTranslations(template.translations, ['name', 'description'])
  return template.translations
}

export function getLocalizedTemplateText(
  template: Pick<DocumentTemplate, 'name' | 'description' | 'translations'>,
  key: keyof DocumentTemplateTranslation,
  locale: DocumentTemplateLocale,
): string {
  return getLocalizedText(template.translations, key, locale, template[key])
}

export function getMultilingualTemplateText(
  template: Pick<DocumentTemplate, 'name' | 'description' | 'translations'>,
  key: keyof DocumentTemplateTranslation,
): string {
  return getMultilingualText(template.translations, key, template[key])
}

export function synchronizeLegacyTemplateText(
  template: Pick<DocumentTemplate, 'name' | 'description' | 'translations'>,
): void {
  const translations = ensureTemplateTranslations(template)
  template.name = getCanonicalText(translations, 'name')
  template.description = translations.ru.description.trim()
}

export function createSectionTranslations(
  title = '',
  description = '',
): DocumentTemplateSectionTranslations {
  return createTranslations(title, description, 'title')
}

export function ensureSectionTranslations(
  section: Pick<DocumentTemplateSection, 'title' | 'description' | 'translations'>,
): DocumentTemplateSectionTranslations {
  const fallback = createSectionTranslations(section.title, section.description)
  section.translations = normalizeTranslations(section.translations, fallback)
  fillKnownTranslations(section.translations, ['title', 'description'])
  return section.translations
}

export function getLocalizedSectionText(
  section: Pick<DocumentTemplateSection, 'title' | 'description' | 'translations'>,
  key: keyof DocumentTemplateSectionTranslation,
  locale: DocumentTemplateLocale,
): string {
  return getLocalizedText(section.translations, key, locale, section[key])
}

export function getMultilingualSectionText(
  section: Pick<DocumentTemplateSection, 'title' | 'description' | 'translations'>,
  key: keyof DocumentTemplateSectionTranslation,
): string {
  return getMultilingualText(section.translations, key, section[key])
}

export function synchronizeLegacySectionText(
  section: Pick<DocumentTemplateSection, 'title' | 'description' | 'translations'>,
): void {
  const translations = ensureSectionTranslations(section)
  section.title = getCanonicalText(translations, 'title')
  section.description = translations.ru.description.trim()
}

export function ensureFieldTranslations(
  field: DocumentTemplateField,
): DocumentTemplateFieldTranslations {
  const fallback = createFieldTranslations(field.label, field.placeholder, field.helpText)
  const translations = field.translations

  field.translations = {
    ru: normalizeTranslation(translations?.ru, fallback.ru),
    en: normalizeTranslation(translations?.en, fallback.en),
    fa: normalizeTranslation(translations?.fa, fallback.fa),
  }

  if (!translations) {
    for (const locale of ['en', 'fa'] as const) {
      for (const key of ['label', 'placeholder', 'helpText'] as const) {
        const russianValue = field.translations.ru[key].trim()
        const translatedValue = tForLocale(russianValue, locale)

        if (
          !field.translations[locale][key].trim() &&
          russianValue &&
          translatedValue !== russianValue
        ) {
          field.translations[locale][key] = translatedValue
        }
      }
    }
  }

  return field.translations
}

export function getLocalizedFieldText(
  field: DocumentTemplateField,
  key: DocumentTemplateFieldTextKey,
  locale: DocumentTemplateLocale,
): string {
  const translations =
    field.translations ?? createFieldTranslations(field.label, field.placeholder, field.helpText)
  const legacyValue = getLegacyValue(field, key)
  const russianValue = translations.ru?.[key]?.trim() || legacyValue.trim()
  const knownTranslation = tForLocale(russianValue, locale)

  return (
    translations[locale]?.[key]?.trim() ||
    (knownTranslation !== russianValue ? knownTranslation : '') ||
    russianValue ||
    legacyValue.trim()
  )
}

export function getMultilingualFieldText(
  field: DocumentTemplateField,
  key: DocumentTemplateFieldTextKey,
): string {
  const translations =
    field.translations ?? createFieldTranslations(field.label, field.placeholder, field.helpText)
  const values = (['ru', 'en', 'fa'] as const)
    .map((locale) => translations[locale]?.[key]?.trim())
    .filter((value): value is string => Boolean(value))

  if (!values.length) {
    return getLegacyValue(field, key).trim()
  }

  return [...new Set(values)].join(' / ')
}

export function synchronizeLegacyFieldText(field: DocumentTemplateField): DocumentTemplateField {
  const translations = ensureFieldTranslations(field)

  field.label =
    translations.ru.label.trim() || translations.en.label.trim() || translations.fa.label.trim()
  field.placeholder = translations.ru.placeholder.trim()
  field.helpText = translations.ru.helpText.trim()

  return field
}

function normalizeTranslation(
  translation: DocumentTemplateFieldTranslation | undefined,
  fallback: DocumentTemplateFieldTranslation,
): DocumentTemplateFieldTranslation {
  return {
    label: String(translation?.label ?? fallback.label),
    placeholder: String(translation?.placeholder ?? fallback.placeholder),
    helpText: String(translation?.helpText ?? fallback.helpText),
  }
}

function getLegacyValue(field: DocumentTemplateField, key: DocumentTemplateFieldTextKey): string {
  if (key === 'label') {
    return field.label ?? ''
  }

  if (key === 'placeholder') {
    return field.placeholder ?? ''
  }

  return field.helpText ?? ''
}

function inferLegacyText(value: string): InferredLocalizedText | null {
  const parts = String(value ?? '')
    .split(' / ')
    .map((part) => part.trim())
    .filter(Boolean)
  const farsiIndex = parts.findIndex((part) => /[\u0600-\u06ff]/u.test(part))

  if (parts.length < 3 || farsiIndex <= 0 || farsiIndex >= parts.length - 1) {
    return null
  }

  return {
    ru: parts.slice(farsiIndex + 1).join(' / '),
    en: parts.slice(0, farsiIndex).join(' / '),
    fa: parts[farsiIndex] ?? '',
  }
}

function createTranslations<TKey extends 'name' | 'title'>(
  title: string,
  description: string,
  titleKey: TKey,
): Record<DocumentTemplateLocale, Record<TKey | 'description', string>> {
  const inferredTitle = inferLegacyText(title)
  const inferredDescription = inferLegacyText(description)

  return {
    ru: {
      [titleKey]: inferredTitle?.ru ?? title,
      description: inferredDescription?.ru ?? description,
    },
    en: {
      [titleKey]: inferredTitle?.en ?? '',
      description: inferredDescription?.en ?? '',
    },
    fa: {
      [titleKey]: inferredTitle?.fa ?? '',
      description: inferredDescription?.fa ?? '',
    },
  } as Record<DocumentTemplateLocale, Record<TKey | 'description', string>>
}

function normalizeTranslations<
  T extends DocumentTemplateTranslation | DocumentTemplateSectionTranslation,
>(
  translations: Record<DocumentTemplateLocale, T> | undefined,
  fallback: Record<DocumentTemplateLocale, T>,
): Record<DocumentTemplateLocale, T> {
  return {
    ru: { ...fallback.ru, ...translations?.ru },
    en: { ...fallback.en, ...translations?.en },
    fa: { ...fallback.fa, ...translations?.fa },
  }
}

function fillKnownTranslations<
  T extends DocumentTemplateTranslation | DocumentTemplateSectionTranslation,
>(translations: Record<DocumentTemplateLocale, T>, keys: Array<keyof T>): void {
  for (const locale of ['en', 'fa'] as const) {
    for (const key of keys) {
      const russianValue = String(translations.ru[key] ?? '').trim()
      const translatedValue = tForLocale(russianValue, locale)

      if (
        !String(translations[locale][key] ?? '').trim() &&
        russianValue &&
        translatedValue !== russianValue
      ) {
        translations[locale][key] = translatedValue as T[keyof T]
      }
    }
  }
}

function getLocalizedText<
  T extends DocumentTemplateTranslation | DocumentTemplateSectionTranslation,
>(
  translations: Record<DocumentTemplateLocale, T> | undefined,
  key: keyof T,
  locale: DocumentTemplateLocale,
  legacyValue: string,
): string {
  const russianValue = String(translations?.ru?.[key] ?? legacyValue).trim()
  const knownTranslation = tForLocale(russianValue, locale)

  return (
    String(translations?.[locale]?.[key] ?? '').trim() ||
    (knownTranslation !== russianValue ? knownTranslation : '') ||
    russianValue
  )
}

function getMultilingualText<
  T extends DocumentTemplateTranslation | DocumentTemplateSectionTranslation,
>(
  translations: Record<DocumentTemplateLocale, T> | undefined,
  key: keyof T,
  legacyValue: string,
): string {
  const values = (['ru', 'en', 'fa'] as const)
    .map((locale) => String(translations?.[locale]?.[key] ?? '').trim())
    .filter(Boolean)

  return values.length ? [...new Set(values)].join(' / ') : legacyValue.trim()
}

function getCanonicalText<
  T extends DocumentTemplateTranslation | DocumentTemplateSectionTranslation,
>(translations: Record<DocumentTemplateLocale, T>, key: keyof T): string {
  return (
    (['ru', 'en', 'fa'] as const)
      .map((locale) => String(translations[locale][key] ?? '').trim())
      .find(Boolean) ?? ''
  )
}
