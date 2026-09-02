import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { CreditCard, Sparkles, CheckCircle2, ShieldCheck, ArrowRight, User, Wallet, QrCode, ArrowUpRight, Lock, TrendingUp, Users, Search, BarChart3, Image as ImageIcon } from 'lucide-react'

import Button from '../components/ui/Button'
import { PRICING_TIERS, getTier } from '../config/pricingTiers'

const CATEGORIES = [
  'Writing & Chat',
  'Coding',
  'Image Generation',
  'Video Generation',
  'Audio & Voice',
  'Research',
  'Productivity',
  'Marketing',
  'Other',
]

const INITIAL_FORM = {
  name: '',
  url: '',
  category: 'Writing & Chat',
  reason: '',
  submitter_email: '',
  student_perks: '',
  // A base64 data: URL, not a File. The form is stashed in sessionStorage
  // and replayed after the PayPal redirect (see the tx-ref effect below), and
  // a File object does not survive JSON.stringify — a founder who uploaded a
  // logo and then paid would have silently lost it on the way back.
  logo: '',
  logo_name: '',
}

// ---------------------------------------------------------------------------
// Logo upload
// ---------------------------------------------------------------------------
// The old version accepted exactly image/png and image/jpeg under 500KB and
// refused everything else outright. In practice that refused almost every
// logo a founder actually has: a brand PNG exported at 1024px with an alpha
// channel is routinely 700KB-2MB, a WebP or SVG from a design tool is not on
// the list at all, and a phone-camera screenshot is 4MB. The founder saw
// "Logo must be under 500KB", had no way to make it smaller, and gave up —
// which is why the field read as broken rather than as strict.
//
// Nothing about the SERVER's limits was wrong (app/tool_logos.py: PNG/JPEG
// only, 512KB, magic-byte sniffed — an SVG is a scriptable document and we
// serve these from our own origin). The mistake was making the founder meet
// them by hand. So the browser now does the work: any image the browser can
// decode is drawn onto a square canvas at LOGO_TARGET_PX and re-encoded as a
// real PNG, stepping the size down until it fits. What reaches the server is
// always a PNG within the cap, whatever was picked.
//
// Kept in sync with the server deliberately — the server check is still the
// one that counts, this one just means it almost never has to fire.
const LOGO_MAX_BYTES = 512 * 1024

// Refused before we even try to decode. Not a quality limit — a guard against
// spending ten seconds and a phone's memory on a 40MP photo that was never
// going to be a logo.
const LOGO_SOURCE_MAX_BYTES = 12 * 1024 * 1024

// 512 square is the size the catalogue actually renders at its largest (the
// tool page header at 2x), so anything above it is bytes nobody sees. The
// fallbacks exist for the rare photographic logo that will not compress into
// the cap at full size.
const LOGO_TARGET_PX = 512
const LOGO_FALLBACK_PX = [384, 256, 192]

// Below this the logo is visibly soft on a retina card and there is nothing
// we can do about it — better to say so up front than to publish a blurry
// mark on the founder's own page.
const LOGO_MIN_PX = 96

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    // HEIC from an iPhone, a corrupt file, or an SVG in a browser that
    // refuses to rasterise it all land here. The message says what to do
    // rather than what failed.
    img.onerror = () => reject(new Error('That file could not be opened as an image. Try a PNG or JPG export.'))
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
function squarePngDataUrl(img, size) {
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
function dataUrlBytes(dataUrl) {
  const body = String(dataUrl).split(',')[1] || ''
  const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0
  return Math.floor((body.length * 3) / 4) - padding
}

function TierCard({ tier, selected, onSelect }) {
  const isSponsor = tier.id === 'sponsor'
  const isFree = tier.id === 'free'

  return (
    <button
      type="button"
      onClick={() => onSelect(tier.id)}
      aria-pressed={selected}
      className={`flex h-full flex-col rounded-2xl border p-5 text-left transition ${
        selected
          ? 'border-accent bg-accent-soft/20 shadow-md ring-2 ring-accent/15'
          : 'border-line bg-bg-elev hover:border-line-strong hover:bg-bg-sunk'
      }`}
    >
      {/* Badge above price, not beside it.
          Side by side, these two collided: at lg:grid-cols-4 inside a
          max-w-4xl container each card gets ~175px of content width, and the
          badge (~85px) plus "$49 one-time" (~70px) plus the gap did not fit.
          Both wrapped mid-word — "FAST-" / "TRACK" over "$49 one-" / "time" —
          which is what made this row look broken rather than tight.
          whitespace-nowrap on each half now guarantees neither can break
          again if a longer tier name is added later. */}
      <span
        className={`inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
          isFree
            ? 'bg-bg-sunk text-ink-2 border border-line'
            : 'bg-accent-soft text-accent shadow-sm'
        }`}
      >
        {isSponsor && <Sparkles className="h-2.5 w-2.5 shrink-0" />}
        {tier.badgeLabel}
      </span>
      <div className="mt-2.5 flex items-baseline gap-1.5 whitespace-nowrap">
        <span className="text-lg font-bold text-ink">{tier.priceLabel}</span>
        {tier.price > 0 && <span className="text-[10px] font-medium text-ink-2">one-time</span>}
      </div>
      <h3 className="mt-2 text-sm font-bold text-ink">{tier.name}</h3>
      <p className="mt-1 text-xs text-ink-2 leading-relaxed font-normal">{tier.tagline}</p>
    </button>
  )
}

export default function SubmitPage() {
  // 'free' = basic listing, reviewed after the paid ones. 'sponsor' = $49
  // Fast-Track (placement, badge, rail card, reporting). 'reviewed' = $79,
  // Fast-Track plus a written hands-on review of the tool.
  //
  // The retired 'quick' tier is deliberately absent: it sold queue position,
  // sold zero times, and the server refuses it now (pricing_tiers.is_for_sale).
  // The free tier is the top of the funnel: it
  // costs nothing to serve, it's what gets a founder to hand over their
  // email at all, and those contacts are who the paid upgrades are later
  // sold to. A paid-only submit page has no top of funnel — nobody pays a
  // directory they have no relationship with yet.
  const [submissionType, setSubmissionType] = useState('sponsor')
  const [formData, setFormData] = useState(INITIAL_FORM)
  const [submitted, setSubmitted] = useState(false)
  // Which tier the completed submission actually used. Read by the success
  // panel instead of submissionType, so switching the selector afterwards
  // (e.g. a free submitter looking at the upgrade) can't rewrite the
  // confirmation they were just shown.
  const [submittedTier, setSubmittedTier] = useState('sponsor')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [logoError, setLogoError] = useState('')
  // What we did to the file, shown after a successful upload. Separate from
  // logoError because "we resized this for you" is not a failure and must not
  // render in red next to a perfectly good preview.
  const [logoNote, setLogoNote] = useState('')
  const [logoBusy, setLogoBusy] = useState(false)
  const [logoDragging, setLogoDragging] = useState(false)
  // The dropzone is a div, not a <label>, so it opens the picker through the
  // ref rather than by htmlFor association. See the markup for why.
  const logoInputRef = useRef(null)

  // Populated from the /submit-tool response so the success panel can show
  // a working dashboard link and founder-account status immediately —
  // without waiting on (or depending on) the welcome email actually
  // arriving.
  const [dashboardUrl, setDashboardUrl] = useState(null)
  const [founderAccountCreated, setFounderAccountCreated] = useState(false)
  const [founderAccountLinked, setFounderAccountLinked] = useState(false)

  // Payment states
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  // PayPal is the only gateway. The state is kept (rather than inlined) so
  // adding a real second one later is a change to this value and the effects
  // that read it, not a rewrite of the modal. What is gone is the picker that
  // offered Stripe and Razorpay as permanently disabled "Maintenance" tabs —
  // advertising two broken gateways to sell a working one.
  const [paymentMethod, setPaymentMethod] = useState('paypal')
  const [paying, setPaying] = useState(false)
  const [paymentDone, setPaymentDone] = useState(false)
  const [paymentVerified, setPaymentVerified] = useState(false)
  const [transactionRef, setTransactionRef] = useState('')
  const [paypalLoaded, setPaypalLoaded] = useState(false)
  // paypalError was previously set in three failure paths and read by
  // nothing — the modal simply rendered empty space when the SDK failed.
  // It is now the source of truth for the checkout block's error state.
  const [paypalError, setPaypalError] = useState(false)
  // Bumped by the "Try again" button to re-run the SDK load effect.
  const [paypalRetry, setPaypalRetry] = useState(0)

  const [paypalHostedConfig, setPaypalHostedConfig] = useState(null)

  const selectedTier = getTier(submissionType)
  const submittedTierObj = getTier(submittedTier)

  // Restore form state from sessionStorage on page load, and check for redirect callback
  useEffect(() => {
    const savedForm = sessionStorage.getItem('submit_form_data')
    if (savedForm) {
      try {
        setFormData(JSON.parse(savedForm))
      } catch (e) {
        console.error('Failed to parse saved form data', e)
      }
    }

    const savedType = sessionStorage.getItem('submit_submission_type')
    if (savedType) {
      setSubmissionType(savedType)
    }

    const savedMethod = sessionStorage.getItem('submit_payment_method')
    if (savedMethod) {
      setPaymentMethod(savedMethod)
    }

    // Legacy PayPal redirect return. Smart Buttons complete in-page and
    // never navigate away, so this only fires for someone finishing an old
    // hosted-link checkout that was already in flight. It is kept for that
    // window and is safe because the server verifies the reference
    // independently — but it no longer invents one: the old
    // 'PAYPAL-REDIRECT-VERIFIED' default asserted a verification that had
    // not happened, and with no usable reference there is nothing to submit.
    const query = new URLSearchParams(window.location.search)
    const txRef = query.get('tx') || query.get('paymentId') || query.get('token') || query.get('PayerID')
    if (txRef) {
      if (savedForm) {
        try {
          const parsedForm = JSON.parse(savedForm)
          const tier = getTier(savedType || 'sponsor')
          setSubmitting(true)

          fetch('/api/v1/submit-tool', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              ...parsedForm,
              pricing_model: tier.pricingModel,
              transaction_ref: txRef,
            }),
          })
          .then(res => {
            if (!res.ok) throw new Error('API submission failed')
            return res.json()
          })
          .then((payload) => {
            setSubmitted(true)
            setSubmittedTier(tier.id)
            setPaymentVerified(!!payload.payment_verified)
            setTransactionRef(txRef)
            setDashboardUrl(payload.dashboard_url || null)
            setFounderAccountCreated(!!payload.founder_account_created)
            setFounderAccountLinked(!!payload.founder_account_linked)
            sessionStorage.removeItem('submit_form_data')
            sessionStorage.removeItem('submit_submission_type')
            sessionStorage.removeItem('submit_payment_method')
            window.history.replaceState({}, document.title, window.location.pathname)
          })
          .catch(err => {
            console.error('Failed to submit tool after payment:', err)
            setError('Payment completed but we failed to record your submission. Please contact support with Ref: ' + txRef)
          })
          .finally(() => {
            setSubmitting(false)
          })
        } catch (e) {
          console.error(e)
        }
      }
    }
  }, [])

  // /submit?tier=sponsor — the pricing page's buttons.
  //
  // Without this every card on /pricing dropped the buyer onto the same
  // default tier, so someone who deliberately clicked "Get Reviewed" landed
  // on Fast-Track with a different price in the sidebar and had to find the
  // selector themselves. A pricing page whose buttons do not carry the choice
  // is a pricing page that makes the reader choose twice.
  //
  // Runs before the sessionStorage restore below can matter because an
  // explicit link is a fresher intent than a stale stashed selection.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('tier')
    if (wanted && PRICING_TIERS.some((t) => t.id === wanted)) {
      setSubmissionType(wanted)
    }
  }, [])

  // Pre-filled outreach link (/submit?c=<signed token>). The cold email tells
  // the founder their listing is already filled in and takes 30 seconds — this
  // is the half of that promise the page has to keep. It also flips the tier
  // selector to 'free', because the email offered a free listing: landing on a
  // $49 tier pre-selected after being told "it's free" reads as a bait and
  // switch, and it is the fastest way to lose someone who arrived willing.
  //
  // Failure here is deliberately silent. A stale or malformed token just
  // leaves the normal empty form, which still works — showing an error for a
  // link we sent them would be turning our problem into their problem.
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('c')
    if (!token) return

    let cancelled = false
    setSubmissionType('free')
    fetch(`/api/v1/outreach/prefill/${encodeURIComponent(token)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        setFormData((prev) => ({
          ...prev,
          // Only fill blanks. If the visitor has already typed something —
          // or sessionStorage restored a form they were part-way through —
          // their text wins over ours.
          name: prev.name || data.name || '',
          url: prev.url || data.url || '',
          reason: prev.reason || data.reason || '',
        }))
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [])

  // Persist form state to sessionStorage on inputs, so it survives the
  // PayPal redirect. Guarded because the logo rides along as base64 and a
  // near-full quota throws here — an uncaught error inside this effect would
  // take down the whole form over a convenience feature. Losing the stash is
  // recoverable; losing the page is not.
  useEffect(() => {
    try {
      sessionStorage.setItem('submit_form_data', JSON.stringify(formData))
    } catch {
      // Quota exceeded (or storage disabled). Drop the logo first — it is by
      // far the largest field, and the text the founder typed is the part
      // worth keeping across the redirect.
      try {
        sessionStorage.setItem(
          'submit_form_data',
          JSON.stringify({ ...formData, logo: '', logo_name: '' }),
        )
      } catch {
        /* no stash this time; the form still works, it just won't restore */
      }
    }
  }, [formData])

  useEffect(() => {
    sessionStorage.setItem('submit_submission_type', submissionType)
  }, [submissionType])

  useEffect(() => {
    sessionStorage.setItem('submit_payment_method', paymentMethod)
  }, [paymentMethod])

  useEffect(() => {
    if (showPaymentModal && paymentMethod === 'paypal') {
      // 'sponsor' is the API's name for the Fast-Track tier; every other
      // paid tier passes its own id. Falling everything back to 'sponsor'
      // would quote a $19 buyer a $49 checkout.
      const tierParam = submissionType === 'free' ? 'sponsor' : submissionType
      // Clear both flags up front. Without this a retry (or reopening the
      // modal after a failure) starts out still showing the previous
      // attempt's error.
      setPaypalError(false)
      setPaypalLoaded(!!window.paypal)

      fetch(`/api/v1/config/paypal-hosted?tier=${tierParam}`)
        .then(res => {
          // A 5xx from the origin returns an HTML error page, and res.json()
          // on that throws a parse error that used to escape as an
          // unhandled rejection rather than a visible failure.
          if (!res.ok) throw new Error(`paypal-hosted config returned ${res.status}`)
          return res.json()
        })
        .then(data => {
          setPaypalHostedConfig(data)
          const clientId = data.client_id || 'sb'

          if (window.paypal) {
            setPaypalLoaded(true)
            return
          }

          setPaypalLoaded(false)
          setPaypalError(false)

          const loadPaypalScript = (cid) => {
            const existingScript = document.getElementById('paypal-sdk-script')
            if (existingScript) {
              existingScript.remove()
            }

            // A blocker (uBlock, corporate proxy, DNS sinkhole) frequently makes
            // the request HANG rather than fail, so neither onload nor onerror
            // ever fires. Without this the modal spins forever and the buyer
            // just leaves. Treat silence as failure.
            let settled = false
            const timeoutId = setTimeout(() => {
              if (settled) return
              settled = true
              console.error('PayPal SDK load timed out after 15s.')
              setPaypalError(true)
            }, 15000)

            const script = document.createElement('script')
            script.id = 'paypal-sdk-script'

            // PayPal's SDK injects its own inline <script> elements at runtime.
            // Our CSP carries a per-request nonce, and per spec a nonce makes
            // 'unsafe-inline' be IGNORED — so those injected scripts were being
            // blocked (script-src-elem, blockedURI "inline", sourceFile
            // https://www.paypal.com/sdk/js).
            //
            // PayPal's documented fix is data-csp-nonce: pass our nonce to the
            // SDK and it stamps that nonce onto everything it injects, so the
            // existing nonce policy covers them without loosening it.
            // https://developer.paypal.com/sdk/js/best-practices/
            //
            // The nonce is read off one of our own server-nonced script tags via
            // the .nonce IDL property — the content attribute is hidden from
            // getAttribute() by browsers, so the property is the only way.
            const cspNonce = document.querySelector('script[nonce]')?.nonce || ''
            if (cspNonce) {
              script.nonce = cspNonce
              script.setAttribute('data-csp-nonce', cspNonce)
            }

            script.src = `https://www.paypal.com/sdk/js?client-id=${cid}&currency=USD&intent=capture`
            script.async = true
            script.crossOrigin = 'anonymous'

            script.onload = () => {
              if (settled) return
              settled = true
              clearTimeout(timeoutId)
              if (window.paypal) {
                setPaypalLoaded(true)
              } else {
                handleLoadError()
              }
            }

            script.onerror = () => {
              if (settled) return
              settled = true
              clearTimeout(timeoutId)
              handleLoadError()
            }

            // No client-id=sb fallback. That fallback loaded PayPal's shared
            // SANDBOX demo client, so a buyer could complete a checkout that
            // looked real, receive a sandbox order ID, and have it rejected by
            // live verification — taking their money nowhere and landing the
            // submission as unverified_review. A checkout that cannot be
            // verified must fail loudly instead.
            const handleLoadError = () => {
              console.error('Failed to load PayPal SDK.')
              setPaypalError(true)
            }

            document.body.appendChild(script)
          }

          loadPaypalScript(clientId)
        })
        .catch(err => {
          console.error('Failed to fetch PayPal config:', err)
          setPaypalError(true)
        })
    }
  }, [showPaymentModal, paymentMethod, submissionType, paypalRetry])

  useEffect(() => {
    if (paypalLoaded && window.paypal && paymentMethod === 'paypal') {
      const container = document.getElementById('paypal-button-container')
      if (container) {
        container.innerHTML = ''

        try {
          window.paypal.Buttons({
            // The order is created by OUR server, at OUR price.
            //
            // This used to call actions.order.create() with `tier.price` from
            // this bundle, which meant the amount charged was whatever the
            // page said it was — editable in devtools. Verification caught a
            // short payment afterwards, but only after PayPal had taken the
            // money, leaving the buyer out of pocket and us owing a refund on
            // a sale we never wanted.
            //
            // The browser path is kept as a FALLBACK rather than deleted. If
            // our endpoint is down, a founder who wants to pay us must still
            // be able to: the capture-time server verification that has always
            // been the real guard runs either way, so the fallback is no
            // weaker than the whole flow was yesterday.
            createOrder: async (data, actions) => {
              const tier = getTier(submissionType)
              try {
                const res = await fetch('/api/v1/checkout/paypal/order', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ tier: submissionType, tool_name: formData.name }),
                })
                if (res.ok) {
                  const order = await res.json()
                  if (order?.id) return order.id
                }
                console.warn('Server-side order creation unavailable; falling back to browser-side.')
              } catch (err) {
                console.warn('Server-side order creation failed; falling back to browser-side.', err)
              }

              return actions.order.create({
                purchase_units: [{
                  // description shows on the buyer's PayPal receipt, so a
                  // charge is recognisable months later in a dispute.
                  description: `AI Compass — ${tier.name}`,
                  amount: {
                    // currency_code is explicit rather than inherited from
                    // the SDK's ?currency= param: verify_paypal_order()
                    // rejects anything that isn't USD, so an inherited
                    // locale currency would fail verification server-side
                    // after the buyer had already been charged.
                    currency_code: 'USD',
                    value: tier.price.toFixed(2)
                  }
                }]
              })
            },
            onApprove: async (data, actions) => {
              setPaying(true)
              try {
                const details = await actions.order.capture()
                // Never fabricate a reference. This used to fall back to
                // `TXN-PAYPAL-${Math.random()}` when the capture returned no
                // id, which produced an official-looking string that could
                // never verify — the same failure mode as the historical
                // PAYPAL-NCP-* references. If PayPal gave us no order ID
                // there is nothing to verify, and the buyer must be told.
                const txRef = details?.id
                if (!txRef) {
                  setPaying(false)
                  setError(
                    'PayPal did not return an order reference, so we cannot confirm the payment. ' +
                    'Please email help@ai-compass.in before paying again — do not retry, you may be charged twice.'
                  )
                  return
                }
                setPaying(false)
                setPaymentDone(true)
                setTransactionRef(txRef)

                setTimeout(() => {
                  setShowPaymentModal(false)
                  submitData(submissionType, txRef)
                }, 1500)
              } catch (err) {
                setPaying(false)
                setError('PayPal transaction capture failed. Please try again.')
              }
            },
            onError: (err) => {
              console.error('PayPal Buttons error:', err)
              setError('An error occurred during the PayPal transaction.')
            }
          }).render('#paypal-button-container').catch((err) => {
            console.error('Failed to render standard PayPal buttons:', err)
            setPaypalError(true)
          })
        } catch (err) {
          console.error('Failed to render standard PayPal buttons:', err)
          setPaypalError(true)
        }
      }
    }
  }, [paypalLoaded, paymentMethod, paypalHostedConfig, submissionType, paypalRetry, formData.name])

  function handleChange(event) {
    const { name, value } = event.target
    setFormData((current) => ({
      ...current,
      [name]: value,
    }))
  }

  // Accepts whatever the founder has and turns it into what the server
  // accepts, instead of asking them to do it. See the notes on LOGO_MAX_BYTES
  // above for why this stopped being a plain type/size check.
  function openLogoPicker() {
    if (logoBusy) return
    logoInputRef.current?.click()
  }

  function handleLogoChange(event) {
    const file = event.target.files && event.target.files[0]
    // Clear the input's value so picking the same file again after an error
    // still fires a change event.
    event.target.value = ''
    if (file) processLogoFile(file)
  }

  // Shared by the file picker and by a dropped file. Split out of
  // handleLogoChange so the dropzone is not a second, subtly different
  // implementation of the same validation.
  async function processLogoFile(file) {
    setLogoError('')
    setLogoNote('')

    if (!String(file.type || '').startsWith('image/')) {
      setLogoError('That is not an image file. Pick a PNG, JPG or WebP.')
      return
    }
    if (file.size > LOGO_SOURCE_MAX_BYTES) {
      setLogoError(
        `That file is ${(file.size / (1024 * 1024)).toFixed(1)}MB, which is larger than we can ` +
        'process in the browser. Export it at around 512x512 and try again.',
      )
      return
    }

    setLogoBusy(true)
    try {
      const sourceUrl = await readFileAsDataUrl(file)
      const img = await loadImage(sourceUrl)

      if (img.width < LOGO_MIN_PX || img.height < LOGO_MIN_PX) {
        setLogoError(
          `That image is ${img.width}x${img.height}px. Logos below ${LOGO_MIN_PX}px look soft on ` +
          'your listing page — use a larger export, or leave this blank and we will pull the ' +
          'logo from your site.',
        )
        return
      }

      // Try full size first, then step down. The loop always terminates with
      // an answer: the smallest fallback of a square PNG is a few KB.
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
        setLogoError(
          'We could not compress that image small enough. A flat logo on a transparent ' +
          'background (rather than a screenshot or photo) will work.',
        )
        return
      }

      setFormData((current) => ({ ...current, logo: dataUrl, logo_name: file.name }))
      // Say what we did. A founder who uploads a 1400x400 wordmark and gets
      // back a square should be told it was fitted rather than cropped —
      // otherwise the preview looks like a bug.
      const resized = img.width !== img.height || img.width > usedPx
      setLogoNote(
        resized
          ? `Fitted to ${usedPx}x${usedPx} PNG from your ${img.width}x${img.height} file. ` +
            'Nothing was cropped.'
          : `Ready: ${usedPx}x${usedPx} PNG.`,
      )
    } catch (err) {
      setLogoError(err?.message || 'Could not read that file — try a different one.')
    } finally {
      setLogoBusy(false)
    }
  }

  function clearLogo() {
    setLogoError('')
    setLogoNote('')
    setFormData((current) => ({ ...current, logo: '', logo_name: '' }))
  }

  function handleFormSubmit(event) {
    event.preventDefault()
    setError('')
    if (submissionType === 'free') {
      submitData('free')
      return
    }
    setShowPaymentModal(true)
  }

  // Real payment and submission happen in the PayPal SDK callbacks
  // (createOrder / onApprove), not here. This handler exists only to swallow
  // an accidental Enter-key submit of the form that wraps the button.
  function handlePayment(event) {
    event.preventDefault()
  }

  async function submitData(tierId, transactionRef = '') {
    const tier = getTier(tierId)
    setSubmitting(true)
    setSubmitted(false)
    setPaymentVerified(false)
    setDashboardUrl(null)
    setFounderAccountCreated(false)
    setFounderAccountLinked(false)

    try {
      const response = await fetch('/api/v1/submit-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: formData.name,
          url: formData.url,
          category: formData.category,
          reason: formData.reason,
          pricing_model: tier.pricingModel,
          student_perks: formData.student_perks,
          submitter_email: formData.submitter_email,
          logo: formData.logo,
          transaction_ref: transactionRef,
        }),
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to submit right now. Please try again.')
      }

      setSubmitted(true)
      setSubmittedTier(tier.id)
      setPaymentVerified(!!payload.payment_verified)
      setDashboardUrl(payload.dashboard_url || null)
      setFounderAccountCreated(!!payload.founder_account_created)
      setFounderAccountLinked(!!payload.founder_account_linked)
      setFormData(INITIAL_FORM)
      setPaymentDone(false)
    } catch (requestError) {
      setError(requestError.message || 'Unable to submit right now. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8">

      {/* Monetization / Path Selector Banner */}
      <div className="mb-8 rounded-3xl border border-line bg-gradient-to-br from-bg-elev via-bg-elev to-bg-sunk/30 p-6 shadow-sm">
        {/* `block mb-1` on a flex child was doing nothing useful and pushed
            the eyebrow off the link's baseline; the heading then sat tight
            against it with no gap of its own. Baseline-aligned row, and the
            spacing below it stated once. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-accent">Get Listed</span>
          <Link to="/pricing" className="text-xs font-semibold text-accent hover:underline">
            Compare all tiers →
          </Link>
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Submit Your AI Tool</h1>
        <p className="mt-2 text-sm text-ink-2 max-w-2xl font-normal leading-relaxed">
          Get your tool in front of students, creators, and developers. Free listings are welcome and permanent. Listing + Analytics ($19) adds a dashboard and a monthly report on what your listing is actually doing; Fast-Track ($49) is reviewed first and placed above free listings, labelled as sponsored; Reviewed ($79) adds a written hands-on review of your tool on its own page.
        </p>

        {/* Tier selector — free is a real, selectable path, not a decoy. */}
        <div className="mt-6 grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PRICING_TIERS.map((tier) => (
            <TierCard
              key={tier.id}
              tier={tier}
              selected={submissionType === tier.id}
              onSelect={setSubmissionType}
            />
          ))}
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-8 ${submissionType !== 'free' ? 'lg:grid-cols-3' : ''}`}>

        {/* Left/Main Column: Submission Form */}
        <div className={submissionType !== 'free' ? 'lg:col-span-2' : ''}>
          <section className="rounded-2xl border border-line bg-bg-elev p-6 shadow-sm">
            <h2 className="text-lg font-bold text-ink">
              {submissionType === 'free' ? 'Tool Details' : `${selectedTier.name} Form`}
            </h2>
            <p className="mt-2 text-sm text-ink-2">
              Just drop a few details below and we'll take care of the rest. <br className="hidden sm:block" />
              <strong className="text-ink">Example:</strong> If you built a flashcard app, just drop the link and tell us what makes it unique for students.
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleFormSubmit}>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="submitter_email" className="mb-1 block text-xs font-semibold text-ink-2">
                    Founder Contact Email <span className="text-accent">*</span>
                  </label>
                  <input
                    id="submitter_email"
                    name="submitter_email"
                    type="email"
                    required
                    value={formData.submitter_email}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
                    placeholder="founder@company.com"
                  />
                </div>
                <div>
                  <label htmlFor="student_perks" className="mb-1 block text-xs font-semibold text-ink-2">
                    Student Perk/Discount details (Optional)
                  </label>
                  <input
                    id="student_perks"
                    name="student_perks"
                    type="text"
                    value={formData.student_perks}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
                    placeholder="e.g. 50% discount via .edu email"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="name" className="mb-1 block text-xs font-semibold text-ink-2">
                    Tool name <span className="text-accent">*</span>
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    required
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink placeholder:text-muted-2 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
                    placeholder="e.g. Notion AI"
                  />
                </div>

                <div>
                  <label htmlFor="url" className="mb-1 block text-xs font-semibold text-ink-2">
                    Tool URL <span className="text-accent">*</span>
                  </label>
                  <input
                    id="url"
                    name="url"
                    type="text"
                    required
                    value={formData.url}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink placeholder:text-muted-2 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
                    placeholder="https://example.com"
                  />
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="block text-xs font-semibold text-ink-2">
                    Logo (Optional)
                  </span>
                  <span className="text-[10px] font-medium text-muted-2">
                    Square PNG, 512&times;512, transparent background
                  </span>
                </div>

                {/* The requirements, up front, in the founder's terms.
                    They used to appear only as a red error AFTER a rejected
                    upload ("Logo must be under 500KB"), with no guidance on
                    what would work — so the field read as broken. Stating the
                    target here and doing the resizing for them (see
                    processLogoFile) is what actually fixes it.

                    The whole box is the click target, not just the words
                    "Upload a logo". A dashed box that LOOKS like a dropzone
                    but only responds to a five-character text link is a
                    dropzone that reads as broken the first time you click the
                    obvious place and nothing happens. It also accepts a
                    dropped file, because a box drawn like this is one people
                    drag onto.

                    role/tabIndex/onKeyDown rather than a <label> wrapping
                    everything: a label containing the tips list would have a
                    screen reader announce all six of them as the field's
                    name, and the Remove button cannot live inside a label at
                    all — clicking it would reopen the picker. */}
                <div
                  role="button"
                  tabIndex={logoBusy ? -1 : 0}
                  aria-label={formData.logo ? 'Choose a different logo file' : 'Upload a logo'}
                  aria-disabled={logoBusy || undefined}
                  onClick={openLogoPicker}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      openLogoPicker()
                    }
                  }}
                  onDragOver={(event) => {
                    event.preventDefault()
                    if (!logoBusy) setLogoDragging(true)
                  }}
                  onDragLeave={(event) => {
                    // Only when the pointer actually leaves the box. Without
                    // the containment check, dragging across a child element
                    // fires dragleave and the highlight flickers off.
                    if (!event.currentTarget.contains(event.relatedTarget)) setLogoDragging(false)
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    setLogoDragging(false)
                    const file = event.dataTransfer?.files?.[0]
                    if (file) processLogoFile(file)
                  }}
                  className={`rounded-lg border border-dashed p-3 transition outline-none ${
                    logoBusy
                      ? 'cursor-wait border-line bg-bg'
                      : 'cursor-pointer hover:border-accent/60 hover:bg-accent-soft/10 focus-visible:ring-2 focus-visible:ring-accent'
                  } ${logoDragging ? 'border-accent bg-accent-soft/20' : 'border-line bg-bg'}`}
                >
                  <div className="flex items-center gap-3">
                    {formData.logo ? (
                      <img
                        src={formData.logo}
                        alt="Logo preview"
                        className="h-14 w-14 shrink-0 rounded-xl border border-line bg-white object-contain p-1.5"
                      />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-line bg-bg-sunk text-muted-2">
                        <ImageIcon className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <span
                        className={`text-xs font-bold ${logoBusy ? 'text-muted-2' : 'text-accent'}`}
                      >
                        {logoBusy
                          ? 'Processing…'
                          : formData.logo
                          ? 'Choose a different file'
                          : 'Upload a logo'}
                      </span>
                      <span className="ml-1 hidden text-[11px] text-muted-2 sm:inline">
                        or drop it here
                      </span>
                      <input
                        id="logo"
                        name="logo"
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        disabled={logoBusy}
                        onChange={handleLogoChange}
                        className="sr-only"
                      />
                      <p className="mt-0.5 truncate text-[11px] text-muted-2">
                        {formData.logo_name || 'PNG, JPG, WebP or GIF — any size. We resize it for you.'}
                      </p>
                    </div>
                    {formData.logo && (
                      <button
                        type="button"
                        // Stops the click reaching the dropzone behind it —
                        // otherwise removing the logo immediately reopens the
                        // file picker, which reads as the Remove button being
                        // broken.
                        onClick={(event) => {
                          event.stopPropagation()
                          clearLogo()
                        }}
                        className="shrink-0 rounded-lg border border-line px-2 py-1 text-[11px] font-semibold text-muted-2 transition hover:bg-bg-sunk hover:text-ink"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <ul className="mt-3 grid gap-1 border-t border-line/70 pt-2.5 text-[11px] leading-relaxed text-muted-2 sm:grid-cols-2">
                    <li>&middot; Best: 512&times;512 px, square, PNG</li>
                    <li>&middot; Transparent background looks best in dark mode</li>
                    <li>&middot; Minimum {LOGO_MIN_PX} px — smaller looks soft</li>
                    <li>&middot; A wide wordmark is fitted, never cropped</li>
                    <li>&middot; No screenshots or photos — just the mark</li>
                    <li>&middot; Leave blank and we pull it from your site</li>
                  </ul>
                </div>

                {logoError && (
                  <p className="mt-1.5 text-[11px] font-semibold text-red-600 dark:text-red-400">{logoError}</p>
                )}
                {!logoError && logoNote && (
                  <p className="mt-1.5 text-[11px] font-semibold text-accent-ink">{logoNote}</p>
                )}
              </div>

              <div>
                <label htmlFor="category" className="mb-1 block text-xs font-semibold text-ink-2">
                  Category
                </label>
                <select
                  id="category"
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
                >
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="reason" className="mb-1 block text-xs font-semibold text-ink-2">
                  Product description & Curation context <span className="text-accent">*</span>
                </label>
                <textarea
                  id="reason"
                  name="reason"
                  rows={4}
                  required
                  value={formData.reason}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink placeholder:text-muted-2 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
                  placeholder="Describe your tool's main features and why it belongs in our curated library..."
                />
              </div>

              <div className="pt-2">
                <Button
                  variant="primary"
                  type="submit"
                  disabled={submitting}
                  className="w-full font-bold flex items-center justify-center gap-2 rounded-xl"
                >
                  {submitting
                    ? 'Processing...'
                    : submissionType === 'free'
                    ? 'Submit Free Listing'
                    : `Proceed to Secure Checkout (${selectedTier.priceLabel})`}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </form>

            {submitted && (
              <div className="mt-6 rounded-2xl border border-accent bg-accent-soft/30 p-6 shadow-md text-ink animate-fade-in">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-7 w-7 text-accent shrink-0" />
                  <div>
                    <h3 className="text-base font-semibold text-ink">
                      {submittedTier === 'free'
                        ? 'Submission Received'
                        : paymentVerified
                        ? 'Payment Approved & Submission Received'
                        : 'Submission Received — Payment Pending Verification'}
                    </h3>
                    {submittedTier !== 'free' && (
                      <p className="text-xs text-accent-ink font-semibold mt-0.5">
                        Transaction Reference: <span className="font-mono">{transactionRef || 'N/A'}</span> • Amount: {submittedTierObj.priceLabel} USD
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-accent/20 text-xs text-ink-2 space-y-2 leading-relaxed">
                  {submittedTier === 'free' ? (
                    <>
                      <p>
                        <strong>What happens next?</strong> Your tool is in the review queue. We
                        review free submissions in the order they arrive, after paid ones, and
                        they go live 7 days after approval. <strong>We&apos;ll email you the link
                        to your live page the moment it is up</strong> — you don&apos;t need to
                        check back.
                      </p>
                      <div className="bg-bg-elev/80 p-3 rounded-xl border border-line">
                        <p className="font-medium text-ink">
                          Need it live sooner? Fast-Track is reviewed first (target 24 hours), goes live the next day, and sits above free listings with a labelled “Sponsored” badge — $49 one-time. Reviewed ($79) adds a 300–500 word hands-on review of your tool, published on your own indexed page.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setSubmitted(false)
                            setSubmissionType('sponsor')
                            window.scrollTo({ top: 0, behavior: 'smooth' })
                          }}
                          className="mt-2 inline-flex items-center gap-1.5 text-accent font-bold hover:underline"
                        >
                          Compare paid tiers <ArrowRight className="h-3 w-3" />
                        </button>
                      </div>
                    </>
                  ) : paymentVerified ? (
                    <>
                      <p>
                        <strong>What happens next?</strong> Our editorial team has received your submission details and payment confirmation.
                      </p>
                      <p className="bg-bg-elev/80 p-3 rounded-xl border border-line font-medium text-ink">
                        <strong>{submittedTierObj.reviewEta}</strong> Our team will review your submission and contact you soon via email at your provided founder address.
                      </p>
                      {(founderAccountCreated || founderAccountLinked) && (
                        <p className="bg-accent-soft/30 p-3 rounded-xl border border-accent/15 font-medium text-ink">
                          {founderAccountCreated
                            ? "We've created a Growth Hub account for you — check your confirmation email for login details."
                            : 'This tool is now linked to your existing AI Compass account — log in as usual to find it in your Growth Hub.'}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <p>
                        <strong>What happens next?</strong> We received your submission, but couldn't automatically confirm the payment yet.
                      </p>
                      <p className="bg-bg-elev/80 p-3 rounded-xl border border-line font-medium text-ink">
                        <strong>Our team will manually verify your payment and follow up via email within 24 hours.</strong> If you completed payment and don't hear back, reply to your confirmation email with your transaction reference.
                      </p>
                    </>
                  )}

                  {dashboardUrl && (
                    <div className="pt-1">
                      <a
                        href={dashboardUrl}
                        className="inline-flex items-center justify-center gap-2 w-full bg-accent hover:bg-accent/90 text-white font-bold py-3 px-5 rounded-xl text-xs transition-all shadow-sm"
                      >
                        View your submission dashboard <ArrowRight className="h-3.5 w-3.5" />
                      </a>
                      <p className="mt-2 text-[11px] text-muted-2 text-center">
                        A confirmation email with this link (and login details, if applicable) is on its way to your inbox for future reference.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-xl border border-danger bg-danger-soft px-4 py-3 text-xs text-danger">
                {error}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Pricing details sidebar — hidden for the free tier */}
        {submissionType !== 'free' && (
          <div className="lg:col-span-1">
            <section className="rounded-2xl border border-line bg-bg-elev p-5 shadow-sm space-y-4">
              <h3 className="text-xs font-bold text-ink uppercase tracking-wider">{selectedTier.name} Includes</h3>

              <div className="space-y-4 text-xs">
                <div className="rounded-xl bg-accent-soft/30 p-3 border border-accent/15 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-accent" />
                  <span className="font-semibold text-accent-ink">{selectedTier.reviewEta}</span>
                </div>

{/* One line, one number. There was a struck-through "$75.00 priority
                    submission fee - $25.01 launch discount" here, and no $75 tier
                    has ever existed in the code — it was a discount off a price
                    nobody was ever charged. */}
                <div className="flex justify-between items-baseline pt-1 pb-1 border-b border-line">
                  <span className="font-bold text-ink">Total Due</span>
                  <span className="text-xl font-bold text-ink">{selectedTier.priceLabel} <span className="text-xs font-medium text-muted">one-time</span></span>
                </div>

                <ul className="space-y-2 text-ink-2 leading-relaxed pt-2 font-normal">
                  {selectedTier.perks.map((perk) => (
                    <li key={perk} className="flex items-start gap-2">
                      <span className="text-accent font-bold">✓</span>
                      <span>{perk}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* -------------------------------------------------------------------
          Why sponsor
          -------------------------------------------------------------------
          The old version was four stat tiles over three paragraphs of prose,
          all at the same visual weight, and it stopped at "we have traffic".
          Traffic is a claim every directory makes; none of it tells a founder
          holding $49 whether this is a better use of it than an afternoon of
          ads.

          So this section now answers that question in order:
            1. the audience, with the real figures and their source named,
            2. what those figures cost anywhere else,
            3. what specifically is delivered for the money,
            4. the limits, because a page with no limits reads as a pitch.

          Every number below is one we can produce a dashboard screenshot for,
          which is the whole reason the source is printed under each: an
          unattributed "10,000+ users" is the most common lie in this
          category, and being the listing that says where its numbers came
          from is cheaper than being the one that gets caught. */}
      <section className="mt-12 overflow-hidden rounded-3xl border border-line bg-bg-elev shadow-sm">
        <div className="border-b border-line bg-gradient-to-b from-bg-sunk/40 to-transparent px-6 py-8 sm:px-10 sm:py-10">
          <div className="mx-auto max-w-2xl text-center">
            <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-accent">
              <Sparkles className="h-3 w-3" /> Why founders list here
            </span>
            <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              A small audience that is entirely the right one
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm font-normal leading-relaxed text-ink-2">
              AI Compass is not the biggest directory on the internet. It is a hand-curated one,
              read by students, developers and creators who arrive already searching for a tool to
              do a specific job. Here is exactly how big &mdash; measured in Google Search Console
              and PostHog, not asserted.
            </p>
          </div>

          {/* Headline numbers, each carrying its source. The source is what
              separates these from the round figures every competitor prints. */}
          <div className="mx-auto mt-8 grid max-w-3xl grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { icon: BarChart3, value: '176K', label: 'Google search impressions', source: 'Search Console' },
              { icon: Search, value: '4.78K', label: 'Clicks from Google search', source: 'Search Console' },
              { icon: Users, value: '8.7K', label: 'Visitors, last 4 months', source: 'PostHog' },
              { icon: TrendingUp, value: 'Top 12', label: 'Ranking keywords on page 1', source: 'Search Console' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-line bg-bg/80 p-4 text-center transition hover:border-accent/40 hover:shadow-sm"
              >
                <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <stat.icon className="h-4 w-4" />
                </div>
                <div className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{stat.value}</div>
                <div className="mt-1 text-[11px] font-semibold leading-snug text-ink-2">{stat.label}</div>
                <div className="mt-1 text-[10px] font-medium text-muted-2">{stat.source}</div>
              </div>
            ))}
          </div>

          {/* The engagement row, deliberately smaller than the tiles above:
              these say the traffic is real rather than bounced-through, which
              matters, but it is a supporting argument, not the headline. */}
          <div className="mx-auto mt-3 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['11.7K', 'Page views'],
              ['9.3K', 'Sessions'],
              ['2m 07s', 'Average session'],
              ['43%', 'Bounce rate'],
            ].map(([value, label]) => (
              <div key={label} className="rounded-xl border border-line/70 bg-bg/50 px-3 py-2.5 text-center">
                <div className="text-sm font-bold text-ink">{value}</div>
                <div className="text-[10px] font-medium text-muted-2">{label}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-[10px] text-muted-2">
            4,000+ students have used AI Compass to build a toolkit. Figures current as of
            September 2026 &mdash; we will show you the dashboards on request.
          </p>
        </div>

        {/* What the money buys, against what it costs elsewhere. This is the
            comparison a founder is making in their head anyway; making it for
            them, honestly and including the case where we lose, is more
            persuasive than pretending it is not being made. */}
        <div className="border-b border-line px-6 py-8 sm:px-10">
          <h3 className="text-center text-base font-bold text-ink">What $49 buys, next to the alternatives</h3>
          <div className="mx-auto mt-5 grid max-w-3xl gap-3 sm:grid-cols-3">
            {[
              {
                title: 'Google Ads',
                cost: '$2-4 per click',
                body: 'Stops the moment you stop paying. $49 is roughly a dozen clicks, and then nothing.',
                us: false,
              },
              {
                title: 'A launch platform',
                cost: 'Free, one day',
                body: 'One spike, then your page falls off the front page and the traffic ends with it.',
                us: false,
              },
              {
                title: 'Fast-Track here',
                cost: '$49 once',
                body: 'A permanent indexed page, placed above free listings for as long as it stands. It does not expire.',
                us: true,
              },
            ].map(({ title, cost, body, us }) => (
              <div
                key={title}
                className={`rounded-2xl border p-4 ${
                  us ? 'border-accent bg-accent-soft/15 ring-1 ring-accent/15' : 'border-line bg-bg'
                }`}
              >
                <div className="text-xs font-bold uppercase tracking-wider text-ink-2">{title}</div>
                <div className={`mt-1 text-lg font-bold ${us ? 'text-accent-ink' : 'text-ink'}`}>{cost}</div>
                <p className="mt-1.5 text-[11px] font-normal leading-relaxed text-ink-2">{body}</p>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-4 max-w-2xl text-center text-[11px] leading-relaxed text-muted-2">
            If you need thousands of visitors this week, ads are the honest answer and we will tell
            you so. What this is good at is still being there in six months, when someone searches
            for exactly what you built.
          </p>
        </div>

        {/* The deliverables. Same three ideas as before, but each now names
            the mechanism behind it &mdash; a promise you can check is worth
            more than a promise phrased well. */}
        <div className="grid gap-6 px-6 py-8 sm:px-10 md:grid-cols-3">
          {[
            {
              icon: ArrowUpRight,
              title: 'A permanent, indexed backlink',
              body:
                'Your own /tools/ page on ai-compass.in, in the sitemap and in Google. Real referral ' +
                'traffic from people searching for tools like yours, not a link in a directory nobody reads.',
            },
            {
              icon: TrendingUp,
              title: 'Placement you can see working',
              body:
                'Above free listings in your category and in search, on the homepage strip, on the ' +
                'best-of guide for your category, and on /community for 30 days. Every unit labelled.',
            },
            {
              icon: BarChart3,
              title: 'The numbers, not adjectives',
              body:
                'Views, clicks, CTR and a category benchmark on your own dashboard, plus a report ' +
                'emailed monthly. Counted by the same redirect as our own analytics, so they cannot disagree.',
            },
          ].map((benefit) => (
            <div key={benefit.title} className="space-y-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <benefit.icon className="h-4 w-4" />
              </div>
              <div className="text-sm font-bold text-ink">{benefit.title}</div>
              <p className="text-xs font-normal leading-relaxed text-ink-2">{benefit.body}</p>
            </div>
          ))}
        </div>

        {/* The limits. A page that only says yes is a page nobody believes,
            and these constraints are the reason a paid unit here is worth
            anything at all: a directory that sells its own top ten is not
            worth reading, which makes it not worth being listed in either. */}
        <div className="border-t border-line bg-bg-sunk/40 px-6 py-6 sm:px-10">
          <h3 className="text-xs font-bold uppercase tracking-wider text-accent-ink">
            What no amount of money buys
          </h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              'An editorial pick, or a place in our student picks.',
              'A community leaderboard rank. Those come from votes and clicks only.',
              'A rating, or a favourable verdict in a review you commissioned.',
              'An unlabelled placement. Every paid unit says on its face that it is paid.',
            ].map((line) => (
              <li key={line} className="flex items-start gap-2 text-[11px] font-normal leading-relaxed text-ink-2">
                <Lock className="mt-0.5 h-3 w-3 shrink-0 text-muted-2" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-5 sm:px-10">
          <p className="text-xs font-medium text-ink-2">
            Not sure which tier fits your launch? Ask us &mdash; we will say so when the answer is
            &ldquo;stay free&rdquo;.
          </p>
          <a
            href="mailto:help@ai-compass.in?subject=Which%20AI%20Compass%20tier%20fits%20my%20tool%3F"
            className="inline-flex items-center gap-1.5 rounded-xl border border-line-strong bg-bg-elev px-4 py-2 text-xs font-bold text-ink transition hover:bg-bg-sunk"
          >
            help@ai-compass.in <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </section>

      {/* Checkout modal — PayPal Smart Buttons, the one live gateway. */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-lg bg-bg-elev border border-line rounded-3xl p-6 shadow-2xl space-y-6">

            <div className="flex items-center justify-between border-b border-line pb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-accent" />
                <h3 className="text-base font-semibold text-ink">Secure {selectedTier.name} Checkout</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="text-xs font-medium text-muted hover:text-ink hover:bg-bg-sunk px-2.5 py-1 rounded-lg border border-line/45 transition"
              >
                Cancel
              </button>
            </div>

            {!paymentDone ? (
              <div className="space-y-5">

                {/* -----------------------------------------------------------
                    The order summary.
                    -----------------------------------------------------------
                    This replaces a three-tab "Select Secure Payment Gateway"
                    picker in which two of the three tabs — Stripe and Razorpay
                    — were permanently disabled and stamped "Maintenance" in
                    red. Neither has ever been wired up; the label described an
                    outage that was not happening.

                    Two thirds of a payment screen showing a red failure state
                    is the single most expensive thing on this page. A buyer
                    about to hand over $49 reads it as "their payments are
                    broken and this one probably is too", and the correct
                    response to that impression is to leave. PayPal is the only
                    gateway, it works, and a checkout that quietly does one
                    thing well is worth more than one that advertises two
                    things it cannot do. When a second gateway is genuinely
                    live, it comes back as a tab — not before.
                    ----------------------------------------------------------- */}
                <div className="rounded-2xl border border-line bg-bg-sunk/30 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Your order</p>
                      <p className="mt-1 truncate text-sm font-bold text-ink">{selectedTier.name}</p>
                      <p className="mt-0.5 truncate text-xs text-ink-2">
                        for <strong className="font-semibold text-ink">{formData.name || 'your tool'}</strong>
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-2xl font-bold text-ink">{selectedTier.priceLabel}</div>
                      <div className="text-[10px] font-medium text-muted-2">USD, one-time</div>
                    </div>
                  </div>

                  <ul className="mt-3 space-y-1.5 border-t border-line/60 pt-3">
                    {selectedTier.perks.slice(0, 4).map((perk) => (
                      <li key={perk} className="flex items-start gap-1.5 text-[11px] leading-snug text-ink-2">
                        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-accent" />
                        <span>{perk}</span>
                      </li>
                    ))}
                    {selectedTier.perks.length > 4 && (
                      <li className="pl-[18px] text-[11px] font-semibold text-muted-2">
                        + {selectedTier.perks.length - 4} more, listed in full on the right
                      </li>
                    )}
                  </ul>

                  <div className="mt-3 flex items-baseline justify-between border-t border-line/60 pt-3">
                    <span className="text-xs font-bold text-ink">Total due today</span>
                    <span className="text-base font-bold text-ink">{selectedTier.priceLabel} USD</span>
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-muted-2">
                    Charged once. Nothing renews, nothing expires, and there is no subscription to
                    cancel. Your invoice arrives by email the moment the payment clears.
                  </p>
                </div>

                {/* PayPal Smart Buttons. */}
                <form onSubmit={handlePayment} className="space-y-4">

                  {/* PAYPAL CHECKOUT BLOCK */}
                  {paymentMethod === 'paypal' && (
                    <div className="bg-bg-sunk/30 border border-line/60 rounded-2xl p-5 text-center space-y-4 animate-fade-in">
                      <div className="flex justify-center">
                        <span className="inline-flex items-center gap-1.5 bg-[#003087] text-white px-5 py-2.5 rounded-full font-bold italic text-sm tracking-tight shadow-md select-none">
                          Pay<span className="text-[#0070ba]">Pal</span>
                        </span>
                      </div>

                      {/* Smart Buttons only. The removed alternative sent the
                          buyer to an NCP payment link and asked them to paste a
                          "Transaction ID / Receipt Number" back into the form —
                          a value that can never verify, because a transaction ID
                          is not an order ID and verify_paypal_order() resolves
                          order IDs at /v2/checkout/orders/{id}. Every payment
                          made that way was destined for unverified_review. */}
                      <p className="text-xs text-ink-2 leading-relaxed font-normal max-w-md mx-auto">
                        Pay {selectedTier.priceLabel} with PayPal or any card. You will not
                        leave this page, and we never see your card details.
                      </p>

                      {/* Three explicit states. Previously only the third existed,
                          so a failed SDK load — with no hosted-button link left to
                          fall back on, ANY failure
                          — rendered nothing at all: the modal showed one sentence
                          over empty space, indistinguishable from still loading. */}
                      {paypalError ? (
                        <div className="rounded-xl border border-danger bg-danger-soft px-4 py-3 text-left space-y-2" role="alert">
                          <p className="text-xs font-semibold text-danger">
                            PayPal checkout couldn&apos;t load.
                          </p>
                          <p className="text-[11px] text-danger/90 leading-relaxed">
                            This is usually a network blip, an ad/script blocker, or a browser
                            extension blocking paypal.com. You have <b>not</b> been charged.
                          </p>
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setPaypalRetry((n) => n + 1)}
                              className="px-3 py-1.5 bg-accent text-white font-bold text-[11px] rounded-lg hover:bg-accent/90 transition"
                            >
                              Try again
                            </button>
                            <a
                              href={`mailto:help@ai-compass.in?subject=${encodeURIComponent(`Checkout failed — ${selectedTier.name}`)}&body=${encodeURIComponent(`PayPal checkout wouldn't load for ${selectedTier.name} (${selectedTier.priceLabel}).

Tool: ${formData.name}
URL: ${formData.url}
Email: ${formData.submitter_email}`)}`}
                              className="text-[11px] font-semibold text-accent hover:underline"
                            >
                              Or email us and we&apos;ll invoice you directly →
                            </a>
                          </div>
                        </div>
                      ) : !paypalLoaded ? (
                        <div className="min-h-[60px] flex items-center justify-center gap-2 text-[11px] text-muted">
                          <span className="h-3.5 w-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                          Loading secure PayPal checkout…
                        </div>
                      ) : (
                        <div id="paypal-button-container" className="min-h-[60px] flex flex-col justify-center"></div>
                      )}
                    </div>
                  )}

                  {error && (
                    <div className="rounded-xl border border-danger bg-danger-soft px-3 py-2 text-[11px] text-danger">
                      {error}
                    </div>
                  )}

                </form>

              </div>
            ) : (
              <div className="py-8 flex flex-col items-center justify-center text-center space-y-4 animate-scale-up">
                <div className="h-16 w-16 bg-accent-soft rounded-full flex items-center justify-center text-accent shadow-inner animate-pulse">
                  <CheckCircle2 className="h-10 w-10" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-ink">Payment Verified!</h4>
                  <p className="text-xs text-muted-2 mt-1 font-normal">Reference ID: {transactionRef}</p>
                  <p className="text-[10px] text-accent mt-2 font-medium">Submitting tool details to AI Compass...</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-center gap-2 text-[10px] text-muted border-t border-line/45 pt-4">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" />
              <span>SSL Secure 256-bit encrypted checkout</span>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
