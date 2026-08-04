import type {
  DocumentTemplateField,
  DocumentTemplateFieldType,
  DocumentTemplateSection,
} from '@/types/report'

export interface DocumentTemplateFieldCatalogItem {
  dataPath: string
  label: string
  type: DocumentTemplateFieldType
  group: string
}

export const DOCUMENT_TEMPLATE_FIELD_CATALOG: DocumentTemplateFieldCatalogItem[] = [
  { dataPath: 'mainInfo.orderNumber', label: 'Номер заказа', type: 'text', group: 'Партия' },
  { dataPath: 'mainInfo.zost', label: 'ZOST', type: 'text', group: 'Партия' },
  { dataPath: 'mainInfo.shipper', label: 'Поставщик', type: 'text', group: 'Партия' },
  { dataPath: 'mainInfo.trailerNumber', label: 'Номер прицепа', type: 'text', group: 'Партия' },
  {
    dataPath: 'mainInfo.placeOfSurvey',
    label: 'Место инспекции',
    type: 'text',
    group: 'Партия',
  },
  { dataPath: 'mainInfo.openingDate', label: 'Дата открытия', type: 'date', group: 'Партия' },
  { dataPath: 'mainInfo.surveyDate', label: 'Дата инспекции', type: 'date', group: 'Партия' },
  { dataPath: 'mainInfo.productName', label: 'Наименование товара', type: 'select', group: 'Продукт' },
  { dataPath: 'mainInfo.packageName', label: 'Фасовка', type: 'select', group: 'Продукт' },
  { dataPath: 'mainInfo.plu', label: 'PLU', type: 'text', group: 'Продукт' },
  { dataPath: 'mainInfo.packingKind', label: 'Вид упаковки', type: 'select', group: 'Продукт' },
  { dataPath: 'mainInfo.boxMarking', label: 'Маркировка на коробках', type: 'text', group: 'Продукт' },
  {
    dataPath: 'temperatureInfo.storageTemperature',
    label: 'Температура хранения',
    type: 'number',
    group: 'Температура',
  },
  {
    dataPath: 'temperatureInfo.pulpTemperature',
    label: 'Температура пульпы',
    type: 'number',
    group: 'Температура',
  },
  {
    dataPath: 'temperatureInfo.temperatureViolation',
    label: 'Нарушение температуры',
    type: 'select',
    group: 'Температура',
  },
  {
    dataPath: 'temperatureInfo.sealNumber',
    label: 'Номер пломбы',
    type: 'text',
    group: 'Температура',
  },
  {
    dataPath: 'temperatureInfo.thermographPresence',
    label: 'Наличие термографов',
    type: 'select',
    group: 'Температура',
  },
  {
    dataPath: 'temperatureInfo.thermographViolation',
    label: 'Нарушение термографов',
    type: 'select',
    group: 'Температура',
  },
  {
    dataPath: 'inspectionResults.firstCategoryPercent',
    label: 'Соответствует 1 категории',
    type: 'number',
    group: 'Результаты',
  },
  {
    dataPath: 'inspectionResults.firstCategoryNonStandardPercent',
    label: 'Нестандарт для 1 категории',
    type: 'number',
    group: 'Результаты',
  },
  {
    dataPath: 'inspectionResults.secondCategoryNonStandardPercent',
    label: 'Нестандарт для 2 категории',
    type: 'number',
    group: 'Результаты',
  },
  {
    dataPath: 'inspectionResults.wastePercent',
    label: 'Отход',
    type: 'number',
    group: 'Результаты',
  },
  { dataPath: 'inspectionResults.density', label: 'Плотность', type: 'number', group: 'Результаты' },
  { dataPath: 'inspectionResults.brix', label: 'Brix / сахар', type: 'number', group: 'Результаты' },
  { dataPath: 'inspectionResults.caliber', label: 'Калибр', type: 'text', group: 'Результаты' },
  {
    dataPath: 'inspectionResults.caliberPassportMatch',
    label: 'Калибр соответствует ПК',
    type: 'select',
    group: 'Результаты',
  },
  { dataPath: 'inspectionResults.variety', label: 'Сорт', type: 'text', group: 'Результаты' },
  {
    dataPath: 'inspectionResults.varietyPassportMatch',
    label: 'Сорт соответствует ПК',
    type: 'select',
    group: 'Результаты',
  },
  {
    dataPath: 'descriptions.secondClassDefects',
    label: 'Описание нестандарта',
    type: 'textarea',
    group: 'Заключение',
  },
  {
    dataPath: 'descriptions.waste',
    label: 'Описание отхода',
    type: 'textarea',
    group: 'Заключение',
  },
  {
    dataPath: 'descriptions.caliberMismatch',
    label: 'Замечания по калибру',
    type: 'textarea',
    group: 'Заключение',
  },
  {
    dataPath: 'expertConclusion',
    label: 'Заключение эксперта',
    type: 'textarea',
    group: 'Заключение',
  },
  {
    dataPath: 'sampling.points',
    label: 'Точки выборки',
    type: 'textarea',
    group: 'Выборка',
  },
  {
    dataPath: 'photos',
    label: 'Фотографии',
    type: 'photo',
    group: 'Подтверждение',
  },
  {
    dataPath: 'signatures.expertName',
    label: 'Эксперт',
    type: 'signature',
    group: 'Подписи',
  },
  {
    dataPath: 'signatures.retailRepresentativeName',
    label: 'Представитель ТС',
    type: 'signature',
    group: 'Подписи',
  },
  {
    dataPath: 'signatures.reportIssuedDate',
    label: 'Дата выпуска отчета',
    type: 'date',
    group: 'Подписи',
  },
]

const REQUIRED_FIELD_PATHS = new Set([
  'mainInfo.orderNumber',
  'mainInfo.placeOfSurvey',
  'mainInfo.productName',
])

function createField(dataPath: string, sortOrder: number): DocumentTemplateField {
  const catalogItem = DOCUMENT_TEMPLATE_FIELD_CATALOG.find((item) => item.dataPath === dataPath)

  if (!catalogItem) {
    throw new Error(`Неизвестное поле макета: ${dataPath}`)
  }

  return {
    id: `field-${dataPath.replaceAll('.', '-')}`,
    dataPath,
    label: catalogItem.label,
    type: catalogItem.type,
    required: REQUIRED_FIELD_PATHS.has(dataPath),
    placeholder: '',
    helpText: '',
    width: catalogItem.type === 'textarea' || catalogItem.type === 'photo' ? 'full' : 'half',
    sortOrder,
    options: [],
  }
}

function createSection(
  id: string,
  title: string,
  description: string,
  paths: string[],
  sortOrder: number,
): DocumentTemplateSection {
  return {
    id,
    title,
    description,
    sortOrder,
    fields: paths.map((path, index) => createField(path, index + 1)),
  }
}

export const DEFAULT_DOCUMENT_TEMPLATE_SECTIONS: DocumentTemplateSection[] = [
  createSection(
    'section-shipment',
    'Партия',
    'Заказ, поставщик, место инспекции и даты.',
    [
      'mainInfo.orderNumber',
      'mainInfo.zost',
      'mainInfo.shipper',
      'mainInfo.trailerNumber',
      'mainInfo.placeOfSurvey',
      'mainInfo.openingDate',
      'mainInfo.surveyDate',
    ],
    1,
  ),
  createSection(
    'section-product',
    'Продукт',
    'Товар, фасовка, упаковка и маркировка.',
    [
      'mainInfo.productName',
      'mainInfo.packageName',
      'mainInfo.plu',
      'mainInfo.packingKind',
      'mainInfo.boxMarking',
    ],
    2,
  ),
  createSection(
    'section-temperature',
    'Температура',
    'Температурный режим, пломба и термографы.',
    [
      'temperatureInfo.storageTemperature',
      'temperatureInfo.pulpTemperature',
      'temperatureInfo.temperatureViolation',
      'temperatureInfo.sealNumber',
      'temperatureInfo.thermographPresence',
      'temperatureInfo.thermographViolation',
    ],
    3,
  ),
  createSection(
    'section-results',
    'Результаты',
    'Основные показатели проверки качества.',
    [
      'inspectionResults.firstCategoryPercent',
      'inspectionResults.firstCategoryNonStandardPercent',
      'inspectionResults.secondCategoryNonStandardPercent',
      'inspectionResults.wastePercent',
      'inspectionResults.density',
      'inspectionResults.brix',
      'inspectionResults.caliber',
      'inspectionResults.caliberPassportMatch',
      'inspectionResults.variety',
      'inspectionResults.varietyPassportMatch',
    ],
    4,
  ),
  createSection(
    'section-conclusion',
    'Заключение',
    'Описание дефектов и итоговое заключение эксперта.',
    [
      'descriptions.secondClassDefects',
      'descriptions.waste',
      'descriptions.caliberMismatch',
      'expertConclusion',
    ],
    5,
  ),
  createSection(
    'section-sampling',
    'Выборка',
    'Случайно сформированные точки контроля.',
    ['sampling.points'],
    6,
  ),
  createSection(
    'section-evidence',
    'Фото и подписи',
    'Подтверждающие материалы и выпуск отчета.',
    [
      'photos',
      'signatures.expertName',
      'signatures.retailRepresentativeName',
      'signatures.reportIssuedDate',
    ],
    7,
  ),
]
