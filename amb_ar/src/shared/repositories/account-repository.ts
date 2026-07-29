import { SEED_ACCOUNTS } from '@/shared/constants/accounts'
import {
  createServerAccount,
  deleteServerAccount,
  fetchServerAccounts,
  findServerAccountByLoginNumber,
  getServerAccount,
  updateServerAccount,
} from '@/shared/api/server-api'
import { appDb } from '@/shared/db/app-db'
import { createSyncMetadata } from '@/shared/sync/sync-metadata'
import type { Account } from '@/types/report'

export interface SaveAccountInput {
  id?: string
  loginNumber: string
  fullName: string
  role: Account['role']
  isActive?: boolean
}

export async function ensureSeedAccounts(): Promise<void> {
  const now = Date.now()
  const existingCount = await appDb.accounts.count()

  if (existingCount > 0) {
    return
  }

  await appDb.accounts.bulkPut(
    SEED_ACCOUNTS.map<Account>((account) => ({
      id: account.id,
      loginNumber: account.loginNumber,
      fullName: account.fullName,
      role: account.role,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      ...createSyncMetadata('synced'),
    })),
  )
}

export async function findAccountByLoginNumber(loginNumber: string): Promise<Account | null> {
  const normalizedLoginNumber = loginNumber.trim()

  if (!normalizedLoginNumber) {
    return null
  }

  try {
    const serverAccount = await findServerAccountByLoginNumber(normalizedLoginNumber)

    if (serverAccount) {
      await appDb.accounts.put(serverAccount)

      return serverAccount
    }
  } catch {
    // Fall through to the local cache for offline login on previously synced devices.
  }

  const account = await appDb.accounts.where('loginNumber').equals(normalizedLoginNumber).first()

  if (!account || !account.isActive || account._deletedAt !== undefined) {
    return null
  }

  return account
}

export async function getAccount(accountId: string): Promise<Account | null> {
  try {
    const serverAccount = await getServerAccount(accountId)

    if (serverAccount) {
      await appDb.accounts.put(serverAccount)

      return serverAccount
    }
  } catch {
    // Fall through to the local cache for offline page reloads.
  }

  const account = await appDb.accounts.get(accountId)

  if (!account || !account.isActive || account._deletedAt !== undefined) {
    return null
  }

  return account
}

export async function listAccounts(adminAccountId: string): Promise<Account[]> {
  const accounts = await fetchServerAccounts(adminAccountId)

  await appDb.accounts.bulkPut(accounts)

  return accounts
    .filter((account) => account._deletedAt === undefined)
    .sort((firstAccount, secondAccount) =>
      firstAccount.loginNumber.localeCompare(secondAccount.loginNumber, 'ru'),
    )
}

export async function saveAccount(
  input: SaveAccountInput,
  adminAccountId: string,
): Promise<Account> {
  const account = input.id
    ? await updateServerAccount(
        input.id,
        {
          loginNumber: input.loginNumber,
          fullName: input.fullName,
          role: input.role,
          isActive: input.isActive,
        },
        adminAccountId,
      )
    : await createServerAccount(
        {
          loginNumber: input.loginNumber,
          fullName: input.fullName,
          role: input.role,
        },
        adminAccountId,
      )

  await appDb.accounts.put(account)

  return account
}

export async function softDeleteAccount(accountId: string, adminAccountId: string): Promise<void> {
  await deleteServerAccount(accountId, adminAccountId)

  const account = await appDb.accounts.get(accountId)

  if (!account) {
    return
  }

  await appDb.accounts.put({
    ...account,
    isActive: false,
    _deletedAt: Date.now(),
    ...createSyncMetadata('synced'),
  })
}
