import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import PDFDocument from 'pdfkit'

import { generateTemplateReportPdf as generatePlatformReportPdf } from '../src/shared/reports/branded-report-pdf-core.mjs'

const SERVER_DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_DIR = join(SERVER_DIR, '..')
const REGULAR_FONT_PATH = fileURLToPath(
  import.meta.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf'),
)
const BOLD_FONT_PATH = fileURLToPath(
  import.meta.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf'),
)
const LOGO_PATH = join(PROJECT_DIR, 'public', 'runash-report-logo.jpeg')

export async function generateTemplateReportPdf({ report, photos, template }) {
  const [regularFont, boldFont, logo] = await Promise.all([
    readFile(REGULAR_FONT_PATH),
    readFile(BOLD_FONT_PATH),
    readFile(LOGO_PATH).catch(() => null),
  ])
  const bytes = await generatePlatformReportPdf({
    report,
    photos,
    template,
    PDFDocument,
    regularFont,
    boldFont,
    logo,
    binaryAdapter: (value) => Buffer.from(value),
  })

  return Buffer.from(bytes)
}
