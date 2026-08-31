// Loader for the PayPal JS SDK's `buttons` component, shared by every
// dynamic-amount checkout on the site (sponsored placements, commissioned
// reviews). Extracted so the two cannot drift: they run on the same
// sponsorship REST app and hit the same namespace, and a second copy of this
// file would eventually load the SDK twice.
//
// /submit loads the same SDK with `components=hosted-buttons`, which yields a
// window.paypal exposing HostedButtons and NOT Buttons. Sharing that instance
// makes paypal.Buttons(...) throw for anyone whose session touched /submit
// first. PayPal's data-namespace option exists for exactly this: it parks our
// instance on its own global so the two can coexist instead of clobbering
// each other.
const SDK_NAMESPACE = 'paypalSponsorSdk'
let paypalSdkPromise = null

export function loadPayPalSdk(clientId) {
  const existing = window[SDK_NAMESPACE]
  if (existing && typeof existing.Buttons === 'function') return Promise.resolve(existing)
  if (paypalSdkPromise) return paypalSdkPromise

  paypalSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.id = 'paypal-sdk-sponsor'
    script.src =
      `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}` +
      '&components=buttons&currency=USD&disable-funding=venmo'
    script.async = true
    script.setAttribute('data-namespace', SDK_NAMESPACE)
    script.onload = () => {
      const sdk = window[SDK_NAMESPACE]
      if (!sdk) {
        reject(new Error('SDK loaded but exposed no global'))
      } else if (typeof sdk.Buttons !== 'function') {
        // Almost always means the client ID is not enabled for the JS SDK's
        // dynamic-amount checkout (e.g. a hosted-button-only credential).
        reject(new Error('This PayPal client ID does not support dynamic checkout buttons'))
      } else {
        resolve(sdk)
      }
    }
    // A blocked script and a network failure are indistinguishable here —
    // the browser fires onerror either way and tells us nothing more. A
    // privacy blocker is far and away the likelier cause for this audience
    // (the same reason tool favicons go through a first-party proxy), so
    // name it and give the reader something to do about it.
    script.onerror = () => reject(new Error(
      'Your browser blocked the PayPal checkout script — usually an ad blocker ' +
      'or Brave Shields. Allow paypal.com for this page and reload, or pay by ' +
      'email invoice instead.'
    ))
    document.body.appendChild(script)
  }).catch((err) => {
    paypalSdkPromise = null
    throw err
  })

  return paypalSdkPromise
}

export default loadPayPalSdk
