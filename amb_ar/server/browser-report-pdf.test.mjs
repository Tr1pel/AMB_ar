import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import PDFDocument from 'pdfkit/js/pdfkit.standalone.js'

import {
  generateTemplateReportPdf,
  getPdfFieldLabel,
} from '../src/shared/reports/branded-report-pdf-core.mjs'

test('the browser PDFKit bundle generates the shared report layout', async () => {
  const [regularFont, boldFont, logo] = await Promise.all([
    readFile(new URL('../node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf', import.meta.url)),
    readFile(new URL('../node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf', import.meta.url)),
    readFile(new URL('../public/runash-report-logo.jpeg', import.meta.url)),
  ])
  const section = {
    id: 'section-main',
    title: 'Основная информация',
    description: '',
    sortOrder: 1,
    fields: [
      {
        id: 'field-product',
        dataPath: 'mainInfo.productName',
        label: 'Продукт',
        type: 'text',
        required: true,
        placeholder: '',
        helpText: '',
        translations: {
          ru: { label: 'Продукт', placeholder: 'Введите продукт', helpText: 'Название товара' },
          en: { label: 'Product', placeholder: 'Enter product', helpText: 'Product name' },
          fa: { label: 'محصول', placeholder: 'محصول را وارد کنید', helpText: 'نام محصول' },
        },
        width: 'full',
        sortOrder: 1,
        options: [],
      },
    ],
  }
  const template = {
    templateId: 'test-template',
    name: 'Проверка браузерного PDF',
    inputSchema: { version: 1, steps: [section] },
    renderSpec: {
      version: 1,
      mode: 'flow',
      layout: 'branded',
      pageSize: 'A4',
      documentTitle: 'QUALITY INSPECTION REPORT',
      sections: [
        {
          id: 'render-main',
          inputSectionId: section.id,
          title: section.title,
          pageBreakBefore: false,
          columns: 1,
          showDescription: false,
          fields: [
            {
              dataPath: 'mainInfo.productName',
              label: 'Продукт',
              width: 'full',
              display: 'value',
              hideWhenEmpty: false,
            },
          ],
        },
      ],
    },
    sections: [section],
  }
  const report = {
    id: 'report-browser-test',
    reportNumber: 'LOCAL-browser-test',
    productName: 'Перец красный сладкий',
    inspectorName: 'Тестовый инспектор',
    mainInfo: { productName: 'Перец красный сладкий' },
    updatedAt: Date.now(),
  }
  const bytes = await generateTemplateReportPdf({
    report,
    photos: [],
    template,
    PDFDocument,
    regularFont,
    boldFont,
    logo,
    binaryAdapter: toArrayBuffer,
  })

  assert.ok(bytes.byteLength > 1_000)
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 5)), '%PDF-')
  assert.equal(
    getPdfFieldLabel(section.fields[0], template.renderSpec.sections[0].fields[0]),
    'Продукт / Product / محصول',
  )
})

function toArrayBuffer(value) {
  const result = new ArrayBuffer(value.byteLength)
  new Uint8Array(result).set(value)
  return result
}
