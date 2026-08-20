import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import {
  cacheAccount,
  clearOtherAccountsPersonalData,
  inspectLocalAccountTransition,
} from '@/shared/offline/offline-database'
import {
  getCurrentAccount,
  signInAccount,
  signInDemoAccount,
  signOutAccount,
} from '@/shared/repositories/account-repository'
import { requestConfirmation } from '@/shared/ui/confirmation-dialog'
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

      if (!(await prepareLocalAccountTransition(account))) {
        await signOutAccount()
        errorMessage.value =
          'Вход отменен: сначала синхронизируйте предыдущий аккаунт или удалите его локальные данные.'
        return null
      }

      await setCurrentAccount(account)

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
    window.dispatchEvent(new CustomEvent('amb-ar-sync-updated'))

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

      if (!(await prepareLocalAccountTransition(account))) {
        await signOutAccount()
        errorMessage.value =
          'Вход отменен: сначала синхронизируйте предыдущий аккаунт или удалите его локальные данные.'
        return null
      }

      await setCurrentAccount(account)
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

  async function setCurrentAccount(account: Account): Promise<void> {
    await cacheAccount(account)
    currentAccount.value = account
    isInitialized.value = true
    window.dispatchEvent(new CustomEvent('amb-ar-sync-updated'))
  }

  async function prepareLocalAccountTransition(account: Account): Promise<boolean> {
    const transition = await inspectLocalAccountTransition(account.id)

    if (!transition.hasPersonalData) {
      return true
    }

    if (!transition.hasPendingChanges) {
      await clearOtherAccountsPersonalData(account.id)
      return true
    }

    const shouldDiscard = await requestConfirmation({
      title: 'Есть неотправленные отчёты',
      message:
        'В браузере есть локальные изменения другого аккаунта, которые ещё не подтверждены сервером.\n\nОтмена: вернитесь в предыдущий аккаунт и дождитесь синхронизации.\nУдалить: безвозвратно удалить только локальные отчёты, фото, PDF и очередь отправки предыдущего аккаунта.',
      confirmLabel: 'Удалить локальные данные',
      destructive: true,
    })

    if (!shouldDiscard) {
      return false
    }

    await clearOtherAccountsPersonalData(account.id)
    return true
  }
})

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось войти в аккаунт'
}
