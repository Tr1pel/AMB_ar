export function warmOfflineReportResources(): void {
  if (!navigator.onLine) {
    return
  }

  window.setTimeout(() => {
    void Promise.all([
      import('@/shared/reports/browser-report-pdf').then(({ warmReportPdfAssets }) =>
        warmReportPdfAssets(),
      ),
      import('@/views/ReportDetailView.vue'),
    ]).catch((error) => {
      console.warn('Не удалось заранее загрузить ресурсы офлайн-отчета', error)
    })
  }, 1_500)
}
