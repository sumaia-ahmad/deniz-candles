import { useCallback, useEffect, useState } from 'react'
import { formatDate } from '../orderStatus'
import { cleanAmount } from '../numberInput'
import { adminApi } from './adminApi'

const UNITS = ['g', 'ml', 'piece', 'cm', 'm', 'kg', 'l']
const REASON_LABELS = {
  purchase: 'Purchase',
  order: 'Used by order',
  order_return: 'Order cancelled',
  adjustment: 'Adjustment',
}

// Accepts "-12.5" as well as "12.5" for stock corrections.
function cleanSigned(value) {
  const negative = value.trim().startsWith('-')
  const amount = cleanAmount(value)
  return negative ? `-${amount}` : amount
}

function NewMaterialForm({ onCreated, onCancel, onError }) {
  const [form, setForm] = useState({ name: '', unit: 'g', low_stock_threshold: '', opening_quantity: '', opening_unit_cost: '' })
  const [saving, setSaving] = useState(false)

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    try {
      onCreated(await adminApi.createMaterial(form))
    } catch (err) {
      onError(err)
      setSaving(false)
    }
  }

  return (
    <form className="admin-card new-product" onSubmit={submit}>
      <h2 className="card-title">New material</h2>
      <div className="new-product__grid">
        <label className="field new-product__wide">
          <span>Name</span>
          <input dir="auto" value={form.name} onChange={e => update('name', e.target.value)} placeholder="e.g. شمع صويا" required />
        </label>
        <label className="field">
          <span>Unit</span>
          <input list="units" value={form.unit} onChange={e => update('unit', e.target.value)} required />
          <datalist id="units">
            {UNITS.map(u => <option key={u} value={u} />)}
          </datalist>
        </label>
        <label className="field">
          <span>Alert when stock is at or below</span>
          <input type="text" inputMode="decimal" value={form.low_stock_threshold} onChange={e => update('low_stock_threshold', cleanAmount(e.target.value))} placeholder="Optional" />
        </label>
        <label className="field">
          <span>Stock you have now</span>
          <input type="text" inputMode="decimal" value={form.opening_quantity} onChange={e => update('opening_quantity', cleanAmount(e.target.value))} placeholder="Optional" />
        </label>
        <label className="field">
          <span>Cost per unit ($)</span>
          <input type="text" inputMode="decimal" value={form.opening_unit_cost} onChange={e => update('opening_unit_cost', cleanAmount(e.target.value))} placeholder="Optional" />
        </label>
      </div>
      <p className="page-head__hint">Tip: later stock comes in through Purchases, which also keep the cost per unit up to date.</p>
      <div className="action-buttons">
        <button type="submit" className="btn-small btn-small--primary" disabled={saving}>
          {saving ? 'Saving...' : 'Add material'}
        </button>
        <button type="button" className="btn-small" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function MaterialRow({ material, onChange, onError }) {
  const [threshold, setThreshold] = useState(material.low_stock_threshold ?? '')
  const [panel, setPanel] = useState(null) // 'adjust' | 'history'
  const [adjust, setAdjust] = useState({ change: '', note: '' })
  const [history, setHistory] = useState(null)
  const [busy, setBusy] = useState(false)

  async function run(action) {
    setBusy(true)
    try {
      const updated = await action()
      onChange(updated)
      return updated
    } catch (err) {
      onError(err)
      return null
    } finally {
      setBusy(false)
    }
  }

  async function saveThreshold() {
    const updated = await run(() => adminApi.updateMaterial(material.id, { low_stock_threshold: threshold }))
    if (updated) setThreshold(updated.low_stock_threshold ?? '')
  }

  async function saveAdjustment(event) {
    event.preventDefault()
    const updated = await run(() => adminApi.adjustStock(material.id, adjust.change, adjust.note))
    if (updated) {
      setAdjust({ change: '', note: '' })
      setPanel(null)
      setHistory(null)
    }
  }

  async function toggleHistory() {
    if (panel === 'history') return setPanel(null)
    setPanel('history')
    try {
      setHistory(await adminApi.movements(material.id))
    } catch (err) {
      onError(err)
    }
  }

  const thresholdChanged = String(threshold) !== String(material.low_stock_threshold ?? '')

  return (
    <>
      <tr className={material.is_low ? 'row-low' : ''}>
        <td dir="auto"><strong>{material.name}</strong></td>
        <td className={material.is_low ? 'warn-text' : ''}>
          {material.is_low && '⚠ '}
          {material.quantity} {material.unit}
        </td>
        <td>
          <div className="inline-edit">
            <input type="text" inputMode="decimal" className="input-short" value={threshold} onChange={e => setThreshold(cleanAmount(e.target.value))} placeholder="—" aria-label="Alert at" />
            {thresholdChanged && (
              <button type="button" className="btn-small btn-small--primary" disabled={busy} onClick={saveThreshold}>Save</button>
            )}
          </div>
        </td>
        <td>{material.average_unit_cost ? `$${material.average_unit_cost} / ${material.unit}` : '—'}</td>
        <td className="row-actions">
          <button type="button" className="admin-link" onClick={() => setPanel(panel === 'adjust' ? null : 'adjust')}>Adjust</button>
          {' · '}
          <button type="button" className="admin-link" onClick={toggleHistory}>History</button>
        </td>
      </tr>
      {panel === 'adjust' && (
        <tr className="row-panel">
          <td colSpan={5}>
            <form className="inline-form" onSubmit={saveAdjustment}>
              <input type="text" inputMode="decimal" value={adjust.change} onChange={e => setAdjust({ ...adjust, change: cleanSigned(e.target.value) })} placeholder={`+ or - ${material.unit}`} required className="input-short" />
              <input dir="auto" value={adjust.note} onChange={e => setAdjust({ ...adjust, note: e.target.value })} placeholder="Reason (e.g. stock count, damaged)" required />
              <button type="submit" className="btn-small btn-small--primary" disabled={busy}>Save</button>
            </form>
          </td>
        </tr>
      )}
      {panel === 'history' && (
        <tr className="row-panel">
          <td colSpan={5}>
            {history === null ? (
              <p className="muted">Loading...</p>
            ) : history.length === 0 ? (
              <p className="muted">No movements yet.</p>
            ) : (
              <ul className="movement-list">
                {history.map(m => (
                  <li key={m.id}>
                    <span className={Number(m.change) < 0 ? 'warn-text' : 'ok-text'}>
                      {Number(m.change) > 0 ? '+' : ''}{m.change} {material.unit}
                    </span>
                    <span>{REASON_LABELS[m.reason]}</span>
                    {m.note && <span className="muted" dir="auto">{m.note}</span>}
                    <span className="muted">{formatDate(m.created_at, 'en-GB')}</span>
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function InventoryPage({ onSessionEnded }) {
  const [materials, setMaterials] = useState(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const handleError = useCallback(err => (err.status === 401 ? onSessionEnded() : setError(err.message)), [onSessionEnded])

  useEffect(() => {
    adminApi.materials().then(setMaterials).catch(handleError)
  }, [handleError])

  if (materials === null) return <p className="admin-status">{error || 'Loading inventory...'}</p>

  const low = materials.filter(m => m.is_low)

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Inventory</h1>
          <p className="page-head__hint">
            Raw materials in stock. Purchases add stock; starting to prepare an order uses the materials in its
            recipes; cancelling it puts them back.
          </p>
        </div>
        <button type="button" className="btn-small btn-small--primary" onClick={() => setCreating(true)}>+ New material</button>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error} <button type="button" className="admin-link" onClick={() => setError('')}>Dismiss</button>
        </p>
      )}

      {low.length > 0 && (
        <p className="low-banner">⚠ Running low: {low.map(m => m.name).join('، ')}</p>
      )}

      {creating && (
        <NewMaterialForm
          onCreated={m => {
            setMaterials([...materials, m].sort((a, b) => a.name.localeCompare(b.name, 'ar')))
            setCreating(false)
            setError('')
          }}
          onCancel={() => setCreating(false)}
          onError={handleError}
        />
      )}

      {materials.length === 0 ? (
        <p className="admin-status">No materials yet. Add your wax, boxes, ribbons... 👆</p>
      ) : (
        <div className="admin-card table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Material</th>
                <th>In stock</th>
                <th>Alert at</th>
                <th>Avg. cost</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {materials.map(m => (
                <MaterialRow
                  key={m.id}
                  material={m}
                  onChange={updated => setMaterials(materials.map(x => (x.id === updated.id ? updated : x)))}
                  onError={handleError}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default InventoryPage
