import { useEffect, useState } from 'react'
import { formatMoney } from './orderStatus'

// The dollar exchange rate is set by the admin (Dashboard -> Settings) and shared by every price on the site.
let ratePromise = null

function loadRate() {
  if (!ratePromise) {
    ratePromise = fetch('/api/settings')
      .then(response => (response.ok ? response.json() : {}))
      .then(settings => (settings.usd_to_syp ? Number(settings.usd_to_syp) : null))
      .catch(() => null)
  }
  return ratePromise
}

export function forgetRate() {
  ratePromise = null
}

export function useSypRate() {
  const [rate, setRate] = useState(null)
  useEffect(() => {
    let active = true
    loadRate().then(value => active && setRate(value))
    return () => {
      active = false
    }
  }, [])
  return rate
}

// 25 dollars at 13000 -> "325,000 ل.س"
export function formatSyp(usd, rate) {
  if (!rate || usd === null || usd === undefined) return null
  return `${Math.round(Number(usd) * rate).toLocaleString('en-US')} ل.س`
}

// "$25 · 325,000 ل.س" in one line, for places that only take plain text (like <option>).
export function priceText(usd, rate) {
  const syp = formatSyp(usd, rate)
  return syp ? `${formatMoney(usd)} · ${syp}` : formatMoney(usd)
}
