import { ref } from 'vue'

export interface ConfirmationOptions {
  title: string
  message: string
  confirmLabel?: string
  destructive?: boolean
}

export const activeConfirmation = ref<ConfirmationOptions | null>(null)

let resolveConfirmation: ((confirmed: boolean) => void) | null = null

export function requestConfirmation(options: ConfirmationOptions): Promise<boolean> {
  if (resolveConfirmation) {
    resolveConfirmation(false)
  }

  activeConfirmation.value = options
  return new Promise<boolean>((resolve) => {
    resolveConfirmation = resolve
  })
}

export function settleConfirmation(confirmed: boolean): void {
  resolveConfirmation?.(confirmed)
  resolveConfirmation = null
  activeConfirmation.value = null
}
