import { useEffect, useState } from 'react'
import { forgetRate } from '../currency'
import { cleanAmount } from '../numberInput'
import { formatDate } from '../orderStatus'
import { adminApi } from './adminApi'

function SettingsPage({ onSessionEnded }) {
  const [settings, setSettings] = useState(null)
  const [rate, setRate] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    adminApi
      .settings()
      .then(data => {
        setSettings(data)
        setRate(data.usd_to_syp ?? '')
      })
      .catch(err => (err.status === 401 ? onSessionEnded() : setError(err.message)))
  }, [onSessionEnded])

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const data = await adminApi.updateSettings({ usd_to_syp: rate })
      setSettings(data)
      setRate(data.usd_to_syp ?? '')
      forgetRate() // the website picks up the new rate on its next load
      setSaved(true)
    } catch (err) {
      if (err.status === 401) onSessionEnded()
      else setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (settings === null) return <p className="admin-status">{error || 'Loading settings...'}</p>

  const example = Number(rate) > 0 ? Math.round(25 * Number(rate)).toLocaleString('en-US') : null

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
        </div>
      </div>

      <form className="admin-card settings-card" onSubmit={save}>
        <h3 className="card-title">Dollar exchange rate</h3>
        <p className="page-head__hint">
          Prices stay in US dollars. The website also shows the Syrian pound equivalent using this rate. Leave it
          empty to show dollars only.
        </p>
        <label className="field">
          <span>1 US dollar =</span>
          <div className="money-input">
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={rate}
              onChange={e => {
                setRate(cleanAmount(e.target.value))
                setSaved(false)
              }}
              placeholder="e.g. 13000"
            />
            <span>SYP</span>
          </div>
        </label>
        {example && <p className="page-head__hint">Example: $25 shows as ≈ {example} ل.س</p>}
        {settings.usd_to_syp_updated_at && (
          <p className="page-head__hint">Last updated {formatDate(settings.usd_to_syp_updated_at, 'en-GB')}</p>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="action-buttons">
          <button type="submit" className="btn-small btn-small--primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          {saved && <span className="saved">Saved ✓</span>}
        </div>
      </form>
    </section>
  )
}

export default SettingsPage
