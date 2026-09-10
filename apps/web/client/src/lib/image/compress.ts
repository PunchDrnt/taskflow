/**
 * Shrinking a picture in the browser, before it is uploaded.
 *
 * 🔒 **This is not an optimisation. It is the only size limit that exists.**
 * `StorageService.presignedUpload` signs a bare `PutObjectCommand` — no
 * `ContentLength`, no content-type condition — so one issued URL accepts a
 * 200MB file exactly as readily as a 30KB one, and the file never passes
 * through Node where anything could refuse it. Whatever this function emits is
 * what the bucket gets.
 *
 * A long edge of 512 at WebP 0.85 lands in the 30-60KB range for a photograph,
 * which is what docs/04-features/phase-1.md asks for. Avatars are drawn at
 * 24-40px; the extra resolution is for high-density screens and nothing else.
 */

/** The longest side that survives. Never upscaled — a small picture stays small. */
export const AVATAR_MAX_EDGE = 512

/** WebP quality. Below ~0.8 the artefacts show on faces at avatar sizes. */
export const AVATAR_QUALITY = 0.85

export interface CompressedImage {
  blob: Blob
  /**
   * A name whose extension matches what was actually encoded.
   *
   * It feeds `StorageService.keyFor` and nothing else — nobody validates it —
   * so an object called `.jpg` holding WebP bytes is a file that misleads
   * whoever opens the bucket later, at no benefit.
   */
  fileName: string
  width: number
  height: number
}

export class ImageTooOdd extends Error {}

/**
 * A file from an `<input type="file">`, as an avatar-sized WebP.
 *
 * ⚠️ **`imageOrientation: 'from-image'` is load-bearing.** A canvas discards
 * EXIF wholesale, so a photograph taken in portrait on a phone — where the
 * sensor data is landscape and an EXIF tag says "rotate this" — is drawn
 * sideways and then saved sideways, with the tag that would have corrected it
 * gone. Reading the orientation while decoding is the only chance to apply it.
 *
 * Dropping EXIF also drops the GPS coordinates a phone writes into it, which
 * is wanted here rather than merely tolerated: a profile picture should not
 * carry the address it was taken at.
 */
export async function compressForAvatar(file: File): Promise<CompressedImage> {
  if (!file.type.startsWith('image/')) {
    throw new ImageTooOdd('That file is not an image.')
  }

  let source: ImageBitmap

  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // A corrupt file, or a format this browser cannot decode (HEIC on
    // anything but Safari). Both are "pick another picture", not a crash.
    throw new ImageTooOdd('That image could not be read. Try a JPEG or PNG.')
  }

  try {
    const { width, height } = fit(source.width, source.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')

    if (context === null) {
      throw new ImageTooOdd('This browser could not process the image.')
    }

    context.drawImage(source, 0, 0, width, height)

    const { blob, extension } = await encode(canvas)

    return { blob, fileName: rename(file.name, extension), width, height }
  } finally {
    // Bitmaps hold memory outside the JavaScript heap, which the garbage
    // collector has no reason to hurry over. A few of these while somebody
    // tries pictures adds up on a phone.
    source.close()
  }
}

/** Scaled to fit the box, keeping the aspect ratio, never enlarged. */
function fit(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height)

  if (longest <= AVATAR_MAX_EDGE) return { width, height }

  const scale = AVATAR_MAX_EDGE / longest

  // Rounded, and floored at 1: a very long thin image would otherwise scale
  // its short side to zero, and a canvas of width 0 encodes to nothing.
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * WebP, or JPEG where WebP is not encodable.
 *
 * `toBlob` hands back null rather than throwing when it cannot encode the
 * type asked for, and some browsers quietly produce a PNG instead — so the
 * result's own `type` is what decides the extension, not what was requested.
 */
async function encode(
  canvas: HTMLCanvasElement,
): Promise<{ blob: Blob; extension: string }> {
  const webp = await toBlob(canvas, 'image/webp', AVATAR_QUALITY)

  if (webp !== null && webp.type === 'image/webp') {
    return { blob: webp, extension: 'webp' }
  }

  const jpeg = await toBlob(canvas, 'image/jpeg', AVATAR_QUALITY)

  if (jpeg === null) {
    throw new ImageTooOdd('This browser could not process the image.')
  }

  return { blob: jpeg, extension: jpeg.type === 'image/png' ? 'png' : 'jpg' }
}

function toBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality)
  })
}

/** The original name with its extension replaced, or added if it had none. */
function rename(original: string, extension: string): string {
  const base = original.replace(/\.[^./\\]*$/, '')
  const safe = base.trim() === '' ? 'avatar' : base

  return `${safe}.${extension}`
}
