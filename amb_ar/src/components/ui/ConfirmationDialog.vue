<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import {
  activeConfirmation,
  settleConfirmation,
} from '@/shared/ui/confirmation-dialog'

const confirmButton = ref<HTMLButtonElement | null>(null)

watch(activeConfirmation, async (confirmation) => {
  if (confirmation) {
    await nextTick()
    confirmButton.value?.focus()
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="confirmation-dialog">
      <div
        v-if="activeConfirmation"
        class="confirmation-dialog__overlay"
        @click.self="settleConfirmation(false)"
      >
        <section
          class="confirmation-dialog__panel"
          role="dialog"
          aria-modal="true"
          :aria-label="activeConfirmation.title"
          @keydown.esc="settleConfirmation(false)"
        >
          <h2>{{ activeConfirmation.title }}</h2>
          <p>{{ activeConfirmation.message }}</p>
          <div class="confirmation-dialog__actions">
            <button class="confirmation-dialog__cancel" type="button" @click="settleConfirmation(false)">
              Отмена
            </button>
            <button
              ref="confirmButton"
              class="confirmation-dialog__confirm"
              :class="{ 'confirmation-dialog__confirm--danger': activeConfirmation.destructive }"
              type="button"
              @click="settleConfirmation(true)"
            >
              {{ activeConfirmation.confirmLabel ?? 'Подтвердить' }}
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.confirmation-dialog__overlay {
  position: fixed;
  z-index: 1001;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(12, 18, 14, 0.52);
}

.confirmation-dialog__panel {
  width: min(100%, 380px);
  border-radius: 12px;
  padding: 22px;
  background: var(--color-surface);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.confirmation-dialog__panel h2,
.confirmation-dialog__panel p {
  margin: 0;
}

.confirmation-dialog__panel h2 {
  color: var(--color-primary);
  font-size: 1.15rem;
}

.confirmation-dialog__panel p {
  margin-top: 6px;
  color: var(--color-text-muted);
  font-size: 0.9rem;
  line-height: 1.45;
  white-space: pre-line;
}

.confirmation-dialog__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 18px;
}

.confirmation-dialog__actions button {
  min-height: 42px;
  border-radius: 6px;
  padding: 8px;
  font-size: 0.88rem;
  font-weight: 800;
}

.confirmation-dialog__cancel {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-muted);
}

.confirmation-dialog__confirm {
  border: 1px solid var(--color-primary);
  background: var(--color-surface);
  color: var(--color-primary);
}

.confirmation-dialog__confirm--danger {
  border-color: #e3b5b5;
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.confirmation-dialog-enter-active,
.confirmation-dialog-leave-active {
  transition: opacity 220ms ease;
}

.confirmation-dialog-enter-active .confirmation-dialog__panel,
.confirmation-dialog-leave-active .confirmation-dialog__panel {
  transition: opacity 220ms ease, transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.confirmation-dialog-enter-from,
.confirmation-dialog-leave-to {
  opacity: 0;
}

.confirmation-dialog-enter-from .confirmation-dialog__panel,
.confirmation-dialog-leave-to .confirmation-dialog__panel {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .confirmation-dialog-enter-active,
  .confirmation-dialog-leave-active,
  .confirmation-dialog-enter-active .confirmation-dialog__panel,
  .confirmation-dialog-leave-active .confirmation-dialog__panel {
    transition: none;
  }
}
</style>
