import { apiDelete, apiGet, apiPost } from '@/shared/api/server-api'
import type { Account, AccountRole } from '@/types/report'

export interface SaveAccountInput {
  id?: string
  loginNumber: string
  fullName: string
  role: AccountRole
  isActive?: boolean
}

export class AccountRepository {
  async ensureSeeds(): Promise<void> {
    await apiPost('/api/bootstrap')
  }

  async findByLoginNumber(loginNumber: string): Promise<Account | null> {
    const normalizedLoginNumber = loginNumber.trim()

    if (!normalizedLoginNumber) {
      return null
    }

    try {
      return await apiGet<Account>(
        `/api/accounts/login?loginNumber=${encodeURIComponent(normalizedLoginNumber)}`,
      )
    } catch (error) {
      if (isNotFound(error)) {
        return null
      }

      throw error
    }
  }

  async getAvailable(accountId: string): Promise<Account | null> {
    try {
      return await apiGet<Account>(`/api/accounts/${encodeURIComponent(accountId)}`)
    } catch (error) {
      if (isNotFound(error)) {
        return null
      }

      throw error
    }
  }

  async getDemo(role: AccountRole): Promise<Account | null> {
    await this.ensureSeeds()

    try {
      return await apiGet<Account>(`/api/accounts/demo?role=${encodeURIComponent(role)}`)
    } catch (error) {
      if (isNotFound(error)) {
        return null
      }

      throw error
    }
  }

  async list(adminAccountId: string): Promise<Account[]> {
    return apiGet<Account[]>('/api/accounts', adminAccountId)
  }

  async save(input: SaveAccountInput, adminAccountId: string): Promise<Account> {
    return apiPost<Account>('/api/accounts', input, adminAccountId)
  }

  async softDelete(accountId: string, adminAccountId: string): Promise<void> {
    await apiDelete(`/api/accounts/${encodeURIComponent(accountId)}`, adminAccountId)
  }
}

export const accountRepository = new AccountRepository()

export async function ensureSeedAccounts(): Promise<void> {
  await accountRepository.ensureSeeds()
}

export async function findAccountByLoginNumber(loginNumber: string): Promise<Account | null> {
  return accountRepository.findByLoginNumber(loginNumber)
}

export async function getAccount(accountId: string): Promise<Account | null> {
  return accountRepository.getAvailable(accountId)
}

export async function getDemoAccount(role: AccountRole): Promise<Account | null> {
  return accountRepository.getDemo(role)
}

export async function listAccounts(adminAccountId: string): Promise<Account[]> {
  return accountRepository.list(adminAccountId)
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

function isNotFound(error: unknown): boolean {
  return error instanceof Error && /не найден|404/i.test(error.message)
}
