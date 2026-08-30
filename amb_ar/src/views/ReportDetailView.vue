<script setup lang="ts">
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from 'pdfjs-dist'
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&inline'
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import { requestConfirmation } from '@/shared/ui/confirmation-dialog'
import { useAuthStore } from '@/stores/auth.store'
import { useReportDraftStore } from '@/stores/report-draft.store'
import type { GeneratedDocument } from '@/types/report'

GlobalWorkerOptions.workerPort = new PdfWorker()

const props = defineProps<{ reportId: string }>()
const reportDraftStore = useReportDraftStore()
const authStore = useAuthStore()
const router = useRouter()

const viewerRef = ref<HTMLElement | null>(null)
const displayedDocument = ref<GeneratedDocument | null>(null)
const pageNumbers = ref<number[]>([])
const isPreparingDocument = ref(false)
const isRenderingPdf = ref(false)
const isSubmittingReport = ref(false)
const renderedPageCount = ref(0)
const previewError = ref('')
const canvasByPage = new Map<number, HTMLCanvasElement>()

let pdfDocument: PDFDocumentProxy | null = null
let pdfLoadingTask: PDFDocumentLoadingTask | null = null
let resizeObserver: ResizeObserver | null = null
let resizeTimer: ReturnType<typeof setTimeout> | undefined
let renderQueue: Promise<void> = Promise.resolve()
let documentGeneration = 0

const report = computed(() => reportDraftStore.selectedReport)
const isInspectorReview = computed(
  () => authStore.isWorker && report.value?.status === 'draft',
)
const backRoute = computed(() => {
  if (authStore.isAdmin && report.value?.status === 'archived') {
    return { name: 'admin-report-archive' }
  }

  return authStore.isAdmin ? { name: 'admin-reports' } : { name: 'worker-reports' }
})

onMounted(async () => {
  await reportDraftStore.loadReport(props.reportId)

  if (
    authStore.isWorker &&
    report.value?.workerAccountId &&
    report.value.workerAccountId !== authStore.currentAccount?.id
  ) {
    await router.replace({ name: 'new-report' })
    return
  }

  await prepareDocument()

  if (viewerRef.value) {
    resizeObserver = new ResizeObserver(scheduleRender)
    resizeObserver.observe(viewerRef.value)
  }
})

onUnmounted(() => {
  documentGeneration += 1
  resizeObserver?.disconnect()
  if (resizeTimer) clearTimeout(resizeTimer)
  void pdfLoadingTask?.destroy()
  pdfDocument = null
  pdfLoadingTask = null
  canvasByPage.clear()
})

function getLatestDocument(): GeneratedDocument | undefined {
  return [...reportDraftStore.selectedDocuments].sort(
    (first, second) => first.generatedAt - second.generatedAt,
  ).at(-1)
}

async function prepareDocument(): Promise<void> {
  if (!report.value || isPreparingDocument.value) return

  isPreparingDocument.value = true
  previewError.value = ''

  try {
    let savedDocument = getLatestDocument()

    if (!savedDocument) {
      if (report.value.status === 'archived') {
        throw new Error('Для архивного отчёта PDF не найден')
      }

      // The editor normally creates the PDF before navigation.  Recreate it here
      // when a prior save was interrupted, so an offline report always opens.
      savedDocument = (await reportDraftStore.generateDocument(report.value.id)) ?? undefined
    }

    if (!savedDocument) {
      throw new Error(reportDraftStore.errorMessage || 'Не удалось получить серверный PDF')
    }

    displayedDocument.value = savedDocument
    await loadPdf(savedDocument.blob)
  } catch (error) {
    previewError.value = getErrorMessage(error, 'Не удалось открыть PDF')
  } finally {
    isPreparingDocument.value = false
  }
}

async function loadPdf(blob: Blob): Promise<void> {
  const generation = ++documentGeneration
  isRenderingPdf.value = true
  renderedPageCount.value = 0
  pageNumbers.value = []
  canvasByPage.clear()

  try {
    await pdfLoadingTask?.destroy()
    pdfDocument = null
    pdfLoadingTask = null

    const loadingTask = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) })
    const loadedDocument = await loadingTask.promise

    if (generation !== documentGeneration) {
      await loadingTask.destroy()
      return
    }

    pdfLoadingTask = loadingTask
    pdfDocument = loadedDocument
    pageNumbers.value = Array.from({ length: loadedDocument.numPages }, (_, index) => index + 1)
    await nextTick()
    await queueRender()
  } catch (error) {
    previewError.value = getErrorMessage(error, 'PDF повреждён или имеет неподдерживаемый формат')
  } finally {
    if (generation === documentGeneration) isRenderingPdf.value = false
  }
}

function setPageCanvas(element: unknown, pageNumber: number): void {
  if (element instanceof HTMLCanvasElement) {
    canvasByPage.set(pageNumber, element)
  } else {
    canvasByPage.delete(pageNumber)
  }
}

function scheduleRender(): void {
  if (!pdfDocument || !pageNumbers.value.length) return
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => void queueRender(), 160)
}

function queueRender(): Promise<void> {
  renderQueue = renderQueue.catch(() => undefined).then(renderPages)
  return renderQueue
}

async function renderPages(): Promise<void> {
  const currentDocument = pdfDocument
  const viewer = viewerRef.value

  if (!currentDocument || !viewer) return

  isRenderingPdf.value = true
  renderedPageCount.value = 0
  const availableWidth = Math.max(280, viewer.clientWidth - (window.innerWidth <= 620 ? 16 : 48))
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)

  try {
    for (const pageNumber of pageNumbers.value) {
      if (currentDocument !== pdfDocument) return

      const canvas = canvasByPage.get(pageNumber)
      if (!canvas) continue

      const page = await currentDocument.getPage(pageNumber)
      const baseViewport = page.getViewport({ scale: 1 })
      const cssScale = Math.min(1.65, availableWidth / baseViewport.width)
      const renderViewport = page.getViewport({ scale: cssScale * pixelRatio })
      const context = canvas.getContext('2d', { alpha: false })
      const targetWidth = Math.floor(renderViewport.width)
      const targetHeight = Math.floor(renderViewport.height)

      if (!context) throw new Error('Браузер не поддерживает отрисовку PDF в canvas')

      if (canvas.width === targetWidth && canvas.height === targetHeight) {
        renderedPageCount.value = pageNumber
        page.cleanup()
        continue
      }

      canvas.width = targetWidth
      canvas.height = targetHeight
      canvas.style.width = `${Math.floor(renderViewport.width / pixelRatio)}px`
      canvas.style.height = `${Math.floor(renderViewport.height / pixelRatio)}px`

      await page.render({ canvas, canvasContext: context, viewport: renderViewport }).promise
      renderedPageCount.value = pageNumber
      page.cleanup()
    }
  } catch (error) {
    previewError.value = getErrorMessage(error, 'Не удалось отрисовать страницы PDF')
  } finally {
    if (currentDocument === pdfDocument) isRenderingPdf.value = false
  }
}

function savePdfDocument(): void {
  if (!displayedDocument.value) return

  const url = URL.createObjectURL(displayedDocument.value.blob)
  const link = document.createElement('a')
  link.href = url
  link.download = displayedDocument.value.fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

async function submitToAdministrator(): Promise<void> {
  if (!report.value || !isInspectorReview.value || isSubmittingReport.value) return

  const shouldSubmit = await requestConfirmation({
    title: 'Отправить отчёт?',
    message: 'После отправки отчёт больше нельзя будет изменить.',
    confirmLabel: 'Отправить',
  })

  if (!shouldSubmit) return

  isSubmittingReport.value = true
  previewError.value = ''

  try {
    const submittedReport = await reportDraftStore.submitReport(report.value.id)

    if (submittedReport) {
      await router.push({ name: 'worker-reports' })
    } else {
      previewError.value = reportDraftStore.errorMessage || 'Не удалось отправить отчёт'
    }
  } finally {
    isSubmittingReport.value = false
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
</script>

<template>
  <main class="screen-page detail-page">
    <section class="report-toolbar app-card">
      <RouterLink
        class="back-link"
        :to="
          isInspectorReview
            ? { name: 'edit-report', params: { reportId } }
            : backRoute
        "
      >
        <span aria-hidden="true">←</span>
        {{
          isInspectorReview
            ? 'Вернуться к редактированию'
            : authStore.isAdmin
              ? 'К списку отчётов'
              : 'К истории'
        }}
      </RouterLink>

      <div class="report-toolbar__actions">
        <button
          class="secondary-button"
          type="button"
          :disabled="!displayedDocument || isPreparingDocument || isSubmittingReport"
          @click="savePdfDocument"
        >
          Скачать PDF
        </button>
        <button
          v-if="isInspectorReview"
          class="primary-button"
          type="button"
          :disabled="!displayedDocument || isPreparingDocument || isSubmittingReport"
          @click="submitToAdministrator"
        >
          {{ isSubmittingReport ? 'Отправляем…' : 'Отправить администратору' }}
        </button>
      </div>
    </section>

    <section ref="viewerRef" class="pdf-viewer" aria-label="Просмотр PDF отчёта">
      <div v-if="isPreparingDocument" class="viewer-state app-card">
        <span class="viewer-spinner" aria-hidden="true" />
        <strong>Подготавливаем итоговый PDF…</strong>
      </div>

      <div v-else-if="previewError" class="viewer-state viewer-state--error app-card">
        <strong>Не удалось показать отчёт</strong>
        <p>{{ previewError }}</p>
        <RouterLink
          v-if="report?.status === 'draft' && authStore.isWorker"
          class="primary-button"
          :to="{ name: 'edit-report', params: { reportId } }"
        >
          Вернуться к редактированию
        </RouterLink>
        <button v-else class="secondary-button" type="button" @click="prepareDocument">
          Попробовать снова
        </button>
      </div>

      <template v-else>
        <div
          v-if="isRenderingPdf"
          class="render-progress"
          role="status"
          aria-live="polite"
        >
          Отрисовываем страницы: {{ renderedPageCount }} / {{ pageNumbers.length }}
        </div>

        <section
          v-for="pageNumber in pageNumbers"
          :key="pageNumber"
          class="pdf-page"
          :aria-label="`Страница ${pageNumber} из ${pageNumbers.length}`"
        >
          <canvas :ref="(element) => setPageCanvas(element, pageNumber)" />
          <span class="pdf-page__number">{{ pageNumber }} / {{ pageNumbers.length }}</span>
        </section>
      </template>
    </section>
  </main>
</template>

<style scoped>
.detail-page {
  width: min(100%, 1180px);
  margin: 0 auto;
}

.report-toolbar {
  position: sticky;
  z-index: 5;
  top: calc(var(--workspace-topbar-offset, 0px) + 10px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  backdrop-filter: blur(14px);
}

.back-link,
.secondary-button {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  padding: 10px 14px;
  background: var(--color-surface);
  color: var(--color-primary);
  font-weight: 850;
  text-decoration: none;
}

.report-toolbar__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.back-link {
  min-height: auto;
  border-color: transparent;
  padding-inline: 4px;
}

.pdf-viewer {
  display: grid;
  justify-items: center;
  gap: 24px;
  min-height: 65vh;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 24px;
  background: #dfe5e0;
  box-shadow: inset 0 1px 8px rgba(16, 49, 31, 0.08);
}

.pdf-page {
  position: relative;
  display: grid;
  max-width: 100%;
  justify-items: center;
}

.pdf-page canvas {
  display: block;
  max-width: 100%;
  height: auto;
  background: #fff;
  box-shadow: 0 12px 34px rgba(20, 54, 34, 0.2);
}

.pdf-page__number {
  position: absolute;
  right: 10px;
  bottom: 10px;
  border-radius: 999px;
  padding: 4px 8px;
  background: rgba(17, 50, 31, 0.78);
  color: #fff;
  font-size: 0.68rem;
  font-weight: 800;
  opacity: 0;
  transition: opacity 0.18s ease;
}

.pdf-page:hover .pdf-page__number,
.pdf-page:focus-within .pdf-page__number {
  opacity: 1;
}

.render-progress {
  position: sticky;
  z-index: 4;
  top: 88px;
  border-radius: 999px;
  padding: 8px 13px;
  background: rgba(17, 50, 31, 0.9);
  color: #fff;
  font-size: 0.76rem;
  font-weight: 800;
  box-shadow: 0 8px 20px rgba(17, 50, 31, 0.18);
}

.viewer-state {
  display: grid;
  width: min(100%, 620px);
  min-height: 280px;
  align-content: center;
  justify-items: center;
  gap: 14px;
  padding: 36px;
  color: var(--color-text-muted);
  text-align: center;
}

.viewer-state p {
  margin: 0;
}

.viewer-state--error strong,
.viewer-state--error p {
  color: var(--color-danger);
}

.viewer-spinner {
  width: 34px;
  height: 34px;
  border: 4px solid #d7e6d8;
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media print {
  .report-toolbar,
  .render-progress,
  .pdf-page__number {
    display: none !important;
  }

  .screen-page,
  .pdf-viewer {
    min-height: 0;
    border: 0;
    padding: 0;
    background: #fff;
    box-shadow: none;
  }

  .pdf-page {
    page-break-after: always;
  }

  .pdf-page canvas {
    width: 100% !important;
    height: auto !important;
    box-shadow: none;
  }
}

@media (max-width: 620px) {
  .report-toolbar {
    top: calc(var(--workspace-topbar-offset, 0px) + 6px);
  }

  .report-toolbar .primary-button {
    min-height: 42px;
    padding-inline: 12px;
  }

  .report-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .report-toolbar__actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .report-toolbar__actions > :only-child {
    grid-column: 1 / -1;
  }

  .pdf-viewer {
    gap: 12px;
    border-radius: 8px;
    padding: 8px;
  }

  .render-progress {
    top: 78px;
  }

  .viewer-state {
    padding: 22px;
  }
}
</style>
