<script setup lang="ts">
export interface PhotoPickerItem {
  id: string
  url: string
  fileName: string
}

defineProps<{
  photos: PhotoPickerItem[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  'select-photo': [file: File]
}>()

function handlePhotoChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (file) {
    emit('select-photo', file)
  }

  input.value = ''
}
</script>

<template>
  <div class="photo-picker">
    <label class="photo-picker__dropzone" :class="{ 'photo-picker__dropzone--disabled': disabled }">
      <input
        class="photo-picker__input"
        type="file"
        accept="image/*"
        capture="environment"
        :disabled="disabled"
        @change="handlePhotoChange"
      />
      <span class="photo-picker__title">Прикрепить фото</span>
      <span class="photo-picker__hint">Камера или галерея телефона</span>
    </label>

    <div v-if="photos.length" class="photo-picker__grid">
      <figure v-for="photo in photos" :key="photo.id" class="photo-picker__preview">
        <img :src="photo.url" :alt="photo.fileName" />
        <figcaption>{{ photo.fileName }}</figcaption>
      </figure>
    </div>
  </div>
</template>

<style scoped>
.photo-picker {
  display: grid;
  gap: 12px;
}

.photo-picker__dropzone {
  display: grid;
  min-height: 126px;
  place-items: center;
  gap: 6px;
  border: 1px dashed rgba(34, 57, 43, 0.34);
  border-radius: 8px;
  padding: 18px;
  background:
    linear-gradient(180deg, rgba(34, 57, 43, 0.04), rgba(34, 57, 43, 0.01)),
    var(--color-surface-muted);
  color: var(--color-primary);
  text-align: center;
}

.photo-picker__dropzone--disabled {
  opacity: 0.65;
}

.photo-picker__input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

.photo-picker__title {
  font-size: 1rem;
  font-weight: 900;
}

.photo-picker__hint {
  color: var(--color-text-muted);
  font-size: 0.88rem;
}

.photo-picker__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(116px, 1fr));
  gap: 10px;
}

.photo-picker__preview {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  box-shadow: 0 8px 16px rgba(34, 57, 43, 0.08);
}

.photo-picker__preview img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
}

.photo-picker__preview figcaption {
  overflow: hidden;
  padding: 8px;
  color: var(--color-text-muted);
  font-size: 0.78rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
