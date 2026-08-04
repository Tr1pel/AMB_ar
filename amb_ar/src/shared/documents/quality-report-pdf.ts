import { documentTemplateRepository } from '@/shared/repositories/document-template-repository'
import type {
  DocumentTemplate,
  DocumentTemplateSnapshot,
  DocumentTemplateField,
  ProductPhoto,
  ReportDraft,
  ReportPhotoCategory,
} from '@/types/report'

interface PdfPageImage {
  width: number
  height: number
  bytes: Uint8Array
}

interface DrawState {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  scale: number
  y: number
  pages: PdfPageImage[]
}

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const PAGE_MARGIN = 42
const PAGE_SCALE = 2
const LINE_HEIGHT = 16
const JPEG_QUALITY = 0.92

const PHOTO_CATEGORIES: Array<{ id: ReportPhotoCategory; title: string; subtitle: string }> = [
  { id: 'vehicle', title: 'Vehicle', subtitle: 'Транспортное средство' },
  { id: 'temperature', title: 'Temperature', subtitle: 'Температура' },
  { id: 'facade', title: 'Facade', subtitle: 'Аллея' },
  { id: 'selection', title: 'Selection', subtitle: 'ГСЗ' },
  { id: 'goods', title: 'Goods', subtitle: 'Общий вид товара' },
  { id: 'destructiveTesting', title: 'Destructive testing', subtitle: 'Разрушающий контроль' },
  { id: 'caliber', title: 'Caliber', subtitle: 'Калибр' },
  { id: 'waste', title: 'Waste', subtitle: 'Отход' },
  { id: 'notStandard', title: 'Not correspond to the standard', subtitle: 'Нестандарт' },
]

export async function generateQualityReportPdf(
  report: ReportDraft,
  photos: ProductPhoto[],
): Promise<Blob> {
  const state = createDrawState()
  const template =
    report.templateSnapshot ??
    (report.templateId ? await documentTemplateRepository.getById(report.templateId) : null)

  if (template) {
    await drawConfiguredTemplate(state, report, photos, template)
    return buildPdfBlob(state.pages)
  }

  drawCoverPage(state, report)
  await finishPage(state)
  drawTemperatureAndResultsPage(state, report)
  await finishPage(state)
  drawDescriptionPage(state, report)
  await finishPage(state)
  drawSamplingPage(state, report)
  await finishPage(state)

  for (const category of PHOTO_CATEGORIES) {
    await drawPhotoCategoryPage(state, category.id, category.title, category.subtitle, photos)
    await finishPage(state)
  }

  drawFinalPage(state, report)
  await finishPage(state)

  return buildPdfBlob(state.pages)
}

async function drawConfiguredTemplate(
  state: DrawState,
  report: ReportDraft,
  photos: ProductPhoto[],
  template: DocumentTemplate | DocumentTemplateSnapshot,
): Promise<void> {
  const sections = [...template.sections].sort(
    (firstSection, secondSection) => firstSection.sortOrder - secondSection.sortOrder,
  )

  for (const section of sections) {
    const fields = [...section.fields]
      .sort((firstField, secondField) => firstField.sortOrder - secondField.sortOrder)
      .filter((field) => field.type !== 'photo')

    if (!fields.length) {
      continue
    }

    resetPage(state)
    drawSectionTitle(state, section.title)

    if (section.description) {
      drawMultilineText(state, section.description, PAGE_MARGIN, state.y, 528, 11, '#6b7280')
      state.y += 18
    }

    drawRows(
      state,
      fields.map((field) => [
        `${field.label}${field.required ? ' *' : ''}`,
        getTemplateFieldValue(report, field),
      ]),
    )
    await finishPage(state)
  }

  const photoFields = sections.flatMap((section) =>
    [...section.fields]
      .sort((firstField, secondField) => firstField.sortOrder - secondField.sortOrder)
      .filter((field) => field.type === 'photo' || field.dataPath === 'photos'),
  )

  for (const [fieldIndex, field] of photoFields.entries()) {
    const fieldPhotos = photos.filter(
      (photo) =>
        photo.templateFieldId === field.id ||
        (!photo.templateFieldId && fieldIndex === 0),
    )

    await drawPhotoPage(state, field.label, field.helpText, fieldPhotos)
    await finishPage(state)
  }
}

function getTemplateFieldValue(report: ReportDraft, field: DocumentTemplateField): string {
  if (field.type === 'signature') {
    return report.inspectorName
  }

  if (field.dataPath.startsWith('custom.')) {
    return report.customFieldValues?.[field.dataPath] ?? ''
  }

  const pathParts = field.dataPath.split('.')
  let value: unknown = report

  for (const pathPart of pathParts) {
    if (!value || typeof value !== 'object' || !(pathPart in value)) {
      return ''
    }

    value = (value as Record<string, unknown>)[pathPart]
  }

  if (field.dataPath === 'sampling.points' && Array.isArray(value)) {
    return value
      .map((point) => {
        if (!point || typeof point !== 'object') {
          return ''
        }

        const record = point as Record<string, unknown>
        return `${String(record.pallet ?? '')}: ${String(record.place ?? '')}`
      })
      .filter(Boolean)
      .join(', ')
  }

  if (typeof value === 'string' || typeof value === 'number') {
    if (field.type === 'date' && typeof value === 'string') {
      return formatDate(value)
    }

    return String(value)
  }

  return ''
}

function createDrawState(): DrawState {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Canvas is not available')
  }

  canvas.width = PAGE_WIDTH * PAGE_SCALE
  canvas.height = PAGE_HEIGHT * PAGE_SCALE
  context.scale(PAGE_SCALE, PAGE_SCALE)

  return {
    canvas,
    context,
    scale: PAGE_SCALE,
    y: PAGE_MARGIN,
    pages: [],
  }
}

function resetPage(state: DrawState): void {
  state.context.fillStyle = '#ffffff'
  state.context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT)
  state.context.fillStyle = '#111827'
  state.context.textBaseline = 'top'
  state.y = PAGE_MARGIN
}

async function finishPage(state: DrawState): Promise<void> {
  const dataUrl = state.canvas.toDataURL('image/jpeg', JPEG_QUALITY)

  state.pages.push({
    width: state.canvas.width,
    height: state.canvas.height,
    bytes: decodeBase64DataUrl(dataUrl),
  })
  resetPage(state)
}

function drawCoverPage(state: DrawState, report: ReportDraft): void {
  resetPage(state)
  drawCenteredText(state, 'Quality inspection report', 22, 76, true)
  drawCenteredText(state, 'Отчет об осмотре груза на качество', 16, 106, false)
  state.y = 150
  drawRows(state, [
    ['Number of order / Номер заказа', report.mainInfo.orderNumber],
    ['ZOST', report.mainInfo.zost],
    ['Shipper / Поставщик', report.mainInfo.shipper],
    ['Trailer N / Прицеп N', report.mainInfo.trailerNumber],
    ['Place of survey / Место инспекции', report.mainInfo.placeOfSurvey],
    ['Name of product / Наименование товара', report.mainInfo.productName],
    ['Package / Фасовка', report.mainInfo.packageName],
    ['PLU', report.mainInfo.plu],
    ['Date of opening / Дата открытия', formatDate(report.mainInfo.openingDate)],
    ['Date of survey / Дата инспекции', formatDate(report.mainInfo.surveyDate)],
    ['Kind of packing / Вид упаковки', report.mainInfo.packingKind],
    ['Marking of boxes / Маркировка на коробках', report.mainInfo.boxMarking],
  ])
}

function drawTemperatureAndResultsPage(state: DrawState, report: ReportDraft): void {
  resetPage(state)
  drawSectionTitle(state, 'Data on temperature and seals / Данные по температуре и пломбам')
  drawRows(state, [
    ['Storage temperature / Рекомендованная температура', report.temperatureInfo.storageTemperature],
    ['Of pulp at the time of opening / Пульпа при открытии', report.temperatureInfo.pulpTemperature],
    ['Temperature violation / Нарушение', report.temperatureInfo.temperatureViolation],
    ['Seal / Пломба', report.temperatureInfo.sealNumber],
    ['Thermographs presence / Наличие термографов', report.temperatureInfo.thermographPresence],
    ['Thermographs violation / Нарушение термографов', report.temperatureInfo.thermographViolation],
  ])
  state.y += 20
  drawSectionTitle(state, 'Results of inspection / Результаты инспекции')
  drawRows(state, [
    ['Correspond to the 1st cat. / Соответствует 1 категории', report.inspectionResults.firstCategoryPercent],
    ['Not correspond to standard for 1st cat. / Нестандарт для 1 категории', report.inspectionResults.firstCategoryNonStandardPercent],
    ['Not correspond to standard for 2nd cat. / Нестандарт для 2 категории', report.inspectionResults.secondCategoryNonStandardPercent],
    ['Waste / Отход', report.inspectionResults.wastePercent],
    ['Density / Плотность', report.inspectionResults.density],
    ['Brix / Сахар', report.inspectionResults.brix],
    ['Caliber / Калибр', report.inspectionResults.caliber],
    ['Correspondence of caliber to passport / Соответствие калибра ПК', report.inspectionResults.caliberPassportMatch],
    ['Not correspond to caliber / Не соответствует калибру', report.inspectionResults.caliberMismatch],
    ['Variety / Сорт', report.inspectionResults.variety],
    ['Correspondence of variety to passport / Соответствие сорта ПК', report.inspectionResults.varietyPassportMatch],
  ])
}

function drawDescriptionPage(state: DrawState, report: ReportDraft): void {
  resetPage(state)
  drawSectionTitle(state, 'Description / Описание')
  drawParagraphBlock(
    state,
    'Not correspond to requirements of standard for 2nd class',
    report.descriptions.secondClassDefects,
  )
  drawParagraphBlock(state, 'Waste / Отход', report.descriptions.waste)
  drawParagraphBlock(
    state,
    'Not correspond to the CALIBER / Не соответствует калибру',
    report.descriptions.caliberMismatch,
  )
  state.y += 14
  drawSectionTitle(state, 'Conclusion of Expert / Заключение эксперта')
  drawMultilineText(state, displayValue(report.expertConclusion), PAGE_MARGIN, state.y, 528, 13)
}

function drawSamplingPage(state: DrawState, report: ReportDraft): void {
  resetPage(state)
  drawSectionTitle(state, 'Random value generator / Генератор случайных значений')
  drawText(state, `Seed: ${report.sampling.seed}`, PAGE_MARGIN, state.y, 11, '#6b7280', false)
  state.y += 28

  const midpoint = Math.ceil(report.sampling.points.length / 2)
  const columns = [report.sampling.points.slice(0, midpoint), report.sampling.points.slice(midpoint)]

  columns.forEach((points, columnIndex) => {
    const x = PAGE_MARGIN + columnIndex * 264
    let y = state.y

    drawText(state, 'Палета', x, y, 11, '#4b5563', true)
    drawText(state, 'Место', x + 76, y, 11, '#4b5563', true)
    y += 24

    points.forEach((point) => {
      drawText(state, point.pallet, x, y, 12, '#111827', false)
      drawText(state, point.place, x + 76, y, 12, '#111827', false)
      drawLine(state, x, y + 18, x + 230, y + 18)
      y += 28
    })
  })
}

async function drawPhotoCategoryPage(
  state: DrawState,
  category: ReportPhotoCategory,
  title: string,
  subtitle: string,
  photos: ProductPhoto[],
): Promise<void> {
  await drawPhotoPage(
    state,
    title,
    subtitle,
    photos.filter((photo) => photo.category === category),
  )
}

async function drawPhotoPage(
  state: DrawState,
  title: string,
  subtitle: string,
  photos: ProductPhoto[],
): Promise<void> {
  resetPage(state)
  drawSectionTitle(state, title)

  if (subtitle) {
    drawText(state, subtitle, PAGE_MARGIN, state.y, 12, '#4b5563', false)
    state.y += 28
  }

  if (!photos.length) {
    drawText(state, 'Фото не добавлены.', PAGE_MARGIN, state.y, 13, '#6b7280', false)
    return
  }

  for (const photo of photos.slice(0, 2)) {
    const bitmap = await createImageBitmap(photo.blob)
    const imageBoxHeight = photos.length > 1 ? 260 : 560

    drawContainedImage(state, bitmap, PAGE_MARGIN, state.y, 528, imageBoxHeight)
    state.y += imageBoxHeight + 10
    drawMultilineText(state, photo.caption || photo.fileName, PAGE_MARGIN, state.y, 528, 11, '#4b5563')
    state.y += 28
    bitmap.close()
  }
}

function drawFinalPage(state: DrawState, report: ReportDraft): void {
  resetPage(state)
  drawParagraph(
    state,
    'The photos attached show the amount of rotten and affected fruits as well as general cargo condition.',
  )
  drawParagraph(
    state,
    'Прикрепленные фотографии показывают количество гнилых и пораженных плодов, а также общее состояние груза.',
  )
  drawParagraph(
    state,
    'The report above reflects our findings at the time, date and place of inspection only and does not refer to any other matter.',
  )
  state.y += 44
  drawRows(state, [
    ['Report issued / Отчет издан', formatDate(report.signatures.reportIssuedDate)],
    ['Expert / Эксперт', report.signatures.expertName],
    ["Retail's representative / Менеджер ОКК ТС", report.signatures.retailRepresentativeName],
  ])
}

function drawRows(state: DrawState, rows: Array<[string, string]>): void {
  rows.forEach(([label, value]) => {
    const rowY = state.y
    const labelLines = wrapText(state, label, 216, 11)
    const valueLines = wrapText(state, displayValue(value), 288, 12)
    const rowHeight = Math.max(labelLines.length, valueLines.length) * LINE_HEIGHT + 12

    drawWrappedLines(state, labelLines, PAGE_MARGIN, rowY + 6, 11, '#4b5563', true)
    drawWrappedLines(state, valueLines, PAGE_MARGIN + 236, rowY + 6, 12, '#111827', false)
    drawLine(state, PAGE_MARGIN, rowY + rowHeight, PAGE_WIDTH - PAGE_MARGIN, rowY + rowHeight)
    state.y += rowHeight
  })
}

function drawParagraphBlock(state: DrawState, title: string, content: string): void {
  drawText(state, title, PAGE_MARGIN, state.y, 12, '#4b5563', true)
  state.y += 20
  drawMultilineText(state, displayValue(content), PAGE_MARGIN, state.y, 528, 13)
  state.y += 28
}

function drawParagraph(state: DrawState, content: string): void {
  drawMultilineText(state, content, PAGE_MARGIN, state.y, 528, 13)
  state.y += 26
}

function drawSectionTitle(state: DrawState, title: string): void {
  drawText(state, title, PAGE_MARGIN, state.y, 17, '#111827', true)
  state.y += 34
}

function drawCenteredText(
  state: DrawState,
  text: string,
  fontSize: number,
  y: number,
  bold: boolean,
): void {
  state.context.font = `${bold ? '700' : '400'} ${fontSize}px Arial, sans-serif`
  state.context.fillStyle = '#111827'
  state.context.fillText(text, (PAGE_WIDTH - state.context.measureText(text).width) / 2, y)
}

function drawMultilineText(
  state: DrawState,
  text: string,
  x: number,
  y: number,
  width: number,
  fontSize: number,
  color = '#111827',
): void {
  const lines = text
    .split('\n')
    .flatMap((line) => wrapText(state, line || ' ', width, fontSize))

  drawWrappedLines(state, lines, x, y, fontSize, color, false)
  state.y = Math.max(state.y, y + lines.length * (fontSize + 5))
}

function drawWrappedLines(
  state: DrawState,
  lines: string[],
  x: number,
  y: number,
  fontSize: number,
  color: string,
  bold: boolean,
): void {
  lines.forEach((line, index) => {
    drawText(state, line, x, y + index * (fontSize + 5), fontSize, color, bold)
  })
}

function drawText(
  state: DrawState,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  color: string,
  bold: boolean,
): void {
  state.context.font = `${bold ? '700' : '400'} ${fontSize}px Arial, sans-serif`
  state.context.fillStyle = color
  state.context.fillText(text, x, y)
}

function drawLine(state: DrawState, fromX: number, fromY: number, toX: number, toY: number): void {
  state.context.strokeStyle = '#d1d5db'
  state.context.lineWidth = 1
  state.context.beginPath()
  state.context.moveTo(fromX, fromY)
  state.context.lineTo(toX, toY)
  state.context.stroke()
}

function drawContainedImage(
  state: DrawState,
  image: ImageBitmap,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const scale = Math.min(width / image.width, height / image.height)
  const drawWidth = image.width * scale
  const drawHeight = image.height * scale
  const drawX = x + (width - drawWidth) / 2
  const drawY = y + (height - drawHeight) / 2

  state.context.strokeStyle = '#d1d5db'
  state.context.strokeRect(x, y, width, height)
  state.context.drawImage(image, drawX, drawY, drawWidth, drawHeight)
}

function wrapText(state: DrawState, text: string, maxWidth: number, fontSize: number): string[] {
  state.context.font = `400 ${fontSize}px Arial, sans-serif`

  return text.split(' ').reduce<string[]>((lines, word) => {
    const currentLine = lines.at(-1) ?? ''
    const nextLine = currentLine ? `${currentLine} ${word}` : word

    if (state.context.measureText(nextLine).width <= maxWidth || !currentLine) {
      lines[lines.length - 1] = nextLine
    } else {
      lines.push(word)
    }

    return lines
  }, [''])
}

function buildPdfBlob(pages: PdfPageImage[]): Blob {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets: number[] = [0]
  let length = 0
  const pageObjectIds = pages.map((_, index) => 5 + index * 3)
  const maxObjectId = 2 + pages.length * 3

  function push(chunk: string | Uint8Array): void {
    const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk

    chunks.push(bytes)
    length += bytes.length
  }

  function object(id: number, body: string | Uint8Array, streamPrefix = '', streamSuffix = ''): void {
    offsets[id] = length
    push(`${id} 0 obj\n`)
    push(streamPrefix)
    push(body)
    push(streamSuffix)
    push('\nendobj\n')
  }

  push('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n')
  object(1, `<< /Type /Catalog /Pages 2 0 R >>`)
  object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] >>`)

  pages.forEach((page, index) => {
    const imageObjectId = 3 + index * 3
    const contentObjectId = 4 + index * 3
    const pageObjectId = 5 + index * 3
    const imageName = `Im${index + 1}`
    const content = `q\n${PAGE_WIDTH} 0 0 ${PAGE_HEIGHT} 0 0 cm\n/${imageName} Do\nQ`

    object(
      imageObjectId,
      page.bytes,
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`,
      '\nendstream',
    )
    object(contentObjectId, content, `<< /Length ${encoder.encode(content).length} >>\nstream\n`, '\nendstream')
    object(
      pageObjectId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /XObject << /${imageName} ${imageObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
    )
  })

  const xrefOffset = length

  push(`xref\n0 ${maxObjectId + 1}\n`)
  push('0000000000 65535 f \n')

  for (let id = 1; id <= maxObjectId; id += 1) {
    push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`)
  }

  push(`trailer\n<< /Size ${maxObjectId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`)

  return new Blob(chunks as BlobPart[], { type: 'application/pdf' })
}

function decodeBase64DataUrl(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? ''
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

function displayValue(value: string | number | undefined): string {
  if (value === undefined || value === '') {
    return '-'
  }

  return String(value)
}

function formatDate(value: string): string {
  if (!value) {
    return '-'
  }

  return new Intl.DateTimeFormat('ru-RU').format(new Date(value))
}
