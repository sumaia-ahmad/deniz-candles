import { useCallback, useEffect, useState } from 'react'
import { formatDate } from '../orderStatus'
import { cleanAmount } from '../numberInput'
import { adminApi } from './adminApi'

const emptyLine = () => ({ material_id: '', quantity: '', unit_cost: '' })

function today() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function NewPurchaseForm({ materials, onCreated, onCancel, onError }) {
  const [form, setForm] = useState({ purchased_on: today(), supplier: '', note: '' })
  const [lines, setLines] = useState([emptyLine()])
  const [saving, setSaving] = useState(false)

  function updateLine(index, field, value) {
    setLines(lines.map((line, i) => (i === index ? { ...line, [field]: value } : line)))
  }

  const total = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unit_cost) || 0), 0)

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    try {
      const items = lines.map(line => ({ ...line, material_id: Number(line.material_id) }))
      onCreated(await adminApi.createPurchase({ ...form, items }))
    } catch (err) {
      onError(err)
      setSaving(false)
    }
  }

  return (
    <form className="admin-card new-product" onSubmit={submit}>
      <h2 className="card-title">New purchase</h2>
      <div className="new-product__grid">
        <label className="field">
          <span>Date</span>
          <input type="date" value={form.purchased_on} max={today()} onChange={e => setForm({ ...form, purchased_on: e.target.value })} required />
        </label>
        <label className="field">
          <span>Supplier</span>
          <input dir="auto" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} placeholder="Optional" />
        </label>
        <label className="field new-product__wide">
          <span>Note</span>
          <input dir="auto" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Optional" />
        </label>
      </div>

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Material</th>
              <th>Quantity</th>
              <th>Cost per unit</th>
              <th>Line total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const material = materials.find(m => String(m.id) === String(line.material_id))
              return (
                <tr key={index}>
                  <td>
                    <select value={line.material_id} onChange={e => updateLine(index, 'material_id', e.target.value)} required>
                      <option value="">Choose...</option>
                      {materials.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="money-input">
                      <input type="text" inputMode="decimal" value={line.quantity} onChange={e => updateLine(index, 'quantity', cleanAmount(e.target.value))} required aria-label="Quantity" />
                      <span>{material?.unit}</span>
                    </div>
                  </td>
                  <td>
                    <div className="money-input">
                      <span>$</span>
                      <input type="text" inputMode="decimal" value={line.unit_cost} onChange={e => updateLine(index, 'unit_cost', cleanAmount(e.target.value))} required aria-label="Cost per unit" />
                    </div>
                  </td>
                  <td>${((Number(line.quantity) || 0) * (Number(line.unit_cost) || 0)).toFixed(2)}</td>
                  <td>
                    {lines.length > 1 && (
                      <button type="button" className="admin-link admin-link--danger" onClick={() => setLines(lines.filter((_, i) => i !== index))}>
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="page-head__hint">
        Tip: if you paid one price for a pack, divide it by the quantity (e.g. $12 for 1000 g = 0.012 per g).
      </p>
      <div className="card-footer">
        <button type="button" className="admin-link" onClick={() => setLines([...lines, emptyLine()])}>+ Add line</button>
        <strong>Total: ${total.toFixed(2)}</strong>
      </div>
      <div className="action-buttons">
        <button type="submit" className="btn-small btn-small--primary" disabled={saving}>
          {saving ? 'Saving...' : 'Save purchase'}
        </button>
        <button type="button" className="btn-small" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function PurchasesPage({ onSessionEnded }) {
  const [purchases, setPurchases] = useState(null)
  const [materials, setMaterials] = useState([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const handleError = useCallback(err => (err.status === 401 ? onSessionEnded() : setError(err.message)), [onSessionEnded])

  useEffect(() => {
    adminApi.purchases().then(setPurchases).catch(handleError)
    adminApi.materials().then(setMaterials).catch(handleError)
  }, [handleError])

  async function remove(purchase) {
    if (!window.confirm(`Delete this purchase? Its quantities will be taken out of the stock again.`)) return
    try {
      await adminApi.deletePurchase(purchase.id)
      setPurchases(purchases.filter(p => p.id !== purchase.id))
    } catch (err) {
      handleError(err)
    }
  }

  if (purchases === null) return <p className="admin-status">{error || 'Loading purchases...'}</p>

  const activeMaterials = materials.filter(m => m.is_active)

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Purchases</h1>
          <p className="page-head__hint">
            Every purchase adds to the stock and updates each material's average cost, which the recipes use to
            work out the cost of a piece.
          </p>
        </div>
        <button type="button" className="btn-small btn-small--primary" onClick={() => setCreating(true)} disabled={activeMaterials.length === 0}>
          + New purchase
        </button>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error} <button type="button" className="admin-link" onClick={() => setError('')}>Dismiss</button>
        </p>
      )}

      {activeMaterials.length === 0 && <p className="admin-status">Add your materials in Inventory first.</p>}

      {creating && (
        <NewPurchaseForm
          materials={activeMaterials}
          onCreated={purchase => {
            setPurchases([purchase, ...purchases].sort((a, b) => b.purchased_on.localeCompare(a.purchased_on) || b.id - a.id))
            setCreating(false)
            setError('')
          }}
          onCancel={() => setCreating(false)}
          onError={handleError}
        />
      )}

      {purchases.length === 0 ? (
        activeMaterials.length > 0 && <p className="admin-status">No purchases yet.</p>
      ) : (
        <div className="purchase-list">
          {purchases.map(p => (
            <article key={p.id} className="admin-card">
              <div className="purchase-head">
                <strong>{formatDate(p.purchased_on, 'en-GB')}</strong>
                {p.supplier && <span dir="auto">{p.supplier}</span>}
                <strong className="purchase-head__total">${p.total}</strong>
              </div>
              <ul className="purchase-items">
                {p.items.map((item, index) => (
                  <li key={index}>
                    <span dir="auto">{item.material_name}</span>
                    <span className="muted">
                      {item.quantity} {item.unit} × ${item.unit_cost}
                    </span>
                    <span>${item.line_total}</span>
                  </li>
                ))}
              </ul>
              <div className="card-footer">
                <span className="muted" dir="auto">{p.note}</span>
                <button type="button" className="admin-link admin-link--danger" onClick={() => remove(p)}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default PurchasesPage
