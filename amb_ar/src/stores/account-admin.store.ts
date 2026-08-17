import { ref } from 'vue'
import { defineStore } from 'pinia'

import {
  listAccounts,
  saveAccount,
  softDeleteAccount,
  type SaveAccountInput,
} from '@/shared/repositories/account-repository'
import { useAuthStore } from '@/stores/auth.store'
import type { Account } from '@/types/report'

export const useAccountAdminStore = defineStore('accountAdmin', () => {
  const accounts = ref<Account[]>([])
  const isLoading = ref(false)
  const isSaving = ref(false)
  const errorMessage = ref<string | null>(null)

  async function loadAccounts(): Promise<void> {
    const authStore = useAuthStore()

    if (!authStore.currentAccount?.id) {
      errorMessage.value = 'Нужно войти под администратором'
      return
    }

    isLoading.value = true
    errorMessage.value = null

    try {
      accounts.value = await listAccounts(authStore.currentAccount.id)
    } catch (error) {
      errorMessage.value = getErrorMessage(error)
    } finally {
      isLoading.value = false
    }
  }

  async function save(input: SaveAccountInput): Promise<boolean> {
    const authStore = useAuthStore()

    if (!authStore.currentAccount?.id) {
      errorMessage.value = 'Нужно войти под администратором'
      return false
    }

    isSaving.value = true
    errorMessage.value = null

    try {
      await saveAccount(input, authStore.currentAccount.id)
      accounts.value = await listAccounts(authStore.currentAccount.id)
      return true
    } catch (error) {
      errorMessage.value = getErrorMessage(error)
      return false
    } finally {
      isSaving.value = false
    }
  }

  async function deleteAccount(accountId: string): Promise<void> {
    const authStore = useAuthStore()

    if (!authStore.currentAccount?.id) {
      errorMessage.value = 'Нужно войти под администратором'
      return
    }

    isSaving.value = true
    errorMessage.value = null

    try {
      await softDeleteAccount(accountId, authStore.currentAccount.id)
      accounts.value = await listAccounts(authStore.currentAccount.id)
    } catch (error) {
      errorMessage.value = getErrorMessage(error)
    } finally {
      isSaving.value = false
    }
  }

  return {
    accounts,
    isLoading,
    isSaving,
    errorMessage,
    loadAccounts,
    save,
    deleteAccount,
  }
})

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось обновить аккаунты'
}
