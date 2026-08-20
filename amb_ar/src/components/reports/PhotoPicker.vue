<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

export interface PhotoPickerItem {
  id: string
  url: string
  fileName: string
  caption: string
}

defineProps<{
  photos: PhotoPickerItem[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  'select-photo': [file: File]
  'update-caption': [photoId: string, caption: string]
  'remove-photo': [photoId: string]
}>()

const editingPhotoId = ref<string | null>(null)
const openedPhoto = ref<PhotoPickerItem | null>(null)
const isSourceMenuOpen = ref(false)

function handlePhotoChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (file) {
    emit('select-photo', file)
  }

  input.value = ''
  isSourceMenuOpen.value = false
}

function updateCaption(photoId: string, event: Event): void {
  emit('update-caption', photoId, (event.target as HTMLInputElement).value)
}

function toggleCaptionEditor(photoId: string): void {
  editingPhotoId.value = editingPhotoId.value === photoId ? null : photoId
}

function openPhoto(photo: PhotoPickerItem): void {
  openedPhoto.value = photo
}

function closePhoto(): void {
  openedPhoto.value = null
}

function removePhoto(photoId: string): void {
  if (openedPhoto.value?.id === photoId) {
    closePhoto()
  }

  emit('remove-photo', photoId)
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closePhoto()
  }
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <div class="photo-picker">
    <div class="photo-picker__dropzone" :class="{ 'photo-picker__dropzone--disabled': disabled }">
      <button
        class="photo-picker__add-button"
        type="button"
        :disabled="disabled"
        aria-haspopup="menu"
        :aria-expanded="isSourceMenuOpen"
        @click="isSourceMenuOpen = !isSourceMenuOpen"
      >
        <span class="photo-picker__title">Добавить фото</span>
        <span class="photo-picker__hint">Сделайте снимок или выберите изображение из галереи</span>
      </button>

    </div>

    <div v-if="photos.length" class="photo-picker__grid">
      <figure v-for="photo in photos" :key="photo.id" class="photo-picker__preview">
        <button
          class="photo-picker__open"
          type="button"
          :aria-label="`Открыть фото: ${photo.fileName}`"
          @click="openPhoto(photo)"
        >
          <img :src="photo.url" :alt="photo.fileName" />
        </button>
        <figcaption class="photo-picker__details">
          <div class="photo-picker__summary">
            <div class="photo-picker__actions">
              <button
                class="photo-picker__action"
                type="button"
                :aria-label="editingPhotoId === photo.id ? 'Скрыть подпись' : 'Добавить подпись'"
                :title="editingPhotoId === photo.id ? 'Скрыть подпись' : 'Добавить подпись'"
                :disabled="disabled"
                @click="toggleCaptionEditor(photo.id)"
              >
                <img src="/icons/pen-line-svgrepo-com.svg" alt="" aria-hidden="true" />
              </button>
              <button
                class="photo-picker__action photo-picker__action--delete"
                type="button"
                aria-label="Удалить фото"
                title="Удалить фото"
                :disabled="disabled"
                @click="removePhoto(photo.id)"
              >
                <img src="/icons/trash-svgrepo-com.svg" alt="" aria-hidden="true" />
              </button>
            </div>
          </div>
          <label v-if="editingPhotoId === photo.id" class="photo-picker__caption">
            <span>Подпись</span>
            <input
              :value="photo.caption"
              type="text"
              placeholder="Добавить подпись"
              @input="updateCaption(photo.id, $event)"
            />
          </label>
        </figcaption>
      </figure>
    </div>

    <Teleport to="body">
      <Transition name="photo-picker-source">
        <div
          v-if="isSourceMenuOpen"
          class="photo-picker__source-overlay"
          @click.self="isSourceMenuOpen = false"
        >
          <section
            class="photo-picker__source-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Добавить фото"
          >
            <h2>Добавить фото</h2>
            <p>Выберите источник изображения</p>
            <div class="photo-picker__source-actions">
              <label class="photo-picker__source-action">
                <input
                  class="photo-picker__input"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  :disabled="disabled"
                  @change="handlePhotoChange"
                />
                Снять фото
              </label>
              <label class="photo-picker__source-action">
                <input
                  class="photo-picker__input"
                  type="file"
                  accept="image/*"
                  :disabled="disabled"
                  @change="handlePhotoChange"
                />
                Выбрать из галереи
              </label>
            </div>
            <button class="photo-picker__source-cancel" type="button" @click="isSourceMenuOpen = false">
              Отмена
            </button>
          </section>
        </div>
      </Transition>

      <div
        v-if="openedPhoto"
        class="photo-picker__lightbox"
        role="dialog"
        aria-modal="true"
        aria-label="Просмотр фотографии"
        @click.self="closePhoto"
      >
        <button class="photo-picker__close" type="button" aria-label="Закрыть просмотр" @click="closePhoto">
          ×
        </button>
        <img :src="openedPhoto.url" :alt="openedPhoto.fileName" />
      </div>
    </Teleport>
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

.photo-picker__add-button {
  display: grid;
  width: 100%;
  min-height: 88px;
  place-items: center;
  gap: 6px;
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
}

.photo-picker__add-button:disabled {
  cursor: not-allowed;
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

.photo-picker__source-overlay {
  position: fixed;
  z-index: 1001;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(12, 18, 14, 0.52);
}

.photo-picker-source-enter-active,
.photo-picker-source-leave-active {
  transition: opacity 220ms ease;
}

.photo-picker-source-enter-active .photo-picker__source-dialog,
.photo-picker-source-leave-active .photo-picker__source-dialog {
  transition: opacity 220ms ease, transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.photo-picker-source-enter-from,
.photo-picker-source-leave-to {
  opacity: 0;
}

.photo-picker-source-enter-from .photo-picker__source-dialog,
.photo-picker-source-leave-to .photo-picker__source-dialog {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .photo-picker-source-enter-active,
  .photo-picker-source-leave-active,
  .photo-picker-source-enter-active .photo-picker__source-dialog,
  .photo-picker-source-leave-active .photo-picker__source-dialog {
    transition: none;
  }
}

.photo-picker__source-dialog {
  width: min(100%, 380px);
  border-radius: 12px;
  padding: 22px;
  background: var(--color-surface);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.photo-picker__source-dialog h2,
.photo-picker__source-dialog p {
  margin: 0;
}

.photo-picker__source-dialog h2 {
  color: var(--color-primary);
  font-size: 1.15rem;
}

.photo-picker__source-dialog p {
  margin-top: 6px;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.photo-picker__source-actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  margin-top: 18px;
}

.photo-picker__source-action {
  display: grid;
  min-height: 42px;
  place-items: center;
  border: 1px solid var(--color-primary);
  border-radius: 6px;
  padding: 8px;
  background: var(--color-surface);
  color: var(--color-primary);
  cursor: pointer;
  font-size: 0.88rem;
  font-weight: 800;
}

.photo-picker__source-action:hover {
  background: var(--color-primary-soft);
}

.photo-picker__source-cancel {
  display: block;
  width: 100%;
  min-height: 38px;
  margin-top: 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  font: inherit;
  font-weight: 800;
}

.photo-picker__source-cancel:hover {
  background: var(--color-surface-muted);
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

.photo-picker__open {
  display: block;
  width: 100%;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: zoom-in;
}

.photo-picker__open img {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
}

.photo-picker__details {
  display: grid;
  gap: 6px;
  padding: 8px;
}

.photo-picker__summary,
.photo-picker__actions {
  display: flex;
  align-items: center;
}

.photo-picker__summary {
  justify-content: flex-end;
  gap: 6px;
}

.photo-picker__actions {
  flex: 0 0 auto;
  gap: 2px;
}

.photo-picker__caption {
  display: grid;
  gap: 4px;
  color: var(--color-text);
  font-size: 0.72rem;
  font-weight: 800;
}

.photo-picker__caption input {
  width: 100%;
  min-width: 0;
  min-height: 32px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 6px 7px;
  background: var(--color-surface-muted);
  color: var(--color-text);
  font: inherit;
}

.photo-picker__action {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  padding: 6px;
  background: transparent;
  color: var(--color-primary);
  cursor: pointer;
}

.photo-picker__action:hover:not(:disabled) {
  background: var(--color-primary-soft);
}

.photo-picker__action:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.photo-picker__action img {
  width: 18px;
  height: 18px;
}

.photo-picker__action--delete {
  color: var(--color-danger);
}

.photo-picker__action--delete:hover:not(:disabled) {
  background: var(--color-danger-soft);
}

.photo-picker__lightbox {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(12, 18, 14, 0.88);
  cursor: zoom-out;
}

.photo-picker__lightbox > img {
  width: auto;
  height: auto;
  max-width: min(calc(100vw - 48px), 1400px);
  max-height: calc(100vh - 48px);
  border-radius: 8px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
  cursor: default;
}

.photo-picker__close {
  position: fixed;
  top: 16px;
  right: 18px;
  width: 40px;
  height: 40px;
  border: 1px solid rgba(255, 255, 255, 0.36);
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.25);
  color: #ffffff;
  cursor: pointer;
  font-size: 1.8rem;
  line-height: 1;
}
</style>
