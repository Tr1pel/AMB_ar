<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
  contentIsTemplateData?: boolean
}>()
</script>

<template>
  <section class="form-section">
    <div class="form-section__header">
      <h2 class="form-section__title" :data-i18n-ignore="contentIsTemplateData || undefined">
        {{ title }}
      </h2>
      <p
        v-if="subtitle"
        class="form-section__subtitle"
        :data-i18n-ignore="contentIsTemplateData || undefined"
      >
        {{ subtitle }}
      </p>
    </div>

    <slot />
  </section>
</template>

<style scoped>
.form-section {
  display: grid;
  gap: 16px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 14px;
  background: var(--color-surface);
  box-shadow: 0 10px 24px rgba(34, 57, 43, 0.08);
}

.form-section__header {
  display: grid;
  gap: 4px;
}

.form-section__title {
  color: var(--color-text);
  font-size: 1.02rem;
  font-weight: 900;
}

.form-section__subtitle {
  color: var(--color-text-muted);
  font-size: 0.88rem;
}
</style>
