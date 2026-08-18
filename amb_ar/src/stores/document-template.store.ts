import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import {
  documentTemplateRepository,
  listDocumentTemplates,
  type SaveDocumentTemplateInput,
} from '@/shared/repositories/document-template-repository'
import { useAuthStore } from '@/stores/auth.store'
import type { DocumentTemplate } from '@/types/report'

export const useDocumentTemplateStore = defineStore('documentTemplate', () => {
  const templates = ref<DocumentTemplate[]>([])
  const isLoading = ref(false)
  const isSaving = ref(false)
  const errorMessage = ref<string | null>(null)

  const activeTemplate = computed(
    () => templates.value.find((template) => template.status === 'active') ?? null,
  )
  const activeTemplates = computed(() =>
    templates.value.filter((template) => template.status === 'active'),
  )

  async function loadTemplates(): Promise<void> {
    isLoading.value = true
    errorMessage.value = null

    try {
      templates.value = await listDocumentTemplates()
    } catch (error) {
      errorMessage.value = getErrorMessage(error)
    } finally {
      isLoading.value = false
    }
  }

  async function createEmpty(): Promise<DocumentTemplate | null> {
    return runMutation((adminAccountId) =>
      documentTemplateRepository.createEmpty(adminAccountId),
    )
  }

  async function save(input: SaveDocumentTemplateInput): Promise<DocumentTemplate | null> {
    return runMutation((adminAccountId) =>
      documentTemplateRepository.save(input, adminAccountId),
    )
  }

  async function edit(templateId: string): Promise<DocumentTemplate | null> {
    errorMessage.value = null

    try {
      return await documentTemplateRepository.getById(templateId)
    } catch (error) {
      errorMessage.value = getErrorMessage(error)
      return null
    }
  }

  async function duplicate(templateId: string): Promise<DocumentTemplate | null> {
    return runMutation((adminAccountId) =>
      documentTemplateRepository.duplicate(templateId, adminAccountId),
    )
  }

  async function publish(templateId: string): Promise<DocumentTemplate | null> {
    return runMutation((adminAccountId) =>
      documentTemplateRepository.publish(templateId, adminAccountId),
    )
  }

  async function deleteTemplate(templateId: string): Promise<boolean> {
    const result = await runMutation(async (adminAccountId) => {
      await documentTemplateRepository.softDelete(templateId, adminAccountId)
      return true
    })

    return result ?? false
  }

  async function runMutation<T>(
    mutation: (adminAccountId: string) => Promise<T>,
  ): Promise<T | null> {
    const authStore = useAuthStore()

    if (!authStore.currentAccount?.id) {
      errorMessage.value = 'Нужно войти под администратором'
      return null
    }

    isSaving.value = true
    errorMessage.value = null

    try {
      const result = await mutation(authStore.currentAccount.id)

      templates.value = await listDocumentTemplates()
      return result
    } catch (error) {
      errorMessage.value = getErrorMessage(error)
      return null
    } finally {
      isSaving.value = false
    }
  }

  return {
    templates,
    activeTemplate,
    activeTemplates,
    isLoading,
    isSaving,
    errorMessage,
    loadTemplates,
    createEmpty,
    save,
    edit,
    duplicate,
    publish,
    deleteTemplate,
  }
})

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось сохранить макет'
}
