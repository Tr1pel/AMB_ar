import assert from 'node:assert/strict'
import test from 'node:test'

import { generateTemplateReportPdf } from './branded-report-pdf.mjs'

test('the fixed report style keeps the logo on page one and renders editor tables as vectors', async () => {
  const report = {
    id: 'report-fixed-style',
    inspectorName: 'Иванов Иван Иванович',
    productName: 'Тестовый товар',
    updatedAt: Date.UTC(2026, 7, 7),
    reportNumber: 'AMB-QC-MSC01-20260817-0001',
    mainInfo: { orderNumber: 'TEST-001' },
    customFieldValues: {
      'custom.table': {
        first: { result: 'Соответствует', note: 'Без замечаний' },
        second: { result: 'Не соответствует', note: 'Повреждение упаковки' },
      },
    },
  }
  const firstSection = {
    id: 'section-main',
    title: 'Основные сведения',
    description: '',
    fields: [
      {
        id: 'field-order',
        label: 'Номер заказа',
        type: 'text',
        width: 'half',
        dataPath: 'mainInfo.orderNumber',
      },
    ],
  }
  const secondSection = {
    id: 'section-table',
    title: 'Контроль качества',
    description: '',
    fields: [
      {
        id: 'field-table',
        label: 'Результаты проверки',
        type: 'table',
        width: 'full',
        dataPath: 'custom.table',
        tableRows: [
          { id: 'first', label: 'Параметр 1' },
          { id: 'second', label: 'Параметр 2' },
        ],
        tableColumns: [
          { id: 'result', label: 'Результат' },
          { id: 'note', label: 'Примечание' },
        ],
      },
    ],
  }
  const template = {
    id: 'document-template-custom',
    name: 'Единый фирменный макет',
    description: 'Инспекция качества и условий отгрузки',
    inputSchema: { version: 1, steps: [firstSection, secondSection] },
    renderSpec: {
      version: 1,
      mode: 'flow',
      layout: 'branded',
      pageSize: 'A4',
      documentTitle: 'Отчёт о контроле качества',
      sections: [
        createRenderSection(firstSection, false),
        createRenderSection(secondSection, true),
      ],
    },
  }

  const pdf = await generateTemplateReportPdf({ report, photos: [], template })
  const source = pdf.toString('latin1')
  const pageCount = source.match(/\/Type\s*\/Page\b/g)?.length ?? 0
  const imageCount = source.match(/\/Subtype\s*\/Image\b/g)?.length ?? 0

  assert.equal(pageCount, 2)
  assert.equal(imageCount, 1)
  assert.match(source, /\/Font\s*<</)
})

test('system and user templates use the same fixed renderer', async () => {
  const section = {
    id: 'section',
    title: 'Раздел',
    description: '',
    fields: [
      {
        id: 'field',
        label: 'Поле редактора',
        type: 'text',
        width: 'full',
        dataPath: 'mainInfo.orderNumber',
      },
    ],
  }
  const report = {
    id: 'report-legacy-layout',
    inspectorName: 'Инспектор',
    productName: 'Товар',
    updatedAt: Date.UTC(2026, 7, 7),
    mainInfo: { orderNumber: 'TEST-002' },
  }

  for (const templateId of [
    'document-template-bell-pepper-inspection',
    'document-template-user-defined',
  ]) {
    const template = {
      id: templateId,
      name: 'Макет',
      inputSchema: { version: 1, steps: [section] },
      renderSpec: {
        version: 1,
        mode: 'flow',
        layout: 'branded',
        pageSize: 'A4',
        documentTitle: 'Отчёт',
        sections: [createRenderSection(section, false)],
      },
    }
    const pdf = await generateTemplateReportPdf({ report, photos: [], template })
    const source = pdf.toString('latin1')

    assert.equal(source.match(/\/Type\s*\/Page\b/g)?.length ?? 0, 1)
    assert.equal(source.match(/\/Subtype\s*\/Image\b/g)?.length ?? 0, 1)
  }
})

test('a photo field fits six photos on one page and moves the seventh to the next page', async () => {
  const photoField = {
    id: 'field-photos',
    label: 'Фотографии партии',
    type: 'photo',
    width: 'full',
    dataPath: 'photos',
  }
  const section = {
    id: 'section-photos',
    title: 'Фотографии',
    description: '',
    fields: [photoField],
  }
  const template = {
    id: 'document-template-photos',
    name: 'Фотоотчёт',
    inputSchema: { version: 1, steps: [section] },
    renderSpec: {
      version: 1,
      mode: 'flow',
      layout: 'branded',
      pageSize: 'A4',
      documentTitle: 'Фотоотчёт',
      sections: [createRenderSection(section, false)],
    },
  }
  const report = {
    id: 'report-six-photos',
    reportNumber: 'AMB-QC-MSC01-20260818-0001',
    inspectorName: 'Инспектор',
    productName: 'Товар',
    updatedAt: Date.UTC(2026, 7, 18),
    mainInfo: {},
  }
  const imageBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
  const photos = Array.from({ length: 7 }, (_, index) => ({
    id: `photo-${index + 1}`,
    templateFieldId: photoField.id,
    fileName: `photo-${index + 1}.png`,
    blobBase64: imageBase64,
    caption: `Фотография ${index + 1}`,
    createdAt: Date.UTC(2026, 7, 18),
  }))

  const sixPhotoPdf = await generateTemplateReportPdf({
    report,
    photos: photos.slice(0, 6),
    template,
  })
  const sevenPhotoPdf = await generateTemplateReportPdf({ report, photos, template })

  assert.equal(sixPhotoPdf.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length ?? 0, 1)
  assert.equal(sevenPhotoPdf.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length ?? 0, 2)
})

test('a repeating photo field prints every product instance on its own page', async () => {
  const photoField = {
    id: 'field-instances',
    label: 'Экземпляры товара',
    type: 'repeatingPhoto',
    width: 'full',
    dataPath: 'custom.instances',
  }
  const section = {
    id: 'section-instances',
    title: 'Проверка экземпляров',
    description: '',
    fields: [photoField],
  }
  const template = {
    id: 'document-template-instances',
    name: 'Фотоотчёт',
    inputSchema: { version: 1, steps: [section] },
    renderSpec: {
      version: 1,
      mode: 'flow',
      layout: 'branded',
      pageSize: 'A4',
      documentTitle: 'Фотоотчёт',
      sections: [createRenderSection(section, false)],
    },
  }
  const report = {
    id: 'report-instances',
    reportNumber: 'AMB-QC-MSC01-20260818-0002',
    inspectorName: 'Инспектор',
    productName: 'Товар',
    updatedAt: Date.UTC(2026, 7, 18),
    mainInfo: {},
    customFieldValues: {
      'custom.instances': [
        { id: 'instance-1', name: 'Экземпляр 1', sortOrder: 1 },
        { id: 'instance-2', name: 'Экземпляр 2', sortOrder: 2 },
      ],
    },
  }
  const imageBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
  const photos = ['instance-1', 'instance-2'].map((repeatingPhotoBlockId, index) => ({
    id: `instance-photo-${index + 1}`,
    templateFieldId: photoField.id,
    repeatingPhotoBlockId,
    fileName: `instance-photo-${index + 1}.png`,
    blobBase64: imageBase64,
    caption: '',
    createdAt: Date.UTC(2026, 7, 18),
  }))

  const pdf = await generateTemplateReportPdf({ report, photos, template })

  assert.equal(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length ?? 0, 2)
})

function createRenderSection(section, pageBreakBefore) {
  return {
    id: `render-${section.id}`,
    inputSectionId: section.id,
    title: section.title,
    pageBreakBefore,
    columns: 2,
    showDescription: true,
    hidden: false,
    fields: section.fields.map((field) => ({
      dataPath: field.dataPath,
      label: field.label,
      width: field.width,
      display: field.type === 'table' ? 'table' : 'value',
      hideWhenEmpty: false,
      hidden: false,
    })),
  }
}
