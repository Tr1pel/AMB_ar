import type { SyncEntityType, SyncOperation, SyncQueueItem } from '@/types/report'
import { createSyncMetadata } from '@/shared/sync/sync-metadata'

export const MAX_RETRY_ATTEMPTS = 5
export const INITIAL_BACKOFF_MS = 1000
export const MAX_BACKOFF_MS = 30000

const JITTER_RATIO = 0.5

export function calculateBackoff(attempt: number): number {
  const exponentialDelay = Math.min(INITIAL_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS)
  const jitter = exponentialDelay * JITTER_RATIO * (Math.random() * 2 - 1)

  return Math.max(0, Math.floor(exponentialDelay + jitter))
}

export function createSyncQueueItem(
  entityType: SyncEntityType,
  entityId: string,
  operation: SyncOperation,
  payload: Record<string, unknown>,
): SyncQueueItem {
  const now = Date.now()

  return {
    id: `${entityType}:${entityId}:${operation}`,
    entityType,
    entityId,
    operation,
    payload,
    retryCount: 0,
    nextAttemptAt: now,
    createdAt: now,
    ...createSyncMetadata('pending'),
  }
}

export function scheduleRetry(item: SyncQueueItem, errorMessage: string): SyncQueueItem {
  const retryCount = item.retryCount + 1
  const isExhausted = retryCount >= MAX_RETRY_ATTEMPTS

  return {
    ...item,
    retryCount,
    lastError: errorMessage,
    nextAttemptAt: isExhausted
      ? Number.MAX_SAFE_INTEGER
      : Date.now() + calculateBackoff(retryCount),
    ...createSyncMetadata(isExhausted ? 'conflicted' : 'pending'),
  }
}
