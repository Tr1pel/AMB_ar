import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import {
  getCurrentAccount,
  signInAccount,
  signInDemoAccount,
  signOutAccount,
} from '@/shared/repositories/account-repository'
import type { Account, AccountRole } from '@/types/report'

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
      currentAccount.value = await getCurrentAccount()
      isInitialized.value = true
    } catch (error) {
      errorMessage.value = getErrorMessage(error)
    } finally {
      isLoading.value = false
    }
  }

  async function signIn(loginNumber: string, password: string): Promise<Account | null> {
    isLoading.value = true
    errorMessage.value = null

    try {
      const account = await signInAccount(loginNumber, password)

      setCurrentAccount(account)

      return account
    } catch (error) {
      errorMessage.value = getErrorMessage(error)

      return null
    } finally {
      isLoading.value = false
    }
  }

  async function signOut(): Promise<void> {
    currentAccount.value = null
    errorMessage.value = null

    try {
      await signOutAccount()
    } catch (error) {
      errorMessage.value = getErrorMessage(error)
    }
  }

  async function signInAsRole(role: AccountRole): Promise<Account | null> {
    isLoading.value = true
    errorMessage.value = null

    try {
      const account = await signInDemoAccount(role)
      setCurrentAccount(account)
      return account
    } catch (error) {
      errorMessage.value = getErrorMessage(error)
      return null
    } finally {
      isLoading.value = false
    }
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
    signInAsRole,
    signOut,
  }

  function setCurrentAccount(account: Account): void {
    currentAccount.value = account
    isInitialized.value = true
  }
})

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось войти в аккаунт'
}
