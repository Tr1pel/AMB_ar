import { apiDelete, apiGet, apiPost } from '@/shared/api/server-api'
import type { Account, AccountRole } from '@/types/report'

export interface SaveAccountInput {
  id?: string
  loginNumber: string
  fullName: string
  role: AccountRole
  isActive?: boolean
  password?: string
}

export class AccountRepository {
  async signIn(loginNumber: string, password: string): Promise<Account> {
    return apiPost<Account>('/api/auth/login', { loginNumber: loginNumber.trim(), password })
  }

  async signInDemo(role: AccountRole): Promise<Account> {
    return apiPost<Account>('/api/auth/demo', { role })
  }

  async getCurrent(): Promise<Account | null> {
    try {
      return await apiGet<Account>('/api/auth/session')
    } catch (error) {
      if (isUnauthenticated(error)) {
        return null
      }

      throw error
    }
  }

  async signOut(): Promise<void> {
    await apiPost('/api/auth/logout')
  }

  async list(adminAccountId: string): Promise<Account[]> {
    return apiGet<Account[]>('/api/accounts', adminAccountId)
  }

  async generateLoginNumber(role: AccountRole, adminAccountId: string): Promise<string> {
    const result = await apiPost<{ loginNumber: string }>(
      '/api/accounts/generate-login-number',
      { role },
      adminAccountId,
    )
    return result.loginNumber
  }

  async save(input: SaveAccountInput, adminAccountId: string): Promise<Account> {
    return apiPost<Account>('/api/accounts', input, adminAccountId)
  }

  async softDelete(accountId: string, adminAccountId: string): Promise<void> {
    await apiDelete(`/api/accounts/${encodeURIComponent(accountId)}`, adminAccountId)
  }
}

export const accountRepository = new AccountRepository()

export async function signInAccount(loginNumber: string, password: string): Promise<Account> {
  return accountRepository.signIn(loginNumber, password)
}

export async function signInDemoAccount(role: AccountRole): Promise<Account> {
  return accountRepository.signInDemo(role)
}

export async function getCurrentAccount(): Promise<Account | null> {
  return accountRepository.getCurrent()
}

export async function signOutAccount(): Promise<void> {
  await accountRepository.signOut()
}

export async function listAccounts(adminAccountId: string): Promise<Account[]> {
  return accountRepository.list(adminAccountId)
}

export async function generateAccountLoginNumber(
  role: AccountRole,
  adminAccountId: string,
): Promise<string> {
  return accountRepository.generateLoginNumber(role, adminAccountId)
}

export async function saveAccount(
  input: SaveAccountInput,
  adminAccountId: string,
): Promise<Account> {
  return accountRepository.save(input, adminAccountId)
}

export async function softDeleteAccount(
  accountId: string,
  adminAccountId: string,
): Promise<void> {
  await accountRepository.softDelete(accountId, adminAccountId)
}

function isUnauthenticated(error: unknown): boolean {
  return error instanceof Error && /требуется вход|401/i.test(error.message)
}
