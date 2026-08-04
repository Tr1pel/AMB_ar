const MAX_PHOTO_EDGE_PX = 1600
const JPEG_QUALITY = 0.82

export interface CompressedPhoto {
  blob: Blob
  mimeType: string
  size: number
}

export class PhotoCompressionService {
  async compress(file: File): Promise<CompressedPhoto> {
    if (!file.type.startsWith('image/') || typeof createImageBitmap !== 'function') {
      return this.asOriginal(file)
    }

    const bitmap = await createImageBitmap(file)

    try {
      const scale = Math.min(1, MAX_PHOTO_EDGE_PX / Math.max(bitmap.width, bitmap.height))

      if (scale === 1 && file.size < 1_500_000) {
        return this.asOriginal(file)
      }

      const canvas = document.createElement('canvas')

      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))

      const context = canvas.getContext('2d')

      if (!context) {
        return this.asOriginal(file)
      }

      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
      })

      if (!blob || blob.size >= file.size) {
        return this.asOriginal(file)
      }

      return {
        blob,
        mimeType: blob.type || 'image/jpeg',
        size: blob.size,
      }
    } catch {
      return this.asOriginal(file)
    } finally {
      bitmap.close()
    }
  }

  private asOriginal(file: File): CompressedPhoto {
    return {
      blob: file,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
    }
  }
}

export const photoCompressionService = new PhotoCompressionService()
