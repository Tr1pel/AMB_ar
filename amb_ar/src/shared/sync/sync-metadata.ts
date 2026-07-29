import type { SyncStatus } from '@/types/report'

export interface SyncMetadataPatch {
  _syncStatus: SyncStatus
  _lastModified: number
  _localVersion: string
}

export function createEntityId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)

  return `${prefix}_${randomId}`
}

export function createLocalVersion(): string {
  const randomId = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)

  return `${Date.now()}-${randomId}`
}

export function createSyncMetadata(syncStatus: SyncStatus = 'pending'): SyncMetadataPatch {
  return {
    _syncStatus: syncStatus,
    _lastModified: Date.now(),
    _localVersion: createLocalVersion(),
  }
}
