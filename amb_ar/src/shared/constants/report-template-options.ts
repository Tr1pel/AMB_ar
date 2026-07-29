import { PRODUCT_OPTIONS } from '@/shared/constants/products'
import type { ReportTemplateField, ReportTemplateOption } from '@/types/report'

type SeedReportTemplateOption = Pick<
  ReportTemplateOption,
  'id' | 'field' | 'label' | 'value' | 'category' | 'sortOrder'
>

const yesNoFields: ReportTemplateField[] = [
  'temperatureViolation',
  'thermographPresence',
  'thermographViolation',
  'caliberPassportMatch',
  'varietyPassportMatch',
]

export const REPORT_TEMPLATE_FIELD_LABELS: Record<ReportTemplateField, string> = {
  productId: 'Тип товара',
  packageName: 'Фасовка',
  packingKind: 'Вид упаковки',
  temperatureViolation: 'Нарушение температуры',
  thermographPresence: 'Наличие термографов',
  thermographViolation: 'Нарушение термографов',
  caliberPassportMatch: 'Калибр соответствует ПК',
  varietyPassportMatch: 'Сорт соответствует ПК',
}

export const SEED_REPORT_TEMPLATE_OPTIONS: SeedReportTemplateOption[] = [
  ...PRODUCT_OPTIONS.map((product, index) => ({
    id: `template-product-${product.id}`,
    field: 'productId' as const,
    label: product.label,
    value: product.id,
    category: product.category,
    sortOrder: index + 1,
  })),
  {
    id: 'template-package-1kg',
    field: 'packageName',
    label: '1 кг',
    value: '1 кг',
    category: 'Фасовка',
    sortOrder: 1,
  },
  {
    id: 'template-package-5kg',
    field: 'packageName',
    label: '5 кг',
    value: '5 кг',
    category: 'Фасовка',
    sortOrder: 2,
  },
  {
    id: 'template-packing-box',
    field: 'packingKind',
    label: 'Картонная коробка',
    value: 'Картонная коробка',
    category: 'Упаковка',
    sortOrder: 1,
  },
  {
    id: 'template-packing-plastic',
    field: 'packingKind',
    label: 'Пластиковый ящик',
    value: 'Пластиковый ящик',
    category: 'Упаковка',
    sortOrder: 2,
  },
  ...yesNoFields.flatMap((field) => [
    {
      id: `template-${field}-no`,
      field,
      label: 'Нет',
      value: 'Нет',
      category: REPORT_TEMPLATE_FIELD_LABELS[field],
      sortOrder: 1,
    },
    {
      id: `template-${field}-yes`,
      field,
      label: 'Да',
      value: 'Да',
      category: REPORT_TEMPLATE_FIELD_LABELS[field],
      sortOrder: 2,
    },
  ]),
]
