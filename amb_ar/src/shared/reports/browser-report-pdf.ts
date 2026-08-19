import boldFontUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf?url'
import regularFontUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url'
import PDFDocument from 'pdfkit/js/pdfkit.standalone.js'

import { serializePhoto } from '@/shared/api/server-api'
import { generateTemplateReportPdf } from '@/shared/reports/branded-report-pdf-core.mjs'
import type { ProductPhoto, ReportDraft } from '@/types/report'

const LOGO_URL = '/runash-report-logo.jpeg'
const PDF_ASSET_CACHE_NAME = 'amb-ar-pdf-assets-v1'

export async function warmReportPdfAssets(): Promise<void> {
  if (!('caches' in window)) {
    return
  }

  const cache = await caches.open(PDF_ASSET_CACHE_NAME)
  await cache.addAll([regularFontUrl, boldFontUrl, LOGO_URL])
}

export async function generateReportPdfInBrowser(
  report: ReportDraft,
  photos: ProductPhoto[],
): Promise<{ blob: Blob; fileName: string }> {
  if (!report.templateSnapshot) {
    throw new Error('Макет отчета не найден в локальном черновике')
  }

  const [regularFont, boldFont, logo] = await Promise.all([
    fetchBinary(regularFontUrl),
    fetchBinary(boldFontUrl),
    fetchBinary(LOGO_URL).catch(() => null),
  ])
  const bytes = await generateTemplateReportPdf({
    report,
    photos: await Promise.all(photos.map(serializePhoto)),
    template: report.templateSnapshot,
    PDFDocument,
    regularFont,
    boldFont,
    logo,
    binaryAdapter: toArrayBuffer,
  })
  const generatedAt = Date.now()
  const binary = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(binary).set(bytes)

  return {
    blob: new Blob([binary], { type: 'application/pdf' }),
    fileName: createGeneratedPdfFileName(report, generatedAt),
  }
}

async function fetchBinary(url: string): Promise<Uint8Array> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Не удалось загрузить ресурс PDF: ${response.status}`)
  }

  return new Uint8Array(await response.arrayBuffer())
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const binary = new ArrayBuffer(value.byteLength)
  new Uint8Array(binary).set(value)
  return binary
}

function createGeneratedPdfFileName(report: ReportDraft, generatedAt: number): string {
  const rawBaseName = String(report.reportNumber || 'quality-report').trim()
  const baseName = Array.from(rawBaseName, (character) =>
    character.charCodeAt(0) <= 31 ? '_' : character,
  )
    .join('')
    .replace(/[<>:"/\\|?*]/g, '_')
  const timestamp = new Date(generatedAt).toISOString().replace(/[-:]/g, '').slice(0, 13)

  return `${baseName || 'quality-report'}-${timestamp}.pdf`
}
