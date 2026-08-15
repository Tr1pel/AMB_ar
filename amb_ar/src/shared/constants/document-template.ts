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

const passFailOptions = [
  { id: 'option-pass', label: 'Соответствует', sortOrder: 1 },
  { id: 'option-fail', label: 'Не соответствует', sortOrder: 2 },
]

export const BELL_PEPPER_DOCUMENT_TEMPLATE_ID = 'document-template-bell-pepper-inspection'

function createCustomTemplateField(
  id: string,
  label: string,
  type: DocumentTemplateFieldType,
  sortOrder: number,
  overrides: Partial<DocumentTemplateField> = {},
): DocumentTemplateField {
  return {
    id,
    dataPath: `custom.bellPepper.${id}`,
    label,
    type,
    required: false,
    placeholder: '',
    helpText: '',
    width: type === 'table' || type === 'textarea' || type === 'photo' ? 'full' : 'half',
    sortOrder,
    options: [],
    ...overrides,
  }
}

export const BELL_PEPPER_DOCUMENT_TEMPLATE_SECTIONS: DocumentTemplateSection[] = [
  {
    id: 'bell-general',
    title: 'Общая информация',
    description: 'Партия, транспорт, поставщик и условия загрузки.',
    sortOrder: 1,
    fields: [
      createCustomTemplateField('inspection-date', 'Дата инспекции', 'date', 1, { required: true }),
      createCustomTemplateField('inspection-time', 'Время инспекции', 'time', 2, { required: true }),
      createCustomTemplateField('vehicle-plate', 'Государственный номер', 'text', 3, { required: true }),
      createCustomTemplateField('invoice-number', 'Номер инвойса', 'text', 4),
      createCustomTemplateField('shift', 'Смена', 'radio', 5, {
        options: [
          { id: 'shift-morning', label: 'Утро', sortOrder: 1 },
          { id: 'shift-evening', label: 'Вечер', sortOrder: 2 },
        ],
      }),
      createCustomTemplateField('supplier', 'Поставщик', 'text', 6, { required: true }),
      createCustomTemplateField('loading-location', 'Место загрузки', 'text', 7),
      createCustomTemplateField('batch-number', 'Номер партии', 'text', 8),
      createCustomTemplateField('health-certificate', 'Сертификат здоровья', 'text', 9),
      createCustomTemplateField('origin-country', 'Страна происхождения', 'text', 10),
      createCustomTemplateField('harvest-date', 'Дата сбора', 'date', 11),
      createCustomTemplateField('farm-code', 'Код фермы / GAP', 'text', 12),
      createCustomTemplateField('cold-chain-start', 'Начало холодовой цепи', 'time', 13),
    ],
  },
  {
    id: 'bell-temperature',
    title: 'Температура и условия перевозки',
    description: 'Измерения продукта, кузова и проверка оборудования.',
    sortOrder: 2,
    fields: [
      ...[
        ['surface-temperature', 'Температура поверхности продукта'],
        ['core-temperature', 'Температура мякоти'],
        ['cargo-front-temperature', 'Температура в передней части кузова'],
        ['cargo-middle-temperature', 'Температура в средней части кузова'],
        ['cargo-rear-temperature', 'Температура в задней части кузова'],
      ].map(([id, label], index) =>
        createCustomTemplateField(id!, label!, 'measurement', index + 1, {
          unit: '°C',
          standardValue: '+6°C',
          required: index < 2,
        }),
      ),
      createCustomTemplateField('relative-humidity', 'Относительная влажность', 'measurement', 6, {
        unit: '%',
        standardValue: '80-90%',
      }),
      createCustomTemplateField('equipment-checks', 'Оборудование и условия', 'table', 7, {
        tableColumns: [
          { id: 'status', label: 'Статус', type: 'select', options: passFailOptions },
          { id: 'comments', label: 'Комментарий', type: 'text' },
        ],
        tableRows: [
          { id: 'refrigeration', label: 'Холодильная установка', helpText: 'Стабильная работа' },
          { id: 'condensation', label: 'Конденсат на палетах', helpText: 'Должен отсутствовать' },
          { id: 'air-circulation', label: 'Циркуляция воздуха', helpText: 'Без препятствий' },
          { id: 'vehicle-cleanliness', label: 'Чистота кузова', helpText: 'Чисто, без запахов' },
          { id: 'temperature-logger', label: 'Терморегистратор', helpText: 'Активен и записывает' },
        ],
      }),
    ],
  },
  {
    id: 'bell-visual',
    title: 'Визуальная проверка качества',
    description: 'Каждый критерий заполняется отдельной карточкой, а не строкой бумажной таблицы.',
    sortOrder: 3,
    fields: [
      createCustomTemplateField('visual-criteria', 'Критерии качества', 'table', 1, {
        required: true,
        tableColumns: [
          { id: 'result', label: 'Результат', type: 'select', options: passFailOptions },
          {
            id: 'severity',
            label: 'Критичность',
            type: 'select',
            options: [
              { id: 'severity-minor', label: 'Minor', sortOrder: 1 },
              { id: 'severity-major', label: 'Major', sortOrder: 2 },
              { id: 'severity-critical', label: 'Critical', sortOrder: 3 },
            ],
          },
          { id: 'notes', label: 'Примечание', type: 'text' },
        ],
        tableRows: [
          { id: 'shape-density', label: 'Форма и плотность' },
          { id: 'color', label: 'Равномерность цвета' },
          { id: 'mechanical-damage', label: 'Механические повреждения' },
          { id: 'wilting-pests', label: 'Увядание и вредители' },
          { id: 'rot-mold', label: 'Гниль, плесень и слизь' },
          { id: 'foreign-matter', label: 'Посторонние включения' },
          { id: 'net-weight', label: 'Вес нетто' },
          { id: 'diameter', label: 'Диаметр' },
          { id: 'core-condition', label: 'Состояние плодоножки' },
          { id: 'odor', label: 'Запах' },
        ],
      }),
    ],
  },
  {
    id: 'bell-packaging',
    title: 'Количество и упаковка',
    description: 'Сверка документов, факта и состояния упаковки.',
    sortOrder: 4,
    fields: [
      createCustomTemplateField('quantity-control', 'Количество и вес', 'table', 1, {
        tableColumns: [
          { id: 'document', label: 'По документам', type: 'text' },
          { id: 'actual', label: 'Фактически', type: 'text' },
          { id: 'match', label: 'Совпадает', type: 'checkbox' },
          { id: 'notes', label: 'Примечание', type: 'text' },
        ],
        tableRows: [
          { id: 'pallets', label: 'Всего палет' },
          { id: 'boxes', label: 'Всего коробок' },
          { id: 'boxes-per-pallet', label: 'Коробок на палете' },
          { id: 'net-box', label: 'Вес нетто коробки' },
          { id: 'gross-box', label: 'Вес брутто коробки' },
          { id: 'total-net', label: 'Общий вес нетто' },
        ],
      }),
      createCustomTemplateField('packaging-integrity', 'Целостность упаковки', 'table', 2, {
        tableColumns: [
          { id: 'result', label: 'Результат', type: 'select', options: passFailOptions },
          { id: 'notes', label: 'Примечание', type: 'text' },
        ],
        tableRows: [
          { id: 'box-condition', label: 'Состояние коробок' },
          { id: 'dryness', label: 'Сухость упаковки' },
          { id: 'label', label: 'Корректность этикетки' },
          { id: 'barcode', label: 'Качество штрихкода' },
          { id: 'advertising', label: 'Отсутствие посторонней рекламы' },
        ],
      }),
    ],
  },
  {
    id: 'bell-laboratory',
    title: 'Лабораторные испытания',
    description: 'Заполняется только при необходимости.',
    sortOrder: 5,
    fields: [
      createCustomTemplateField('nitrate-test', 'Содержание нитратов', 'table', 1, {
        tableColumns: [
          { id: 'method', label: 'Метод', type: 'text' },
          { id: 'result', label: 'Результат', type: 'select', options: passFailOptions },
          { id: 'value', label: 'Значение', type: 'number', unit: 'мг/кг' },
          { id: 'lab-ref', label: 'Номер лаборатории', type: 'text' },
        ],
        tableRows: [{ id: 'nitrate', label: 'Нитраты' }],
      }),
      createCustomTemplateField('laboratory-notes', 'Примечания лаборатории', 'textarea', 2),
    ],
  },
  {
    id: 'bell-decision',
    title: 'Итоговое решение',
    description: 'Категории продукции, замечания и решение по отгрузке.',
    sortOrder: 6,
    fields: [
      createCustomTemplateField('category-distribution', 'Распределение по категориям', 'table', 1, {
        tableColumns: [
          { id: 'first', label: '1 категория', type: 'number', unit: '%' },
          { id: 'second', label: '2 категория', type: 'number', unit: '%' },
          { id: 'non-standard', label: 'Нестандарт', type: 'number', unit: '%' },
          { id: 'waste', label: 'Отход', type: 'number', unit: '%' },
        ],
        tableRows: [
          { id: 'red', label: 'Красный перец' },
          { id: 'yellow', label: 'Жёлтый перец' },
          { id: 'orange', label: 'Оранжевый перец' },
        ],
      }),
      createCustomTemplateField('final-decision', 'Решение по партии', 'radio', 2, {
        required: true,
        width: 'full',
        options: [
          { id: 'decision-accepted', label: 'Принято', sortOrder: 1 },
          { id: 'decision-conditional', label: 'Условно принято', sortOrder: 2 },
          { id: 'decision-rejected', label: 'Отклонено', sortOrder: 3 },
        ],
      }),
      createCustomTemplateField('decision-notes', 'Замечания и предписания', 'textarea', 3),
    ],
  },
  {
    id: 'bell-authorization',
    title: 'Подтверждение',
    description: 'Имена ответственных лиц и дата выпуска отчёта.',
    sortOrder: 7,
    fields: [
      createCustomTemplateField('inspector-signature', 'Инспектор', 'signature', 1, { required: true }),
      createCustomTemplateField('customer-representative', 'Представитель заказчика', 'text', 2),
      createCustomTemplateField('warehouse-representative', 'Представитель склада', 'text', 3),
      createCustomTemplateField('driver', 'Водитель', 'text', 4),
      createCustomTemplateField('qc-manager', 'Руководитель ОТК', 'text', 5),
      createCustomTemplateField('report-date', 'Дата отчёта', 'date', 6, { required: true }),
    ],
  },
  {
    id: 'bell-photos',
    title: 'Фотодокументация',
    description: 'Каждая категория фотографий загружается в свой серверный фотослот.',
    sortOrder: 8,
    fields: [
      createCustomTemplateField('photo-product', 'Образец продукта', 'photo', 1, { required: true }),
      createCustomTemplateField('photo-temperature', 'Дисплей температуры', 'photo', 2, { required: true }),
      createCustomTemplateField('photo-vehicle', 'Состояние кузова', 'photo', 3),
      createCustomTemplateField('photo-loading', 'Загрузка палет', 'photo', 4),
      createCustomTemplateField('photo-label', 'Этикетка и штрихкод', 'photo', 5),
      createCustomTemplateField('photo-other', 'Дополнительные фотографии', 'photo', 6),
    ],
  },
]
