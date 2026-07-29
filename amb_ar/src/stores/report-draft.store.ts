import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { PRODUCT_OPTIONS } from '@/shared/constants/products'
import {
  createReportDraft,
  getReportDraftDetails,
  listReportDrafts,
  listWorkerReportDrafts,
  saveGeneratedDocument,
  softDeleteReportDraft,
  type CreateReportDraftInput,
} from '@/shared/repositories/report-draft-repository'
import { useAuthStore } from '@/stores/auth.store'
import type { GeneratedDocument, ProductPhoto, ReportDraft } from '@/types/report'

export const useReportDraftStore = defineStore('reportDraft', () => {
  const reports = ref<ReportDraft[]>([])
  const selectedReport = ref<ReportDraft | null>(null)
  const selectedPhotos = ref<ProductPhoto[]>([])
  const selectedDocuments = ref<GeneratedDocument[]>([])
  const isLoading = ref(false)
  const isSaving = ref(false)
  const errorMessage = ref<string | null>(null)

  const hasReports = computed(() => reports.value.length > 0)

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

  async function loadWorkerHistory(): Promise<void> {
    isLoading.value = true
    errorMessage.value = null

    try {
      await refreshWorkerReports()
    } catch (error) {
      errorMessage.value = getErrorMessage(error)
    } finally {
      isLoading.value = false
    }
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

  async function createReport(input: CreateReportDraftInput): Promise<ReportDraft | null> {
    isSaving.value = true
    errorMessage.value = null

    try {
      const result = await createReportDraft(input)

      selectedReport.value = result.draft
      selectedPhotos.value = result.photos
      selectedDocuments.value = result.documents
      await refreshReports()

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

    try {
      const details = await getReportDraftDetails(reportId)

      selectedReport.value = details?.draft ?? null
      selectedPhotos.value = details?.photos ?? []
      selectedDocuments.value = details?.documents ?? []
    } catch (error) {
      errorMessage.value = getErrorMessage(error)
    } finally {
      isLoading.value = false
    }
  }

  async function deleteReport(reportId: string): Promise<void> {
    await softDeleteReportDraft(reportId)

    if (selectedReport.value?.id === reportId) {
      selectedReport.value = null
      selectedPhotos.value = []
      selectedDocuments.value = []
    }

    await refreshReports()
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
      const document = await saveGeneratedDocument(reportId, documentBlob, fileName, mimeType)

      selectedDocuments.value = [...selectedDocuments.value, document]
      await loadReport(reportId)

      return document
    } catch (error) {
      errorMessage.value = getErrorMessage(error)

      return null
    } finally {
      isSaving.value = false
    }
  }

  return {
    productOptions: PRODUCT_OPTIONS,
    reports,
    selectedReport,
    selectedPhotos,
    selectedDocuments,
    isLoading,
    isSaving,
    errorMessage,
    hasReports,
    refreshReports,
    refreshWorkerReports,
    loadHome,
    loadWorkerHistory,
    createReport,
    loadReport,
    deleteReport,
    saveDocument,
  }
})

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось сохранить локальные данные'
}
