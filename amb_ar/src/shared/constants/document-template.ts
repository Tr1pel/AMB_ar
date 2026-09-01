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

export const REQUIRED_REPORT_TEMPLATE_FIELDS = [
  {
    dataPath: 'mainInfo.orderNumber',
    label: 'Номер заказа',
    type: 'text' as const,
    translations: {
      ru: 'Номер заказа',
      en: 'Order number',
      fa: 'شماره سفارش',
    },
  },
  {
    dataPath: 'mainInfo.surveyDate',
    label: 'Дата инспекции',
    type: 'date' as const,
    translations: {
      ru: 'Дата инспекции',
      en: 'Date Inspection',
      fa: 'بازرسی تاریخ',
    },
  },
] as const

export function isRequiredReportTemplateField(dataPath: string): boolean {
  return REQUIRED_REPORT_TEMPLATE_FIELDS.some((field) => field.dataPath === dataPath)
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
  {
    dataPath: 'mainInfo.productName',
    label: 'Наименование товара',
    type: 'select',
    group: 'Продукт',
  },
  { dataPath: 'mainInfo.packageName', label: 'Фасовка', type: 'select', group: 'Продукт' },
  { dataPath: 'mainInfo.plu', label: 'PLU', type: 'text', group: 'Продукт' },
  { dataPath: 'mainInfo.packingKind', label: 'Вид упаковки', type: 'select', group: 'Продукт' },
  {
    dataPath: 'mainInfo.boxMarking',
    label: 'Маркировка на коробках',
    type: 'text',
    group: 'Продукт',
  },
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
  {
    dataPath: 'inspectionResults.density',
    label: 'Плотность',
    type: 'number',
    group: 'Результаты',
  },
  {
    dataPath: 'inspectionResults.brix',
    label: 'Brix / сахар',
    type: 'number',
    group: 'Результаты',
  },
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

const passFailOptions = [
  { id: 'option-pass', label: 'Соответствует', sortOrder: 1 },
  { id: 'option-fail', label: 'Не соответствует', sortOrder: 2 },
]

export const ICEBERG_DOCUMENT_TEMPLATE_ID = 'document-template-iceberg-quality-inspection'

const trilingual = (english: string, farsi: string, russian: string): string =>
  `${english} / ${russian} / ${farsi}`

function createCustomTemplateField(
  id: string,
  label: string,
  type: DocumentTemplateFieldType,
  sortOrder: number,
  overrides: Partial<DocumentTemplateField> = {},
): DocumentTemplateField {
  return {
    id,
    dataPath: `custom.iceberg.${id}`,
    label,
    type,
    required: false,
    placeholder: '',
    helpText: '',
    width:
      type === 'table' || type === 'textarea' || type === 'photo' || type === 'repeatingPhoto'
        ? 'full'
        : 'half',
    sortOrder,
    options: [],
    ...overrides,
  }
}

const inspectionResultOptions = [
  { id: 'inspection-pass', label: trilingual('Pass', 'قبول', 'ДА'), sortOrder: 1 },
  { id: 'inspection-fail', label: trilingual('Fail', 'رد', 'НЕТ'), sortOrder: 2 },
]

const severityOptions = [
  { id: 'severity-minor', label: trilingual('Minor', 'جزئی', 'Незначительное'), sortOrder: 1 },
  { id: 'severity-major', label: trilingual('Major', 'عمده', 'Существенное'), sortOrder: 2 },
  { id: 'severity-critical', label: trilingual('Critical', 'بحرانی', 'Критическое'), sortOrder: 3 },
]

export const ICEBERG_DOCUMENT_TEMPLATE_SECTIONS: DocumentTemplateSection[] = [
  {
    id: 'iceberg-general',
    title: trilingual('1. GENERAL INFORMATION', '۱. اطلاعات عمومی', '1. ОБЩАЯ ИНФОРМАЦИЯ'),
    description: trilingual(
      'Inspection of Quality & Shipment Conditions',
      'بازرسی کیفیت و شرایط بارگیری',
      'Инспекция качества и условий отгрузки',
    ),
    sortOrder: 1,
    fields: [
      createCustomTemplateField(
        'inspection-date',
        trilingual('Inspection Date', 'تاریخ بازرسی', 'Дата инспекции'),
        'date',
        1,
        { required: true },
      ),
      createCustomTemplateField(
        'inspection-time',
        trilingual('Inspection Time', 'ساعت', 'Время инспекции'),
        'time',
        2,
        { required: true },
      ),
      createCustomTemplateField(
        'vehicle-plate',
        trilingual('Vehicle Plate', 'شماره پلاک', 'Гос. номер'),
        'text',
        3,
        { required: true },
      ),
      createCustomTemplateField(
        'invoice-number',
        trilingual('Invoice No', 'شماره فاکتور', '№ инвойса'),
        'text',
        4,
      ),
      createCustomTemplateField(
        'inspector',
        trilingual('Inspector', 'نام بازرس', 'ФИО инспектора'),
        'text',
        5,
        { required: true },
      ),
      createCustomTemplateField('shift', trilingual('Shift', 'شیفت', 'Смена'), 'radio', 6, {
        options: [
          { id: 'shift-morning', label: trilingual('Morning', 'صبح', 'Утро'), sortOrder: 1 },
          { id: 'shift-evening', label: trilingual('Evening', 'عصر', 'Вечер'), sortOrder: 2 },
        ],
      }),
      createCustomTemplateField(
        'supplier',
        trilingual('Supplier', 'تامین‌کننده', 'Поставщик'),
        'text',
        7,
        { required: true },
      ),
      createCustomTemplateField(
        'loading-location',
        trilingual('Loading Location', 'محل بارگیری', 'Место загрузки'),
        'text',
        8,
      ),
      createCustomTemplateField(
        'batch-number',
        trilingual('Batch/Lot No', 'شماره بچ', '№ партии'),
        'text',
        9,
      ),
      createCustomTemplateField(
        'health-certificate',
        trilingual('Health Certificate', 'گواهی بهداشت', 'Сертификат здоровья'),
        'text',
        10,
      ),
      createCustomTemplateField(
        'origin-country',
        trilingual('Origin Country', 'کشور مبدأ', 'Страна происхождения'),
        'text',
        11,
      ),
      createCustomTemplateField(
        'harvest-date',
        trilingual('Harvest Date', 'تاریخ برداشت', 'Дата сбора'),
        'date',
        12,
      ),
      createCustomTemplateField(
        'farm-code',
        trilingual('Farm/GAP Code', 'کد مزرعه', 'Код фермы / GAP'),
        'text',
        13,
      ),
      createCustomTemplateField(
        'cold-chain-start',
        trilingual('Cold Chain Start', 'شروع سرما', 'Начало холодовой цепи'),
        'time',
        14,
      ),
    ],
  },
  {
    id: 'iceberg-temperature',
    title: trilingual(
      '2. TEMPERATURE & ENVIRONMENTAL CONTROL',
      '۲. کنترل دما و محیط',
      '2. ТЕМПЕРАТУРНЫЙ КОНТРОЛЬ',
    ),
    description: trilingual(
      'Product & transport temperatures',
      'دمای محصول و حمل',
      'Температуры продукта и перевозки',
    ),
    sortOrder: 2,
    fields: [
      ...[
        [
          'cargo-front-temperature',
          trilingual('Cargo Area - Front', 'قسمت جلو', 'Передняя часть кузова'),
        ],
        [
          'surface-temperature',
          trilingual('Product Surface (Point 1)', 'سطح محصول', 'Поверхность продукта (точка 1)'),
        ],
        [
          'core-temperature',
          trilingual('Product Core (Sample)', 'مغز محصول (نمونه)', 'Сердцевина продукта (образец)'),
        ],
        [
          'cargo-middle-temperature',
          trilingual('Cargo Area - Middle', 'قسمت میانی', 'Средняя часть кузова'),
        ],
        [
          'cargo-rear-temperature',
          trilingual('Cargo Area - Rear', 'قسمت عقب', 'Задняя часть кузова'),
        ],
      ].map(([id, label], index) =>
        createCustomTemplateField(id!, label!, 'measurement', index + 1, {
          unit: '°C',
          standardValue: '+1°C to +3°C',
          required: index === 1 || index === 2,
        }),
      ),
      createCustomTemplateField(
        'relative-humidity',
        trilingual('Relative Humidity', 'رطوبت نسبی', 'Относительная влажность'),
        'measurement',
        6,
        {
          unit: '%',
          standardValue: '85% - 95%',
        },
      ),
      createCustomTemplateField(
        'ambient-temperature',
        trilingual('Ambient Temperature', 'دمای محیط', 'Температура окружающей среды'),
        'measurement',
        7,
        { unit: '°C', standardValue: trilingual('Record', 'ثبت', 'Записать') },
      ),
      createCustomTemplateField(
        'ambient-humidity',
        trilingual('Ambient Humidity', 'رطوبت محیط', 'Влажность окружающей среды'),
        'measurement',
        8,
        { unit: '%', standardValue: trilingual('Record', 'ثبت', 'Записать') },
      ),
      createCustomTemplateField(
        'equipment-checks',
        trilingual('2.2 Equipment & Conditions', 'تجهیزات و شرایط', '2.2 Оборудование и условия'),
        'table',
        9,
        {
          tableColumns: [
            {
              id: 'status',
              label: trilingual('Status', 'وضعیت', 'Статус'),
              type: 'select',
              options: inspectionResultOptions,
            },
            {
              id: 'comments',
              label: trilingual('Comments', 'توضیحات', 'Примечания'),
              type: 'text',
            },
          ],
          tableRows: [
            {
              id: 'refrigeration',
              label: trilingual('Refrigeration Unit', 'سیستم سرمایش', 'Холодильная установка'),
              helpText: trilingual('Stable operation', 'عملکرد پایدار', 'Стабильная работа'),
            },
            {
              id: 'condensation',
              label: trilingual(
                'Condensation on Pallets',
                'میعانات روی پالت',
                'Конденсат на палетах',
              ),
              helpText: trilingual('Absent', 'ندارد', 'Отсутствует'),
            },
            {
              id: 'air-circulation',
              label: trilingual('Air Circulation', 'گردش هوا', 'Циркуляция воздуха'),
              helpText: trilingual('Unobstructed', 'بدون مانع', 'Без препятствий'),
            },
            {
              id: 'vehicle-cleanliness',
              label: trilingual('Vehicle Cleanliness', 'تمیزی وسیله', 'Чистота транспорта'),
              helpText: trilingual('Clean, no odors', 'تمیز، بدون بو', 'Чисто, без запахов'),
            },
            {
              id: 'temperature-logger',
              label: trilingual('Temperature Logger', 'ثبت‌کننده دما', 'Терморегистратор'),
              helpText: trilingual(
                'Active & recording',
                'فعال و ثبت‌کننده',
                'Активен и записывает',
              ),
            },
          ],
        },
      ),
    ],
  },
  {
    id: 'iceberg-visual',
    title: trilingual(
      '3. VISUAL QUALITY INSPECTION',
      '۳. بازرسی کیفیت ظاهری',
      '3. ВИЗУАЛЬНАЯ ПРОВЕРКА',
    ),
    description: trilingual(
      'Criteria, result, severity and notes',
      'معیار، نتیجه، شدت و توضیحات',
      'Критерии, результат, критичность и примечания',
    ),
    sortOrder: 3,
    fields: [
      createCustomTemplateField(
        'visual-criteria',
        trilingual('Quality criteria', 'معیارهای کیفیت', 'Критерии качества'),
        'table',
        1,
        {
          required: true,
          tableColumns: [
            {
              id: 'result',
              label: trilingual('Result', 'نتیجه', 'Результат'),
              type: 'select',
              options: inspectionResultOptions,
            },
            {
              id: 'severity',
              label: trilingual('Severity', 'شدت', 'Критичность'),
              type: 'select',
              options: severityOptions,
            },
            { id: 'notes', label: trilingual('Notes', 'توضیحات', 'Примечания'), type: 'text' },
          ],
          tableRows: [
            {
              id: 'shape-density',
              label: trilingual('Shape & Density', 'شکل و تراکم', 'Форма и плотность'),
              helpText: trilingual(
                'Compact, round head',
                'کاهوی فشرده و گرد',
                'Плотный, округлый кочан',
              ),
            },
            {
              id: 'color',
              label: trilingual('Color', 'رنگ', 'Цвет'),
              helpText: trilingual('Uniform green', 'سبز یکنواخت', 'Равномерный зелёный'),
            },
            {
              id: 'mechanical-damage',
              label: trilingual('Mechanical Damage', 'آسیب مکانیکی', 'Механические повреждения'),
              helpText: trilingual(
                'No cracks, dents',
                'بدون ترک و فرورفتگی',
                'Без трещин и вмятин',
              ),
            },
            {
              id: 'wilting-pests',
              label: trilingual('Wilting / Pests', 'پژمردگی / آفات', 'Увядание / вредители'),
              helpText: trilingual(
                'Crisp, turgid leaves',
                'برگ‌های ترد و سفت',
                'Упругие, хрустящие листья',
              ),
            },
            {
              id: 'rot-mold',
              label: trilingual('Rot / Mold / Slime', 'پوسیدگی / کپک', 'Гниль / плесень / слизь'),
              helpText: trilingual(
                'Clean cut, dry, no mold',
                'برش تمیز، خشک',
                'Чистый срез, сухо, без плесени',
              ),
            },
            {
              id: 'foreign-matter',
              label: trilingual('Foreign Matter', 'مواد خارجی', 'Посторонние включения'),
              helpText: trilingual('No soil, insects', 'بدون خاک و حشره', 'Без земли и насекомых'),
            },
            {
              id: 'net-weight',
              label: trilingual('Weight (Netto)', 'وزن خالص', 'Вес нетто'),
              helpText: 'g ± 10%',
            },
            {
              id: 'diameter',
              label: trilingual('Head Diameter', 'قطر کاهو', 'Диаметр кочана'),
              helpText: 'cm',
            },
            {
              id: 'core-condition',
              label: trilingual('Core Condition', 'وضعیت مغز', 'Состояние сердцевины'),
              helpText: trilingual(
                'No browning, no rot',
                'بدون قهوه‌ای شدن و پوسیدگی',
                'Без потемнения и гнили',
              ),
            },
            {
              id: 'odor',
              label: trilingual('Odor', 'بو', 'Запах'),
              helpText: trilingual('Fresh, characteristic', 'تازه، مخصوص', 'Свежий, характерный'),
            },
          ],
        },
      ),
    ],
  },
  {
    id: 'iceberg-packaging',
    title: trilingual(
      '4. QUANTITY & PACKAGING CONTROL',
      '۴. کنترل تعداد و بسته‌بندی',
      '4. КОНТРОЛЬ КОЛИЧЕСТВА И УПАКОВКИ',
    ),
    description: trilingual(
      'Document comparison and packaging integrity',
      'مقایسه اسناد و سلامت بسته‌بندی',
      'Сверка документов и целостность упаковки',
    ),
    sortOrder: 4,
    fields: [
      createCustomTemplateField(
        'quantity-control',
        trilingual('Quantity & weight', 'تعداد و وزن', 'Количество и вес'),
        'table',
        1,
        {
          tableColumns: [
            { id: 'document', label: trilingual('Document', 'سند', 'Документ'), type: 'text' },
            { id: 'actual', label: trilingual('Actual', 'واقعی', 'Факт'), type: 'text' },
            { id: 'match', label: trilingual('Match', 'مطابقت', 'Совпадает'), type: 'checkbox' },
            { id: 'notes', label: trilingual('Notes', 'توضیحات', 'Примечания'), type: 'text' },
          ],
          tableRows: [
            {
              id: 'pallets',
              label: trilingual('Total Pallets', 'تعداد کل پالت‌ها', 'Всего палет'),
            },
            { id: 'boxes', label: trilingual('Total Boxes', 'تعداد کل کارتن‌ها', 'Всего коробок') },
            {
              id: 'boxes-per-pallet',
              label: trilingual('Boxes per Pallet', 'کارتن در پالت', 'Коробок на палете'),
            },
            {
              id: 'net-box',
              label: trilingual('Net Weight per Box', 'وزن خالص', 'Вес нетто коробки'),
            },
            {
              id: 'gross-box',
              label: trilingual('Gross Weight per Box', 'وزن ناخالص', 'Вес брутто коробки'),
            },
            {
              id: 'total-net',
              label: trilingual('Total Net Weight', 'وزن خالص کل', 'Общий вес нетто'),
            },
          ],
        },
      ),
      createCustomTemplateField(
        'packaging-integrity',
        trilingual('4.1 Packaging Integrity', '۴.۱ سلامت بسته‌بندی', '4.1 Целостность упаковки'),
        'table',
        2,
        {
          tableColumns: [
            {
              id: 'result',
              label: trilingual('Result', 'نتیجه', 'Результат'),
              type: 'select',
              options: inspectionResultOptions,
            },
            { id: 'notes', label: trilingual('Notes', 'توضیحات', 'Примечания'), type: 'text' },
          ],
          tableRows: [
            {
              id: 'box-condition',
              label: trilingual('Box Condition', 'وضعیت کارتن', 'Состояние коробок'),
              helpText: trilingual(
                'No tears, dents, deformation',
                'بدون پارگی و فرورفتگی',
                'Без разрывов, вмятин, деформации',
              ),
            },
            {
              id: 'dryness',
              label: trilingual('Packaging Dryness', 'خشکی بسته‌بندی', 'Сухость упаковки'),
              helpText: trilingual('No wet traces', 'بدون اثر رطوبت', 'Без следов намокания'),
            },
            {
              id: 'label',
              label: trilingual('Label Accuracy', 'صحت برچسب', 'Корректность этикетки'),
              helpText: trilingual(
                'Country, weight, date, origin',
                'کشور، وزن، تاریخ',
                'Страна, вес, дата, происхождение',
              ),
            },
            {
              id: 'barcode',
              label: trilingual('Barcode Quality', 'کیفیت بارکد', 'Качество штрихкода'),
              helpText: trilingual('All scannable', 'همه قابل اسکن', 'Все считываются'),
            },
            {
              id: 'advertising',
              label: trilingual(
                'Advertising information',
                'وجود اطلاعات تبلیغاتی',
                'Рекламная информация',
              ),
              helpText: trilingual(
                'No phone numbers, addresses or codes',
                'بدون شماره تلفن، آدرس یا کد',
                'Без номеров телефонов, адресов и кодов',
              ),
            },
          ],
        },
      ),
      createCustomTemplateField(
        'pallet-specification',
        trilingual(
          'Pallet & loading specification',
          'مشخصات پالت و بارگیری',
          'Спецификация палеты и загрузки',
        ),
        'table',
        3,
        {
          tableColumns: [
            {
              id: 'value',
              label: trilingual('Specification', 'مشخصات', 'Спецификация'),
              type: 'text',
            },
            { id: 'notes', label: trilingual('Notes', 'توضیحات', 'Примечания'), type: 'text' },
          ],
          tableRows: [
            {
              id: 'pallet-dimensions',
              label: trilingual('Pallet Dimensions', 'ابعاد پالت', 'Размеры палеты'),
              helpText: '100×120 cm / 80×120 cm / Other',
            },
            {
              id: 'pallet-material',
              label: trilingual('Pallet Material', 'جنس پالت', 'Материал палеты'),
              helpText: trilingual('Wood / Plastic', 'چوب / پلاستیک', 'Дерево / Пластик'),
            },
            {
              id: 'boxes-per-pallet',
              label: trilingual('Boxes per Pallet', 'کارتن در پالت', 'Коробок на палете'),
            },
            {
              id: 'loading-time',
              label: trilingual('Loading Time', 'زمان بارگیری', 'Время загрузки'),
              helpText: trilingual('Start / End', 'شروع / پایان', 'Начало / Окончание'),
            },
            {
              id: 'load-stability',
              label: trilingual('Load Stability', 'پایداری بار', 'Устойчивость груза'),
              helpText: trilingual(
                'Stable / Unstable',
                'پایدار / ناپایدار',
                'Устойчивая / Неустойчивая',
              ),
            },
            {
              id: 'max-stack-height',
              label: trilingual(
                'Max Stack Height',
                'حداکثر ارتفاع چیدمان',
                'Максимальная высота штабеля',
              ),
            },
            {
              id: 'logger',
              label: trilingual('Temperature Logger', 'ثبت‌کننده دما', 'Терморегистратор'),
              helpText: trilingual(
                'Present / Active / Absent / ID',
                'موجود / فعال / ناموجود / شناسه',
                'Присутствует / Активен / Отсутствует / ID',
              ),
            },
          ],
        },
      ),
    ],
  },
  {
    id: 'iceberg-laboratory',
    title: trilingual(
      '6. LABORATORY TESTS (if required)',
      '۶. آزمایشات آزمایشگاهی',
      '6. ЛАБОРАТОРНЫЕ АНАЛИЗЫ (при необходимости)',
    ),
    description: trilingual(
      'Fill in when a laboratory test is required',
      'در صورت نیاز به آزمایش',
      'Заполняется при необходимости лабораторного анализа',
    ),
    sortOrder: 5,
    fields: [
      createCustomTemplateField(
        'nitrate-test',
        trilingual('Nitrate Content', 'محتوای نیترات', 'Содержание нитратов'),
        'table',
        1,
        {
          tableColumns: [
            { id: 'method', label: trilingual('Method', 'روش', 'Метод'), type: 'text' },
            {
              id: 'result',
              label: trilingual('Result', 'نتیجه', 'Результат'),
              type: 'select',
              options: inspectionResultOptions,
            },
            {
              id: 'value',
              label: trilingual('Standard', 'استاندارد', 'Норма'),
              type: 'number',
              unit: 'mg/kg',
            },
            {
              id: 'lab-ref',
              label: trilingual('Lab Ref', 'شماره آزمایشگاه', '№ лаборатории'),
              type: 'text',
            },
          ],
          tableRows: [
            {
              id: 'nitrate',
              label: trilingual('Nitrate Content', 'محتوای نیترات', 'Содержание нитратов'),
              helpText: 'HPLC / Spectrophotometry / ≤ 3 000 mg/kg',
            },
          ],
        },
      ),
      createCustomTemplateField(
        'laboratory-notes',
        trilingual('Notes', 'توضیحات', 'Примечания'),
        'textarea',
        2,
      ),
    ],
  },
  {
    id: 'iceberg-decision',
    title: trilingual(
      '7. FINAL DECISION & DISPOSITION',
      '۷. تصمیم نهایی و اقدام',
      '7. ИТОГОВОЕ РЕШЕНИЕ',
    ),
    description: trilingual(
      'Quality categories and shipment decision',
      'دسته‌بندی کیفیت و تصمیم ارسال',
      'Категории качества и решение по отгрузке',
    ),
    sortOrder: 6,
    fields: [
      createCustomTemplateField(
        'category-distribution',
        trilingual(
          'Iceberg Lettuce category distribution',
          'دسته‌بندی کاهو آیسبرگ',
          'Распределение салата Айсберг',
        ),
        'table',
        1,
        {
          tableColumns: [
            {
              id: 'first',
              label: trilingual('1st category', 'درجه یک', '1-я категория'),
              type: 'number',
              unit: '%',
            },
            {
              id: 'second',
              label: trilingual('2nd category', 'درجه دو', '2-я категория'),
              type: 'number',
              unit: '%',
            },
            {
              id: 'non-standard',
              label: trilingual('Non-standard', 'غیر استاندارد', 'Нестандарт'),
              type: 'number',
              unit: '%',
            },
            {
              id: 'waste',
              label: trilingual('Waste', 'ضایعات', 'Отход'),
              type: 'number',
              unit: '%',
            },
          ],
          tableRows: [
            { id: 'iceberg', label: trilingual('Iceberg Lettuce', 'کاهو آیسبرگ', 'Салат Айсберг') },
          ],
        },
      ),
      createCustomTemplateField(
        'caliber-deviation',
        trilingual(
          'Caliber / specified-caliber deviation',
          'کالیبر / عدم انطباق با کالیبر مشخص شده',
          'Калибр / несоответствие указанному калибру',
        ),
        'text',
        2,
        { width: 'full' },
      ),
      createCustomTemplateField(
        'final-decision',
        trilingual('Final decision', 'تصمیم نهایی', 'Итоговое решение'),
        'radio',
        3,
        {
          required: true,
          width: 'full',
          options: [
            {
              id: 'decision-accepted',
              label: trilingual(
                'ACCEPTED - Release for shipment',
                'قبول شد - آزاد برای ارسال',
                'ПРИНЯТО - Отгрузка разрешена',
              ),
              sortOrder: 1,
            },
            {
              id: 'decision-conditional',
              label: trilingual(
                'CONDITIONAL - With remarks below',
                'مشروط - با ملاحظات زیر',
                'УСЛОВНО - С замечаниями ниже',
              ),
              sortOrder: 2,
            },
            {
              id: 'decision-rejected',
              label: trilingual('REJECTED - Quarantine', 'رد شد - قرنطینه', 'ОТКЛОНЕНО - Карантин'),
              sortOrder: 3,
            },
          ],
        },
      ),
      createCustomTemplateField(
        'decision-notes',
        trilingual('Remarks', 'ملاحظات', 'Замечания'),
        'textarea',
        4,
      ),
    ],
  },
  {
    id: 'iceberg-authorization',
    title: trilingual('8. AUTHORIZATION', '۸. تاییدیه', '8. УТВЕРЖДЕНИЕ'),
    description: trilingual(
      'Name, signature, date and stamp',
      'نام، امضا، تاریخ و مهر',
      'Имя, подпись, дата и печать',
    ),
    sortOrder: 7,
    fields: [
      createCustomTemplateField(
        'inspector-signature',
        trilingual('Inspector', 'بازرس', 'Инспектор'),
        'signature',
        1,
        { required: true },
      ),
      createCustomTemplateField(
        'customer-representative',
        trilingual('Customer Rep. (if present)', 'نماینده مشتری', 'Представитель заказчика'),
        'text',
        2,
      ),
      createCustomTemplateField(
        'warehouse-representative',
        trilingual('Warehouse Rep.', 'نماینده انبار', 'Представитель склада'),
        'text',
        3,
      ),
      createCustomTemplateField('driver', trilingual('Driver', 'راننده', 'Водитель'), 'text', 4),
      createCustomTemplateField(
        'qc-manager',
        trilingual('QC Manager', 'مدیر QC', 'Руководитель ОТК'),
        'text',
        5,
      ),
      createCustomTemplateField('report-date', trilingual('Date', 'تاریخ', 'Дата'), 'date', 6, {
        required: true,
      }),
    ],
  },
  {
    id: 'iceberg-photos',
    title: trilingual('9. PHOTO DOCUMENTATION', '۹. مستندات تصویری', '9. ФОТОДОКУМЕНТАЦИЯ'),
    description: trilingual(
      'Attach photos to the required evidence slots',
      'تصاویر را در محل‌های لازم پیوست کنید',
      'Прикрепите фотографии в требуемые слоты',
    ),
    sortOrder: 8,
    fields: [
      createCustomTemplateField(
        'photo-log',
        trilingual('Photo evidence log', 'فهرست شواهد تصویری', 'Журнал фотодоказательств'),
        'table',
        1,
        {
          tableColumns: [
            { id: 'time', label: trilingual('Time', 'ساعت', 'Время'), type: 'text' },
            { id: 'initials', label: trilingual('Initial', 'امضا', 'Инициалы'), type: 'text' },
          ],
          tableRows: [
            {
              id: 'product-temperature',
              label: trilingual(
                'Product temperature measurement',
                'اندازه‌گیری دمای محصول',
                'Измерение температуры продукта',
              ),
            },
            {
              id: 'vehicle-cargo-area',
              label: trilingual(
                'Vehicle cargo area',
                'قسمت بار وسیله نقلیه',
                'Грузовой отсек транспорта',
              ),
            },
            {
              id: 'pallet-loading',
              label: trilingual(
                'Pallet loading condition',
                'وضعیت بارگیری پالت',
                'Состояние загрузки палет',
              ),
            },
            {
              id: 'product-sample',
              label: trilingual(
                'Product sample (opened box)',
                'نمونه کارتن (محصول باز)',
                'Образец продукта (открытая коробка)',
              ),
            },
            {
              id: 'label-barcode',
              label: trilingual(
                'Label/barcode close-up',
                'برچسب/بارکد از نزدیک',
                'Этикетка/штрихкод крупным планом',
              ),
            },
            { id: 'other', label: trilingual('Other', 'سایر', 'Другое') },
          ],
        },
      ),
      createCustomTemplateField(
        'photo-product-temperature',
        trilingual(
          'Product temperature measurement',
          'اندازه‌گیری دمای محصول',
          'Измерение температуры продукта',
        ),
        'photo',
        2,
        { required: true },
      ),
      createCustomTemplateField(
        'photo-vehicle',
        trilingual('Vehicle cargo area', 'قسمت بار وسیله نقلیه', 'Грузовой отсек транспорта'),
        'photo',
        3,
        { required: true },
      ),
      createCustomTemplateField(
        'photo-loading',
        trilingual('Pallet loading condition', 'وضعیت بارگیری پالت', 'Состояние загрузки палет'),
        'photo',
        4,
      ),
      createCustomTemplateField(
        'photo-product',
        trilingual(
          'Product sample (opened box)',
          'نمونه کارتن (محصول باز)',
          'Образец продукта (открытая коробка)',
        ),
        'photo',
        5,
      ),
      createCustomTemplateField(
        'photo-label',
        trilingual(
          'Label/barcode close-up',
          'برچسب/بارکد از نزدیک',
          'Этикетка/штрихкод крупным планом',
        ),
        'photo',
        6,
      ),
      createCustomTemplateField('photo-other', trilingual('Other', 'سایر', 'Другое'), 'photo', 7),
    ],
  },
]
