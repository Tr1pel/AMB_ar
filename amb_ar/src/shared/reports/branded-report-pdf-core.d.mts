import type { SerializedProductPhoto } from '@/shared/api/server-api'
import type { DocumentTemplateSnapshot, ReportDraft } from '@/types/report'

export function generateTemplateReportPdf(input: {
  report: ReportDraft
  photos: SerializedProductPhoto[]
  template: DocumentTemplateSnapshot
  PDFDocument: unknown
  regularFont: Uint8Array
  boldFont: Uint8Array
  logo: Uint8Array | null
  binaryAdapter?: (value: Uint8Array) => Uint8Array | ArrayBuffer
}): Promise<Uint8Array>
