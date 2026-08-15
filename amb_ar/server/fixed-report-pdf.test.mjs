import assert from 'node:assert/strict'
import test from 'node:test'

import { generateTemplateReportPdf } from './branded-report-pdf.mjs'

test('the fixed report style keeps the logo on page one and renders editor tables as vectors', async () => {
  const report = {
    id: 'report-fixed-style',
    inspectorName: 'Иванов Иван Иванович',
    productName: 'Тестовый товар',
    updatedAt: Date.UTC(2026, 7, 7),
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
