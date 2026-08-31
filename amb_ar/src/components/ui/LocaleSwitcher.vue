<script setup lang="ts">
import { computed } from 'vue'

import { currentLocale, localeOptions, setLocale, type AppLocale } from '@/shared/i18n'

const languageLabel = computed(() =>
  currentLocale.value === 'fa' ? 'زبان' : currentLocale.value === 'ru' ? 'Язык' : 'Language',
)
const currentLocaleLabel = computed(
  () => localeOptions.find((option) => option.value === currentLocale.value)?.label ?? '',
)

function changeLocale(event: Event): void {
  setLocale((event.target as HTMLSelectElement).value as AppLocale)
}
</script>

<template>
  <label class="locale-switcher">
    <span class="locale-switcher__icon" aria-hidden="true">文</span>
    <span class="locale-switcher__label">{{ languageLabel }}</span>
    <span class="locale-switcher__value" aria-hidden="true">{{ currentLocaleLabel }}</span>
    <span class="locale-switcher__arrow" aria-hidden="true">⌄</span>
    <select :value="currentLocale" :aria-label="languageLabel" @change="changeLocale">
      <option v-for="option in localeOptions" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
  </label>
</template>

<style scoped>
.locale-switcher {
  position: relative;
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 4px 7px 4px 9px;
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: 0 4px 12px rgba(18, 55, 42, 0.06);
  cursor: pointer;
}

.locale-switcher__icon {
  color: var(--color-primary);
  font-size: 0.82rem;
  font-weight: 900;
}

.locale-switcher__label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

.locale-switcher__value {
  min-width: 88px;
  font-size: 0.74rem;
  font-weight: 800;
}

.locale-switcher__arrow {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  line-height: 1;
}

.locale-switcher select {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  outline: none;
  cursor: pointer;
}

.locale-switcher:has(select:focus-visible) {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

:global(html[dir='rtl'] .locale-switcher) {
  padding: 4px 9px 4px 7px;
}

@media (max-width: 520px) {
  .locale-switcher__value {
    min-width: 74px;
    font-size: 0.7rem;
  }
}
</style>
