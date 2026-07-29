import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import {
  ensureSeedReportTemplateOptions,
  listReportTemplateOptions,
  saveReportTemplateOption,
  softDeleteReportTemplateOption,
  type SaveReportTemplateOptionInput,
} from '@/shared/repositories/report-template-repository'
import { useAuthStore } from '@/stores/auth.store'
import type { ProductOption, ReportTemplateField, ReportTemplateOption } from '@/types/report'

export const useReportTemplateStore = defineStore('reportTemplate', () => {
  const options = ref<ReportTemplateOption[]>([])
  const isLoading = ref(false)
  const isSaving = ref(false)
  const errorMessage = ref<string | null>(null)

  const productOptions = computed<ProductOption[]>(() =>
    getOptionsByField('productId').map((option) => ({
      id: option.value,
      label: option.label,
      category: option.category,
    })),
  )

  function getOptionsByField(field: ReportTemplateField): ReportTemplateOption[] {
    return options.value
      .filter((option) => option.field === field && option._deletedAt === undefined)
      .sort((firstOption, secondOption) => firstOption.sortOrder - secondOption.sortOrder)
  }

  function getOptionLabel(field: ReportTemplateField, value: string): string {
    return getOptionsByField(field).find((option) => option.value === value)?.label ?? ''
  }

  async function loadOptions(): Promise<void> {
    isLoading.value = true
    errorMessage.value = null

    try {
      await ensureSeedReportTemplateOptions()
      options.value = await listReportTemplateOptions()
    } catch (error) {
      errorMessage.value = getErrorMessage(error)
    } finally {
      isLoading.value = false
    }
  }

  async function saveOption(input: SaveReportTemplateOptionInput): Promise<void> {
    const authStore = useAuthStore()

    if (!authStore.currentAccount?.id) {
      errorMessage.value = 'Нужно войти под администратором'
      return
    }

    isSaving.value = true
    errorMessage.value = null

    try {
      await saveReportTemplateOption(input, authStore.currentAccount.id)
      options.value = await listReportTemplateOptions()
    } catch (error) {
      errorMessage.value = getErrorMessage(error)
    } finally {
      isSaving.value = false
    }
  }

  async function deleteOption(optionId: string): Promise<void> {
    const authStore = useAuthStore()

    if (!authStore.currentAccount?.id) {
      errorMessage.value = 'Нужно войти под администратором'
      return
    }

    isSaving.value = true
    errorMessage.value = null

    try {
      await softDeleteReportTemplateOption(optionId, authStore.currentAccount.id)
      options.value = await listReportTemplateOptions()
    } catch (error) {
      errorMessage.value = getErrorMessage(error)
    } finally {
      isSaving.value = false
    }
  }

  return {
    options,
    productOptions,
    isLoading,
    isSaving,
    errorMessage,
    getOptionsByField,
    getOptionLabel,
    loadOptions,
    saveOption,
    deleteOption,
  }
})

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось обновить параметры макета'
}
