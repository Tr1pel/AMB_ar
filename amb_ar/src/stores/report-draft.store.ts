import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { PRODUCT_OPTIONS } from '@/shared/constants/products'
import {
  createReportDraft,
  createReportDraftFromTemplate,
  generateReportDocumentOnServer,
  getReportDraftDetails,
  listArchivedReportDrafts,
  listReportDrafts,
  listWorkerReportDrafts,
  permanentlyDeleteArchivedReport,
  restoreArchivedReport,
  saveGeneratedDocument,
  softDeleteReportDraft,
  submitReportDraft,
  synchronizeWorkerReportDrafts,
  type CreateReportDraftInput,
  type SaveReportDraftOptions,
} from '@/shared/repositories/report-draft-repository'
import { useAuthStore } from '@/stores/auth.store'
import type { GeneratedDocument, ProductPhoto, ReportDraft } from '@/types/report'

export const useReportDraftStore = defineStore('reportDraft', () => {
  const reports = ref<ReportDraft[]>([])
  const archivedReports = ref<ReportDraft[]>([])
  const selectedReport = ref<ReportDraft | null>(null)
  const selectedPhotos = ref<ProductPhoto[]>([])
  const selectedDocuments = ref<GeneratedDocument[]>([])
  const isLoading = ref(false)
  const isSaving = ref(false)
  const errorMessage = ref<string | null>(null)
  let workerSynchronizationPromise: Promise<void> | null = null

  window.addEventListener('amb-ar-report-synchronized', (event) => {
    const reportId = (event as CustomEvent<{ reportId?: string }>).detail?.reportId
    const authStore = useAuthStore()

    if (!reportId || !authStore.currentAccount) {
      return
    }

    if (selectedReport.value?.id === reportId) {
      void loadReport(reportId)
    }

    if (authStore.isWorker) {
      void refreshWorkerReports()
    } else if (authStore.isAdmin) {
      void refreshReports()
    }
  })

  const hasReports = computed(() => reports.value.length > 0)
  const latestWorkerDraft = computed(() =>
    reports.value
      .filter((report) => report.status === 'draft')
      .reduce<ReportDraft | null>(
        (latest, report) => (!latest || report.updatedAt > latest.updatedAt ? report : latest),
        null,
      ),
  )

  async function refreshReports(): Promise<void> {
    const authStore = useAuthStore()

    reports.value = await listReportDrafts(
      authStore.isAdmin && authStore.currentAccount ? authStore.currentAccount.id : undefined,
    )
  }

  async function refreshWorkerReports(): Promise<void> {
    const authStore = useAuthStore()

    reports.value = authStore.currentAccount
      ? await listWorkerReportDrafts(authStore.currentAccount.id)
      : []
  }

  async function refreshArchivedReports(): Promise<void> {
    const authStore = useAuthStore()

    archivedReports.value =
      authStore.isAdmin && authStore.currentAccount
        ? await listArchivedReportDrafts(authStore.currentAccount.id)
        : []
  }

  function refreshReportListsInBackground(): void {
    const authStore = useAuthStore()
    const refreshTask = authStore.isWorker
      ? refreshWorkerReports()
      : authStore.isAdmin
        ? Promise.all([refreshReports(), refreshArchivedReports()])
        : Promise.resolve()

    void refreshTask.catch(() => undefined)
  }

  async function loadWorkerHistory(): Promise<void> {
    isLoading.value = true
    errorMessage.value = null

    try {
      await refreshWorkerReports()
      void synchronizeWorkerReports()
    } catch (error) {
      errorMessage.value = getErrorMessage(error)
    } finally {
      isLoading.value = false
    }
  }

  function synchronizeWorkerReports(): Promise<void> {
    if (workerSynchronizationPromise) {
      return workerSynchronizationPromise
    }

    const accountId = useAuthStore().currentAccount?.id

    if (!accountId) {
      return Promise.resolve()
    }

    workerSynchronizationPromise = synchronizeWorkerReportDrafts(accountId)
      .then((synchronizedReports) => {
        reports.value = synchronizedReports
      })
      .catch((error) => {
        if (!reports.value.length) {
          errorMessage.value = getErrorMessage(error)
        }
      })
      .finally(() => {
        workerSynchronizationPromise = null
      })

    return workerSynchronizationPromise
  }

  async function loadHome(): Promise<void> {
    isLoading.value = true
    errorMessage.value = null

    try {
      await refreshReports()
    } catch (error) {
      errorMessage.value = getErrorMessage(error)
    } finally {
      isLoading.value = false
    }
  }

  async function loadArchive(): Promise<void> {
    isLoading.value = true
    errorMessage.value = null

    try {
      await refreshArchivedReports()
    } catch (error) {
      errorMessage.value = getErrorMessage(error)
    } finally {
      isLoading.value = false
    }
  }

  async function createReport(
    input: CreateReportDraftInput,
    options: SaveReportDraftOptions = {},
  ): Promise<ReportDraft | null> {
    isSaving.value = true
    errorMessage.value = null

    try {
      const authStore = useAuthStore()
      const result = await createReportDraft(input, {
        ...options,
        accountId: authStore.currentAccount?.id,
      })

      selectedReport.value = result.draft
      selectedPhotos.value = result.photos
      selectedDocuments.value = result.documents

      refreshReportListsInBackground()

      return result.draft
    } catch (error) {
      errorMessage.value = getErrorMessage(error)

      return null
    } finally {
      isSaving.value = false
    }
  }

  async function startReportFromTemplate(templateId: string): Promise<ReportDraft | null> {
    const authStore = useAuthStore()

    if (!authStore.currentAccount || !authStore.isWorker) {
      errorMessage.value = 'Нужно войти под аккаунтом инспектора'
      return null
    }

    isSaving.value = true
    errorMessage.value = null

    try {
      const result = await createReportDraftFromTemplate(
        templateId,
        authStore.currentAccount.id,
        authStore.currentAccount.fullName,
      )

      selectedReport.value = result.draft
      selectedPhotos.value = result.photos
      selectedDocuments.value = result.documents
      refreshReportListsInBackground()

      return result.draft
    } catch (error) {
      errorMessage.value = getErrorMessage(error)
      return null
    } finally {
      isSaving.value = false
    }
  }

  async function loadReport(reportId: string): Promise<void> {
    isLoading.value = true
    errorMessage.value = null
    selectedReport.value = null
    selectedPhotos.value = []
    selectedDocuments.value = []

    try {
      const accountId = useAuthStore().currentAccount?.id
      const details = accountId ? await getReportDraftDetails(reportId, accountId) : null

      selectedReport.value = details?.draft ?? null
      selectedPhotos.value = details?.photos ?? []
      selectedDocuments.value = details?.documents ?? []
    } catch (error) {
      errorMessage.value = getErrorMessage(error)
    } finally {
      isLoading.value = false
    }
  }

  async function deleteReport(reportId: string): Promise<boolean> {
    const authStore = useAuthStore()

    if (!authStore.currentAccount?.id) {
      errorMessage.value = 'Нужно войти в систему'
      return false
    }

    isSaving.value = true
    errorMessage.value = null

    try {
      await softDeleteReportDraft(reportId, authStore.currentAccount.id)

      if (selectedReport.value?.id === reportId) {
        selectedReport.value = null
        selectedPhotos.value = []
        selectedDocuments.value = []
      }

      refreshReportListsInBackground()

      return true
    } catch (error) {
      errorMessage.value = getErrorMessage(error)

      return false
    } finally {
      isSaving.value = false
    }
  }

  async function deleteArchivedReport(reportId: string): Promise<boolean> {
    const authStore = useAuthStore()

    if (!authStore.isAdmin || !authStore.currentAccount?.id) {
      errorMessage.value = 'Нужно войти под администратором'
      return false
    }

    isSaving.value = true
    errorMessage.value = null

    try {
      await permanentlyDeleteArchivedReport(reportId, authStore.currentAccount.id)
      archivedReports.value = archivedReports.value.filter((report) => report.id !== reportId)

      if (selectedReport.value?.id === reportId) {
        selectedReport.value = null
        selectedPhotos.value = []
        selectedDocuments.value = []
      }

      return true
    } catch (error) {
      errorMessage.value = getErrorMessage(error)
      return false
    } finally {
      isSaving.value = false
    }
  }

  async function restoreReport(reportId: string): Promise<boolean> {
    const authStore = useAuthStore()

    if (!authStore.isAdmin || !authStore.currentAccount?.id) {
      errorMessage.value = 'Нужно войти под администратором'
      return false
    }

    isSaving.value = true
    errorMessage.value = null

    try {
      await restoreArchivedReport(reportId, authStore.currentAccount.id)
      await Promise.all([refreshReports(), refreshArchivedReports()])

      return true
    } catch (error) {
      errorMessage.value = getErrorMessage(error)
      return false
    } finally {
      isSaving.value = false
    }
  }

  async function saveDocument(
    reportId: string,
    documentBlob: Blob,
    fileName: string,
    mimeType: string,
  ): Promise<GeneratedDocument | null> {
    isSaving.value = true
    errorMessage.value = null

    try {
      const accountId = useAuthStore().currentAccount?.id

      if (!accountId) {
        throw new Error('Нужно войти в систему')
      }

      const document = await saveGeneratedDocument(
        reportId,
        documentBlob,
        fileName,
        mimeType,
        accountId,
      )

      selectedDocuments.value = [...selectedDocuments.value, document]
      refreshReportListsInBackground()

      return document
    } catch (error) {
      errorMessage.value = getErrorMessage(error)

      return null
    } finally {
      isSaving.value = false
    }
  }

  async function generateDocument(reportId: string): Promise<GeneratedDocument | null> {
    isSaving.value = true
    errorMessage.value = null

    try {
      const accountId = useAuthStore().currentAccount?.id

      if (!accountId) {
        throw new Error('Нужно войти в систему')
      }

      const details = await getReportDraftDetails(reportId, accountId)

      if (!details) {
        throw new Error('Отчет не найден')
      }

      const existingDocument = [...details.documents]
        .sort((first, second) => first.generatedAt - second.generatedAt)
        .at(-1)
      const document =
        existingDocument ?? (details.draft.status === 'draft'
          ? await generateLocalDocument(details.draft, details.photos, accountId)
          : await generateReportDocumentOnServer(reportId, accountId))

      selectedDocuments.value = [...selectedDocuments.value, document]
      refreshReportListsInBackground()

      return document
    } catch (error) {
      errorMessage.value = getErrorMessage(error)
      return null
    } finally {
      isSaving.value = false
    }
  }

  async function generateLocalDocument(
    report: ReportDraft,
    photos: ProductPhoto[],
    accountId: string,
  ): Promise<GeneratedDocument> {
    const { generateReportPdfInBrowser } = await import('@/shared/reports/browser-report-pdf')
    const generated = await generateReportPdfInBrowser(report, photos)

    return saveGeneratedDocument(
      report.id,
      generated.blob,
      generated.fileName,
      'application/pdf',
      accountId,
    )
  }

  async function submitReport(reportId: string): Promise<ReportDraft | null> {
    isSaving.value = true
    errorMessage.value = null

    try {
      const authStore = useAuthStore()
      const accountId = authStore.currentAccount?.id

      if (!accountId || !authStore.isWorker) {
        throw new Error('Нужно войти под аккаунтом инспектора')
      }

      const details = await submitReportDraft(reportId, accountId)

      selectedReport.value = details.draft
      selectedPhotos.value = details.photos
      selectedDocuments.value = details.documents
      refreshReportListsInBackground()

      return details.draft
    } catch (error) {
      errorMessage.value = getErrorMessage(error)
      return null
    } finally {
      isSaving.value = false
    }
  }

  function setError(error: unknown): void {
    errorMessage.value = getErrorMessage(error)
  }

  function clearError(): void {
    errorMessage.value = null
  }

  return {
    productOptions: PRODUCT_OPTIONS,
    reports,
    archivedReports,
    selectedReport,
    selectedPhotos,
    selectedDocuments,
    isLoading,
    isSaving,
    errorMessage,
    hasReports,
    latestWorkerDraft,
    refreshReports,
    refreshArchivedReports,
    refreshWorkerReports,
    loadHome,
    loadArchive,
    loadWorkerHistory,
    createReport,
    startReportFromTemplate,
    loadReport,
    deleteReport,
    deleteArchivedReport,
    restoreReport,
    saveDocument,
    generateDocument,
    submitReport,
    setError,
    clearError,
  }
})

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось сохранить данные'
}
