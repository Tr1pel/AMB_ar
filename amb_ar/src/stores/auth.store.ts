import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import {
  ensureSeedAccounts,
  findAccountByLoginNumber,
  getAccount,
} from '@/shared/repositories/account-repository'
import type { Account, AccountRole } from '@/types/report'

const CURRENT_ACCOUNT_STORAGE_KEY = 'amb-ar-current-account-id'

export const useAuthStore = defineStore('auth', () => {
  const currentAccount = ref<Account | null>(null)
  const isInitialized = ref(false)
  const isLoading = ref(false)
  const errorMessage = ref<string | null>(null)

  const isAuthenticated = computed(() => currentAccount.value !== null)
  const currentRole = computed<AccountRole | null>(() => currentAccount.value?.role ?? null)
  const isAdmin = computed(() => currentRole.value === 'admin')
  const isWorker = computed(() => currentRole.value === 'worker')

  async function initialize(): Promise<void> {
    if (isInitialized.value) {
      return
    }

    isLoading.value = true
    errorMessage.value = null

    try {
      await ensureSeedAccounts()

      const accountId = localStorage.getItem(CURRENT_ACCOUNT_STORAGE_KEY)

      currentAccount.value = accountId ? await getAccount(accountId) : null

      if (!currentAccount.value) {
        localStorage.removeItem(CURRENT_ACCOUNT_STORAGE_KEY)
      }

      isInitialized.value = true
    } catch (error) {
      errorMessage.value = getErrorMessage(error)
    } finally {
      isLoading.value = false
    }
  }

  async function signIn(loginNumber: string): Promise<Account | null> {
    isLoading.value = true
    errorMessage.value = null

    try {
      await ensureSeedAccounts()

      const account = await findAccountByLoginNumber(loginNumber)

      if (!account) {
        errorMessage.value = 'Аккаунт с таким номером не найден'

        return null
      }

      currentAccount.value = account
      localStorage.setItem(CURRENT_ACCOUNT_STORAGE_KEY, account.id)
      isInitialized.value = true

      return account
    } catch (error) {
      errorMessage.value = getErrorMessage(error)

      return null
    } finally {
      isLoading.value = false
    }
  }

  function signOut(): void {
    currentAccount.value = null
    errorMessage.value = null
    localStorage.removeItem(CURRENT_ACCOUNT_STORAGE_KEY)
  }

  return {
    currentAccount,
    isInitialized,
    isLoading,
    errorMessage,
    isAuthenticated,
    currentRole,
    isAdmin,
    isWorker,
    initialize,
    signIn,
    signOut,
  }
})

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось войти в аккаунт'
}
