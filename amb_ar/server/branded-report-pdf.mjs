import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import PDFDocument from 'pdfkit'

const SERVER_DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_DIR = join(SERVER_DIR, '..')
const REGULAR_FONT_PATH = fileURLToPath(
  import.meta.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf'),
)
const BOLD_FONT_PATH = fileURLToPath(
  import.meta.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf'),
)
const LOGO_PATH = join(PROJECT_DIR, 'public', 'runash-report-logo.jpeg')

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const PAGE_MARGIN = 30
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2
const CONTENT_BOTTOM = PAGE_HEIGHT - 30
const DARK_GREEN = '#1b5e1f'
const LIGHT_GREEN = '#e8f5e9'
const GRID_COLOR = '#d7e6d8'
const TEXT_COLOR = '#172019'
const MUTED_TEXT = '#556259'
const REGULAR_FONT = 'DejaVuSans'
const BOLD_FONT = 'DejaVuSansBold'

export async function generateTemplateReportPdf({ report, photos, template }) {
  const renderSpec = getTemplateRenderSpec(template)

  const logo = await readFile(LOGO_PATH).catch(() => null)
  const document = new PDFDocument({
    autoFirstPage: false,
    bufferPages: true,
    compress: true,
    info: {
      Title: renderSpec.documentTitle || template.name || 'Отчёт о контроле качества',
      Author: report.inspectorName || 'АМБАР',
      Subject: report.productName || report.mainInfo?.productName || '',
      Creator: 'АМБАР',
    },
  })
  const chunks = []
  const completed = new Promise((resolve, reject) => {
    document.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    document.on('end', () => resolve(Buffer.concat(chunks)))
    document.on('error', reject)
  })

  document.registerFont(REGULAR_FONT, REGULAR_FONT_PATH)
  document.registerFont(BOLD_FONT, BOLD_FONT_PATH)

  const state = {
    document,
    y: 0,
    hasContent: false,
    hasDocumentContent: false,
    pageCount: 0,
  }
  const inputSections = getTemplateInputSections(template)
  const inputSectionById = new Map(inputSections.map((section) => [section.id, section]))
  const photoFields = []
  const templateSubtitle = String(template.description || template.name || '').trim()

  beginPage(state, report, renderSpec.documentTitle, templateSubtitle, logo)

  for (const renderSection of renderSpec.sections) {
    if (renderSection.hidden) {
      continue
    }

    const inputSection = inputSectionById.get(renderSection.inputSectionId)

    if (!inputSection) {
      continue
    }

    const inputFieldByPath = new Map(inputSection.fields.map((field) => [field.dataPath, field]))
    const blocks = []

    for (const fieldSpec of renderSection.fields) {
      const field = inputFieldByPath.get(fieldSpec.dataPath)

      if (!field || fieldSpec.hidden) {
        continue
      }

      if (field.type === 'photo' || field.dataPath === 'photos') {
        photoFields.push({ field, spec: fieldSpec })
        continue
      }

      blocks.push(...createFieldBlocks(report, field, fieldSpec, renderSection))
    }

    if (!blocks.length) {
      continue
    }

    if (state.hasContent && renderSection.pageBreakBefore) {
      beginPage(state, report, renderSpec.documentTitle, templateSubtitle, logo)
    } else if (state.hasContent) {
      state.y += 10
    }

    ensureSpaceForSection(state, report, renderSpec.documentTitle, templateSubtitle, logo)
    drawSectionHeading(state, renderSection.title || inputSection.title)

    if (renderSection.showDescription && inputSection.description) {
      drawDescription(state, inputSection.description)
    }

    for (const group of groupFieldBlocks(blocks, renderSection.columns)) {
      const pageContext = {
        report,
        documentTitle: renderSpec.documentTitle,
        templateName: templateSubtitle,
        logo,
        sectionTitle: renderSection.title || inputSection.title,
      }

      if (group.blocks[0]?.kind === 'table') {
        drawTableBlock(state, group.blocks[0], pageContext)
        state.hasContent = true
        continue
      }

      const groupHeight = measureGroupHeight(state, group)

      if (state.y + groupHeight > CONTENT_BOTTOM) {
        beginPage(state, report, renderSpec.documentTitle, templateSubtitle, logo)
        drawSectionHeading(
          state,
          `${renderSection.title || inputSection.title} · продолжение`,
        )
      }

      drawFieldGroup(state, group)
      state.hasContent = true
    }
  }

  for (const [photoFieldIndex, entry] of photoFields.entries()) {
    const fieldPhotos = photos.filter(
      (photo) =>
        photo.templateFieldId === entry.field.id ||
        (!photo.templateFieldId && photoFieldIndex === 0),
    )

    if (!fieldPhotos.length && entry.spec.hideWhenEmpty) {
      continue
    }

    if (!fieldPhotos.length) {
      continue
    }

    for (const [photoPageIndex, pagePhotos] of chunk(fieldPhotos, 2).entries()) {
      if (state.hasDocumentContent || photoPageIndex > 0) {
        beginPage(state, report, renderSpec.documentTitle, templateSubtitle, logo)
      }
      drawSectionHeading(
        state,
        `${entry.spec.label?.trim() || entry.field.label}${photoPageIndex ? ' · продолжение' : ''}`,
      )
      drawPhotoContent(state, report, pagePhotos)
      state.hasContent = true
    }
  }

  if (!state.hasDocumentContent && state.pageCount === 1) {
    drawSectionHeading(state, 'Данные для печати не выбраны')
  }

  document.end()

  return completed
}

function createFieldBlocks(report, field, spec, section) {
  const label = spec.label?.trim() || field.label
  const width = section.columns === 1 ? 'full' : spec.width

  if (field.type !== 'table') {
    const value = formatFieldValue(report, field, spec.display)

    if (spec.hideWhenEmpty && !value) {
      return []
    }

    return [{ kind: 'value', label, value: value || '—', width }]
  }

  const rawValue = getRawFieldValue(report, field)
  const table = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) ? rawValue : {}
  const columns = field.tableColumns ?? []
  const rows = (field.tableRows ?? []).map((row) => ({
    label: row.label,
    values: columns.map((column) => {
      const cellValue = table[row.id]?.[column.id]
      const formatted =
        typeof cellValue === 'boolean'
          ? cellValue
            ? '☒'
            : '☐'
          : String(cellValue ?? '').trim()

      return formatted ? `${formatted}${column.unit ? ` ${column.unit}` : ''}` : ''
    }),
  }))
  const hasValue = rows.some((row) => row.values.some(Boolean))

  if (spec.hideWhenEmpty && !hasValue) {
    return []
  }

  return [{ kind: 'table', label, columns, rows, width: 'full' }]
}

function groupFieldBlocks(blocks, columns) {
  if (columns === 1) {
    return blocks.map((block) => ({ blocks: [block], full: true }))
  }

  const groups = []
  let pendingHalf = null

  for (const block of blocks) {
    if (block.kind === 'table' || block.width === 'full') {
      if (pendingHalf) {
        groups.push({ blocks: [pendingHalf], full: false })
        pendingHalf = null
      }

      groups.push({ blocks: [block], full: true })
    } else if (pendingHalf) {
      groups.push({ blocks: [pendingHalf, block], full: false })
      pendingHalf = null
    } else {
      pendingHalf = block
    }
  }

  if (pendingHalf) {
    groups.push({ blocks: [pendingHalf], full: false })
  }

  return groups
}

function measureGroupHeight(state, group) {
  if (group.blocks[0]?.kind === 'table') {
    return measureTableBlockHeight(state.document, group.blocks[0])
  }

  if (group.full) {
    const block = group.blocks[0]
    const labelHeight = measureText(state.document, block.label, 190, 8.5, true)
    const valueHeight = measureText(state.document, block.value, CONTENT_WIDTH - 214, 9, false)
    return Math.max(28, Math.max(labelHeight, valueHeight) + 10)
  }

  const columnWidth = CONTENT_WIDTH / 2
  const labelWidth = columnWidth * 0.48

  return Math.max(
    29,
    ...group.blocks.map((block) => {
      const labelHeight = measureText(state.document, block.label, labelWidth - 10, 7.5, true)
      const valueHeight = measureText(
        state.document,
        block.value,
        columnWidth - labelWidth - 10,
        8.2,
        false,
      )
      return Math.max(labelHeight, valueHeight) + 9
    }),
  )
}

function drawFieldGroup(state, group) {
  const { document } = state
  const height = measureGroupHeight(state, group)
  const rowIndex = Math.max(0, Math.round((state.y - 120) / 28))
  const rowFill = rowIndex % 2 ? LIGHT_GREEN : '#ffffff'

  if (group.full) {
    const block = group.blocks[0]
    const labelWidth = 202

    fillRect(document, PAGE_MARGIN, state.y, labelWidth, height, DARK_GREEN)
    fillRect(document, PAGE_MARGIN + labelWidth, state.y, CONTENT_WIDTH - labelWidth, height, rowFill)
    drawCellText(document, block.label, PAGE_MARGIN + 6, state.y, labelWidth - 12, height, 8.5, '#ffffff', true)
    drawCellText(
      document,
      block.value,
      PAGE_MARGIN + labelWidth + 7,
      state.y,
      CONTENT_WIDTH - labelWidth - 14,
      height,
      9,
      TEXT_COLOR,
      false,
    )
    strokeRect(document, PAGE_MARGIN, state.y, CONTENT_WIDTH, height)
    state.y += height
    return
  }

  const width = CONTENT_WIDTH / 2
  const labelWidth = width * 0.48

  group.blocks.forEach((block, index) => {
    const x = PAGE_MARGIN + index * width
    fillRect(document, x, state.y, labelWidth, height, DARK_GREEN)
    fillRect(document, x + labelWidth, state.y, width - labelWidth, height, rowFill)
    drawCellText(document, block.label, x + 5, state.y, labelWidth - 10, height, 7.5, '#ffffff', true)
    drawCellText(
      document,
      block.value,
      x + labelWidth + 5,
      state.y,
      width - labelWidth - 10,
      height,
      8.2,
      TEXT_COLOR,
      false,
    )
    strokeRect(document, x, state.y, width, height)
  })
  state.y += height
}

function measureTableBlockHeight(document, block) {
  const geometry = getTableGeometry(block)
  return (
    19 +
    geometry.headerHeight +
    block.rows.reduce(
      (total, row) => total + measureTableRowHeight(document, row, geometry),
      0,
    )
  )
}

function drawTableBlock(state, block, pageContext) {
  const geometry = getTableGeometry(block)
  const minimumTableHeight = 19 + geometry.headerHeight + 27

  if (state.y + minimumTableHeight > CONTENT_BOTTOM) {
    beginPage(
      state,
      pageContext.report,
      pageContext.documentTitle,
      pageContext.templateName,
      pageContext.logo,
    )
    drawSectionHeading(state, `${pageContext.sectionTitle} · продолжение`)
  }

  drawTableHeader(state, block, geometry)

  if (!block.rows.length) {
    fillRect(state.document, PAGE_MARGIN, state.y, CONTENT_WIDTH, 30, '#ffffff')
    drawCellText(
      state.document,
      'Строки таблицы не настроены',
      PAGE_MARGIN + 6,
      state.y,
      CONTENT_WIDTH - 12,
      30,
      8,
      MUTED_TEXT,
      false,
      'center',
    )
    strokeRect(state.document, PAGE_MARGIN, state.y, CONTENT_WIDTH, 30)
    state.y += 30
    return
  }

  block.rows.forEach((row, rowIndex) => {
    const rowHeight = measureTableRowHeight(state.document, row, geometry)

    if (state.y + rowHeight > CONTENT_BOTTOM) {
      beginPage(
        state,
        pageContext.report,
        pageContext.documentTitle,
        pageContext.templateName,
        pageContext.logo,
      )
      drawSectionHeading(state, `${pageContext.sectionTitle} · продолжение`)
      drawTableHeader(state, block, geometry)
    }

    const rowFill = rowIndex % 2 ? LIGHT_GREEN : '#ffffff'
    let x = PAGE_MARGIN
    const values = [row.label, ...row.values]

    geometry.widths.forEach((width, columnIndex) => {
      fillRect(state.document, x, state.y, width, rowHeight, rowFill)
      drawCellText(
        state.document,
        values[columnIndex] || '—',
        x + 5,
        state.y,
        width - 10,
        rowHeight,
        7.3,
        TEXT_COLOR,
        columnIndex === 0,
        columnIndex === 0 ? 'left' : 'center',
      )
      strokeRect(state.document, x, state.y, width, rowHeight)
      x += width
    })
    state.y += rowHeight
  })
}

function getTableGeometry(block) {
  const valueColumnCount = Math.max(1, block.columns.length)
  const rowLabelWidth = block.columns.length ? Math.min(200, Math.max(150, CONTENT_WIDTH * 0.34)) : CONTENT_WIDTH
  const valueColumnWidth = block.columns.length
    ? (CONTENT_WIDTH - rowLabelWidth) / valueColumnCount
    : 0
  const widths = block.columns.length
    ? [rowLabelWidth, ...block.columns.map(() => valueColumnWidth)]
    : [CONTENT_WIDTH]
  const headerHeight = block.columns.length > 3 ? 31 : 25

  return { widths, rowLabelWidth, valueColumnWidth, headerHeight }
}

function measureTableRowHeight(document, row, geometry) {
  const values = [row.label, ...row.values]
  return Math.min(
    52,
    Math.max(
      27,
      ...values.map((value, index) =>
        measureText(document, value || '—', geometry.widths[index] - 10, 7.3, index === 0) + 9,
      ),
    ),
  )
}

function drawTableHeader(state, block, geometry) {
  fillRect(state.document, PAGE_MARGIN, state.y, CONTENT_WIDTH, 19, LIGHT_GREEN)
  drawCellText(
    state.document,
    block.label,
    PAGE_MARGIN + 6,
    state.y,
    CONTENT_WIDTH - 12,
    19,
    8.4,
    DARK_GREEN,
    true,
    'center',
  )
  state.y += 19

  const labels = ['Показатель', ...block.columns.map((column) => column.label)]
  let x = PAGE_MARGIN
  geometry.widths.forEach((width, index) => {
    fillRect(state.document, x, state.y, width, geometry.headerHeight, DARK_GREEN)
    drawCellText(
      state.document,
      labels[index] || 'Значение',
      x + 5,
      state.y,
      width - 10,
      geometry.headerHeight,
      7,
      '#ffffff',
      true,
      'center',
    )
    strokeRect(state.document, x, state.y, width, geometry.headerHeight)
    x += width
  })
  state.y += geometry.headerHeight
}

function ensureSpaceForSection(state, report, title, templateName, logo) {
  if (state.y < CONTENT_BOTTOM - 80) {
    return
  }

  beginPage(state, report, title, templateName, logo)
}

function beginPage(state, report, documentTitle, templateName, logo) {
  const { document } = state
  document.addPage({ size: 'A4', margin: 0 })
  const isFirstPage = state.pageCount === 0
  state.pageCount += 1
  state.hasContent = false

  if (!isFirstPage) {
    state.y = PAGE_MARGIN
    return
  }

  if (logo) {
    document.image(logo, PAGE_MARGIN, 18, {
      fit: [137, 60],
      align: 'left',
      valign: 'center',
    })
  } else {
    drawText(document, 'РУНАШ', PAGE_MARGIN + 8, 28, 19, DARK_GREEN, true)
    drawText(document, 'RUNASH.RU', PAGE_MARGIN + 30, 52, 7, DARK_GREEN, true)
  }

  const title = documentTitle || 'QUALITY INSPECTION REPORT'
  const titleHeight = Math.min(34, measureText(document, title, 330, 14.5, true))
  const productY = Math.max(44, 20 + titleHeight + 2)

  drawText(document, title, 205, 20, 14.5, DARK_GREEN, true, {
    width: 352,
    height: 34,
    align: 'center',
    ellipsis: true,
  })
  drawText(
    document,
    report.productName || report.mainInfo?.productName || 'Отчёт о контроле качества',
    205,
    productY,
    8.5,
    TEXT_COLOR,
    true,
    { width: 352, height: 18, align: 'center', ellipsis: true },
  )
  drawText(
    document,
    templateName || 'Inspection of Quality & Shipment Conditions',
    PAGE_MARGIN,
    87,
    7.4,
    MUTED_TEXT,
    false,
    { width: CONTENT_WIDTH, align: 'center', height: 24, ellipsis: true },
  )

  const metadataY = 138.7
  const metadataX = 138.7
  const metadataWidths = [67.5, 92.2, 67.5, 92.2]
  const metadata = [
    ['Report ID:', true, DARK_GREEN, '#ffffff'],
    [report.mainInfo?.orderNumber || report.id || '—', true, LIGHT_GREEN, TEXT_COLOR],
    ['Date:', true, DARK_GREEN, '#ffffff'],
    [formatDate(report.updatedAt), false, LIGHT_GREEN, TEXT_COLOR],
  ]
  let metadataCellX = metadataX

  metadata.forEach(([value, bold, fill, color], index) => {
    fillRect(document, metadataCellX, metadataY, metadataWidths[index], 12, fill)
    drawCellText(
      document,
      value,
      metadataCellX + 3,
      metadataY,
      metadataWidths[index] - 6,
      12,
      6.6,
      color,
      bold,
      'center',
    )
    metadataCellX += metadataWidths[index]
  })
  state.y = 172
}

function drawSectionHeading(state, title) {
  const height = Math.max(18, measureText(state.document, title, CONTENT_WIDTH - 14, 9.2, true) + 5)
  fillRect(state.document, PAGE_MARGIN, state.y, CONTENT_WIDTH, height, DARK_GREEN)
  drawText(state.document, title, PAGE_MARGIN + 7, state.y + 3, 9.2, '#ffffff', true, {
    width: CONTENT_WIDTH - 14,
    height: height - 6,
    align: 'center',
  })
  state.y += height
  state.hasContent = true
  state.hasDocumentContent = true
}

function drawDescription(state, description) {
  const height = measureText(state.document, description, CONTENT_WIDTH - 12, 8, false) + 8
  fillRect(state.document, PAGE_MARGIN, state.y, CONTENT_WIDTH, height, LIGHT_GREEN)
  drawText(state.document, description, PAGE_MARGIN + 6, state.y + 4, 8, MUTED_TEXT, false, {
    width: CONTENT_WIDTH - 12,
    height: height - 6,
  })
  state.y += height
}

function drawPhotoContent(state, report, photos) {
  const { document } = state

  if (!photos.length) {
    fillRect(document, PAGE_MARGIN, state.y + 12, CONTENT_WIDTH, 120, LIGHT_GREEN)
    drawText(document, 'Фотографии не добавлены', PAGE_MARGIN, state.y + 62, 11, MUTED_TEXT, true, {
      width: CONTENT_WIDTH,
      align: 'center',
    })
    return
  }

  for (const photo of photos) {
    const image = decodeSupportedPhoto(photo)
    const imageHeight = photos.length > 1 ? 278 : 610

    fillRect(document, PAGE_MARGIN, state.y + 8, CONTENT_WIDTH, imageHeight, '#f7faf7')
    document.image(image, PAGE_MARGIN + 6, state.y + 14, {
      fit: [CONTENT_WIDTH - 12, imageHeight - 12],
      align: 'center',
      valign: 'center',
    })
    strokeRect(document, PAGE_MARGIN, state.y + 8, CONTENT_WIDTH, imageHeight)
    state.y += imageHeight + 12
    drawText(document, photo.caption || photo.fileName, PAGE_MARGIN + 4, state.y, 8.5, TEXT_COLOR, true, {
      width: 320,
      height: 16,
      ellipsis: true,
    })
    drawText(
      document,
      `${formatDate(photo.createdAt)} · ${report.inspectorName || '—'}`,
      PAGE_WIDTH - PAGE_MARGIN - 205,
      state.y,
      7.5,
      MUTED_TEXT,
      false,
      { width: 201, height: 16, align: 'right', ellipsis: true },
    )
    state.y += 19
  }
}

function formatFieldValue(report, field, display) {
  if (field.type === 'signature') {
    return report.inspectorName || ''
  }

  const value = getRawFieldValue(report, field)

  if (display === 'checkmark' || field.type === 'checkbox' || field.type === 'passFail') {
    if (value === true || value === 'true' || value === 'pass') {
      return field.type === 'passFail'
        ? '☒ Соответствует  ☐ Не соответствует'
        : '☒ Да  ☐ Нет'
    }

    if (value === false || value === 'false' || value === 'fail') {
      return field.type === 'passFail'
        ? '☐ Соответствует  ☒ Не соответствует'
        : '☐ Да  ☒ Нет'
    }
  }

  if (field.type === 'measurement') {
    const result = formatValue(value, false)
    return [
      result && `${result}${field.unit ? ` ${field.unit}` : ''}`,
      field.standardValue && `Норма: ${field.standardValue}`,
    ]
      .filter(Boolean)
      .join(' · ')
  }

  return formatValue(value, field.type === 'date')
}

function getRawFieldValue(report, field) {
  if (field.dataPath.startsWith('custom.')) {
    return report.customFieldValues?.[field.dataPath]
  }

  const pathParts = field.dataPath.split('.')
  let value = report

  for (const pathPart of pathParts) {
    if (!value || typeof value !== 'object' || !(pathPart in value)) {
      return undefined
    }

    value = value[pathPart]
  }

  if (field.dataPath === 'sampling.points' && Array.isArray(value)) {
    return value
      .map((point) => `${String(point?.pallet ?? '')}: ${String(point?.place ?? '')}`)
      .filter(Boolean)
      .join(', ')
  }

  return value
}

function formatValue(value, asDate) {
  if (typeof value === 'string') {
    return asDate ? formatDate(value) : value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (Array.isArray(value)) {
    return value.join(', ')
  }

  return ''
}

function drawCellText(
  document,
  text,
  x,
  y,
  width,
  height,
  fontSize,
  color,
  bold,
  align = 'left',
) {
  const textHeight = measureText(document, text, width, fontSize, bold)
  drawText(document, text, x, y + Math.max(4, (height - textHeight) / 2), fontSize, color, bold, {
    width,
    height: Math.max(fontSize + 2, height - 6),
    align,
    ellipsis: true,
  })
}

function measureText(document, text, width, fontSize, bold) {
  selectFont(document, bold, fontSize)
  return document.heightOfString(String(text || ' '), { width, lineGap: 1 })
}

function drawText(document, text, x, y, fontSize, color, bold, options = {}) {
  selectFont(document, bold, fontSize)
  document.fillColor(color).text(String(text || ' '), x, y, {
    lineGap: 1,
    ...options,
  })
}

function selectFont(document, bold, fontSize) {
  document.font(bold ? BOLD_FONT : REGULAR_FONT).fontSize(fontSize)
}

function fillRect(document, x, y, width, height, color) {
  document.save().fillColor(color).rect(x, y, width, height).fill().restore()
}

function strokeRect(document, x, y, width, height) {
  document.save().lineWidth(0.7).strokeColor(GRID_COLOR).rect(x, y, width, height).stroke().restore()
}

function decodeSupportedPhoto(photo) {
  const binary = Buffer.from(photo.blobBase64 ?? '', 'base64')
  const isJpeg = binary.length >= 3 && binary[0] === 0xff && binary[1] === 0xd8 && binary[2] === 0xff
  const isPng =
    binary.length >= 8 &&
    binary.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))

  if (!isJpeg && !isPng) {
    throw new Error(
      `Фотография «${photo.fileName || photo.id}» должна быть в формате JPEG или PNG`,
    )
  }

  return binary
}

function getTemplateInputSections(template) {
  return template.inputSchema?.steps ?? template.sections ?? []
}

function getTemplateRenderSpec(template) {
  const sections = getTemplateInputSections(template)
  const renderSpec = template.renderSpec ?? createDefaultRenderSpec(sections)

  return {
    ...renderSpec,
    mode: 'flow',
    layout: 'branded',
    pageSize: 'A4',
    documentTitle: String(renderSpec.documentTitle || template.name || '').trim(),
    sections: Array.isArray(renderSpec.sections)
      ? renderSpec.sections
      : createDefaultRenderSpec(sections).sections,
  }
}

function createDefaultRenderSpec(sections) {
  return {
    version: 1,
    mode: 'flow',
    layout: 'branded',
    pageSize: 'A4',
    documentTitle: '',
    sections: sections.map((section) => ({
      id: `render-${section.id}`,
      inputSectionId: section.id,
      title: section.title,
      pageBreakBefore: false,
      columns: 1,
      showDescription: true,
      hidden: false,
      fields: (section.fields ?? []).map((field) => ({
        dataPath: field.dataPath,
        label: field.label,
        width: field.width ?? 'full',
        display:
          field.type === 'table'
            ? 'table'
            : field.type === 'checkbox' || field.type === 'passFail'
              ? 'checkmark'
              : 'value',
        hideWhenEmpty: false,
        hidden: false,
      })),
    })),
  }
}

function formatDate(value) {
  if (!value) {
    return '—'
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('ru-RU').format(date)
}

function chunk(items, size, includeEmpty = false) {
  if (!items.length) {
    return includeEmpty ? [[]] : []
  }

  const result = []

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }

  return result
}
