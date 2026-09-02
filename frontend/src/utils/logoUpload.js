// Turning whatever file a founder picks into the one shape the server takes.
//
// This lives here rather than in SubmitPage because there are now two places
// a logo can be uploaded — the submit form, and the editor a maker who has
// claimed their listing uses (see app/claims.py). The tuning below was
// arrived at from real uploads that failed, and a second copy of it would
// drift within a release: one form silently accepting what the other rejects
// is exactly the bug this whole pipeline exists to prevent.
//
// Nothing about the SERVER's limits was ever wrong (app/tool_logos.py: PNG or
// JPEG, magic-byte sniffed, 512KB). The problem was making the browser meet
// them instead of asking a founder to. The typical logo somebody actually has
// is a 1024px brand PNG with an alpha channel, exported once and never
// optimised, and it lands somewhere north of a megabyte. So the file is
// decoded, drawn onto a square canvas and re-encoded, stepping the size down
// until it fits.

// What the server accepts. Kept in sync with tool_logos.LOGO_MAX_BYTES.
export const LOGO_MAX_BYTES = 512 * 1024

// A ceiling on what we will even attempt to decode. Past this the browser is
// being asked to rasterise something that was never going to be a logo, and
// on a phone that is a frozen tab rather than an error.
export const LOGO_SOURCE_MAX_BYTES = 12 * 1024 * 1024

// 512 is 2x the largest place a logo is drawn, so it stays crisp on a retina
// card without paying for pixels nobody sees. The fallbacks exist for the
// rare photographic logo that will not compress into the cap at full size.
export const LOGO_TARGET_PX = 512
export const LOGO_FALLBACK_PX = [384, 256, 192]

// Below this a logo is visibly soft on a retina card and there is nothing we
// can do about it downstream, so it is worth saying so at upload time.
export const LOGO_MIN_PX = 96

export function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    // HEIC from an iPhone, a corrupt file, or an SVG in a browser that
    // refuses to rasterise it all land here. The message says what to do
    // rather than what failed.
    img.onerror = () =>
      reject(new Error('That file could not be opened as an image. Try a PNG or JPG export.'))
    img.src = dataUrl
  })
}

// Draws the image centred and CONTAINED inside a square of `size`, on a
// transparent canvas, and returns a PNG data URL.
//
// Contained, not cropped: a wordmark is usually much wider than it is tall,
// and cover-cropping one to a square silently cuts the brand name in half.
// Transparent, not white: the cards render on both a cream and a near-black
// background, and a baked-in white box is visible on the dark one.
export function squarePngDataUrl(img, size) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const scale = Math.min(size / img.width, size / img.height)
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  ctx.drawImage(img, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h)
  return canvas.toDataURL('image/png')
}

// Bytes a base64 data: URL actually decodes to — the string itself is ~4/3
// larger, and comparing the string length against the server's byte cap
// rejects files that would in fact have fit.
export function dataUrlBytes(dataUrl) {
  const body = String(dataUrl).split(',')[1] || ''
  const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0
  return Math.floor((body.length * 3) / 4) - padding
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('That file could not be read. Try again.'))
    reader.readAsDataURL(file)
  })
}

/**
 * The whole pipeline, for callers that only want the answer.
 *
 * Resolves to `{ dataUrl, note }` — `note` is set when we changed the file on
 * the founder's behalf, and is NOT an error: "we resized this for you" shown
 * in red is how a working upload reads as a failure. Rejects with an Error
 * whose message is written to be shown as-is.
 */
export async function processLogoFile(file) {
  if (!file) throw new Error('No file selected.')
  if (file.size > LOGO_SOURCE_MAX_BYTES) {
    throw new Error(
      `That file is ${Math.round(file.size / (1024 * 1024))}MB. Export your logo at around ` +
        `${LOGO_TARGET_PX}px and try again.`,
    )
  }

  const sourceUrl = await readAsDataUrl(file)
  const img = await loadImage(sourceUrl)

  if (img.width < LOGO_MIN_PX || img.height < LOGO_MIN_PX) {
    throw new Error(
      `That image is ${img.width}x${img.height}px. Logos below ${LOGO_MIN_PX}px look soft on ` +
        'a listing card — please use a larger export, or the original logo from your site.',
    )
  }

  let dataUrl = null
  let usedPx = LOGO_TARGET_PX
  for (const size of [LOGO_TARGET_PX, ...LOGO_FALLBACK_PX]) {
    const candidate = squarePngDataUrl(img, size)
    if (dataUrlBytes(candidate) <= LOGO_MAX_BYTES) {
      dataUrl = candidate
      usedPx = size
      break
    }
  }

  if (!dataUrl) {
    throw new Error(
      'We could not compress that image small enough. A flat logo on a transparent ' +
        'background works best — photographs rarely fit.',
    )
  }

  const note =
    usedPx === LOGO_TARGET_PX
      ? `Ready — squared to ${usedPx}x${usedPx}px.`
      : `Ready — squared to ${usedPx}x${usedPx}px so it fits the size limit.`

  return { dataUrl, note }
}
