import type { ReportDraft } from '@/types/report'

export function reportHasProductField(report: ReportDraft): boolean {
  const sections = report.templateSnapshot?.inputSchema?.steps ?? report.templateSnapshot?.sections ?? []

  return sections.some((section) =>
    section.fields.some(
      (field) => field.dataPath === 'productId' || field.dataPath === 'mainInfo.productName',
    ),
  )
}

export function getReportDisplayTitle(report: ReportDraft): string {
  if (reportHasProductField(report) && report.productId) {
    return report.productName || 'Товар не указан'
  }

  return report.templateSnapshot?.name || 'Отчёт без названия'
}
