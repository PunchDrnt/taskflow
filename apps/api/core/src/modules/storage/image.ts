import sharp from 'sharp'

import { ApiException } from '#shared/http/api-exception'

/**
 * Re-encoding a picture before it is stored.
 *
 * 🔒 **This is the check, not an optimisation.** Until this existed the only
 * thing standing between a phone camera and the bucket was the browser's own
 * resize, which is code the caller controls — anything not using our page sent
 * whatever it liked. A size limit bounds how much arrives; only decoding and
 * re-encoding bounds *what* arrives.
 *
 * Three things fall out of doing it, and each was a hole:
 *
 * - **What lands in the bucket is definitely an image.** Bytes that merely
 *   claim `image/webp` do not survive a decode, so a file that is a picture at
 *   the front and something else after it cannot be stored and later served
 *   back under a content type that makes a browser run it.
 * - **EXIF goes, including GPS.** A phone writes the coordinates of wherever
 *   the photograph was taken; a profile picture should not carry the address
 *   of the person in it. `rotate()` before the resize reads the orientation
 *   tag while it is still there, so dropping the rest does not leave portraits
 *   lying on their side.
 * - **The stored size is ours.** One format, one ceiling, whatever was sent.
 *
 * Sharp is a native dependency, which is why `.yarnrc.yml` names every
 * platform this repo builds for — a lockfile written on a Mac would carry only
 * the Mac binary and `yarn install --immutable` would fail inside the image.
 */
export async function toStoredImage(
  input: Buffer,
  { maxEdge, quality }: { maxEdge: number; quality: number },
): Promise<Buffer> {
  try {
    return await sharp(input, {
      // A decompression bomb is a small file describing an enormous bitmap,
      // which is the one way past a byte limit. Sharp refuses them by default
      // and this says so rather than relying on a default staying put.
      limitInputPixels: 50_000_000,
      // One frame. An animated avatar resized frame by frame is a way to spend
      // a lot of CPU on a small upload.
      animated: false,
    })
      .rotate()
      .resize(maxEdge, maxEdge, { fit: 'inside', withoutEnlargement: true })
      // Quality is 0-1 everywhere this project talks about it, because that is
      // what `canvas.toBlob` takes; sharp counts to 100.
      .webp({ quality: Math.round(quality * 100) })
      .toBuffer()
  } catch {
    // Corrupt, truncated, a format this build cannot decode, or not a picture
    // at all. All of them are "send another one", and none of them is a fault
    // worth a 500 or a stack trace in the log.
    throw ApiException.badRequest('That image could not be read')
  }
}
