import { useEffect, useState } from 'react'
import { formatMoney } from './orderStatus'

// Site settings set by the admin (Dashboard -> Settings): the dollar exchange rate and the
// transfer details customers pay to. Loaded once and shared by the whole site.
let settingsPromise = null

function loadSettings() {
  if (!settingsPromise) {
    settingsPromise = fetch('/api/settings')
      .then(response => (response.ok ? response.json() : {}))
      .catch(() => ({}))
  }
  return settingsPromise
}

export function forgetRate() {
  settingsPromise = null
}

export function useSiteSettings() {
  const [settings, setSettings] = useState({})
  useEffect(() => {
    let active = true
    loadSettings().then(value => active && setSettings(value))
    return () => {
      active = false
    }
  }, [])
  return settings
}

export function useSypRate() {
  const settings = useSiteSettings()
  return settings.usd_to_syp ? Number(settings.usd_to_syp) : null
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
