import { useEffect, useState } from 'react'
import { adminApi } from './adminApi'

function ZoneRow({ zone, onSaved, onDeleted, onError }) {
  const [draft, setDraft] = useState({ name_ar: zone.name_ar, fee: zone.fee })
  const [saving, setSaving] = useState(false)

  const changed = draft.name_ar !== zone.name_ar || String(draft.fee) !== String(zone.fee)

  async function save(changes) {
    setSaving(true)
    try {
      const updated = await adminApi.updateZone(zone.id, changes)
      onSaved(updated)
      setDraft({ name_ar: updated.name_ar, fee: updated.fee })
    } catch (err) {
      onError(err)
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!window.confirm(`أكيد بدك تحذفي منطقة "${zone.name_ar}"؟`)) return
    try {
      await adminApi.deleteZone(zone.id)
      onDeleted(zone.id)
    } catch (err) {
      onError(err)
    }
  }

  return (
    <tr className={zone.is_active ? '' : 'row-muted'}>
      <td>
        <input value={draft.name_ar} onChange={e => setDraft({ ...draft, name_ar: e.target.value })} aria-label="اسم المنطقة" />
      </td>
      <td>
        <div className="money-input">
          <span>$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={draft.fee}
            onChange={e => setDraft({ ...draft, fee: e.target.value })}
            aria-label="أجرة التوصيل"
          />
        </div>
      </td>
      <td>
        <label className="switch">
          <input type="checkbox" checked={zone.is_active} onChange={() => save({ is_active: !zone.is_active })} />
          <span>{zone.is_active ? 'متاحة' : 'موقوفة'}</span>
        </label>
      </td>
      <td className="row-actions">
        <button
          type="button"
          className="btn-small btn-small--primary"
          onClick={() => save(draft)}
          disabled={!changed || saving}
        >
          {saving ? '...' : 'حفظ'}
        </button>
        <button type="button" className="btn-small btn-small--danger" onClick={remove}>
          حذف
        </button>
      </td>
    </tr>
  )
}

function ZonesPage({ onSessionEnded }) {
  const [zones, setZones] = useState(null)
  const [error, setError] = useState('')
  const [newZone, setNewZone] = useState({ name_ar: '', fee: '' })

  function handleError(err) {
    if (err.status === 401) onSessionEnded()
    else setError(err.message)
  }

  useEffect(() => {
    adminApi
      .zones()
      .then(setZones)
      .catch(err => (err.status === 401 ? onSessionEnded() : setError(err.message)))
  }, [onSessionEnded])

  async function addZone(event) {
    event.preventDefault()
    setError('')
    try {
      const zone = await adminApi.createZone(newZone)
      setZones([...zones, zone].sort((a, b) => a.name_ar.localeCompare(b.name_ar, 'ar')))
      setNewZone({ name_ar: '', fee: '' })
    } catch (err) {
      handleError(err)
    }
  }

  if (zones === null) return <p className="admin-status">{error || 'عم نحمّل المناطق...'}</p>

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>مناطق التوصيل</h1>
          <p className="page-head__hint">
            مناطق دمشق وأجرة التوصيل لكل وحدة. الأجرة بتنضاف لمجموع الطلب تلقائياً.
            الشحن للمحافظات عن طريق القدموس ما بينحط هون.
          </p>
        </div>
      </div>

      <form className="inline-form inline-form--card" onSubmit={addZone}>
        <input
          value={newZone.name_ar}
          onChange={e => setNewZone({ ...newZone, name_ar: e.target.value })}
          placeholder="اسم المنطقة (مثلاً: المزة)"
          required
        />
        <div className="money-input">
          <span>$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={newZone.fee}
            onChange={e => setNewZone({ ...newZone, fee: e.target.value })}
            placeholder="الأجرة"
            required
          />
        </div>
        <button type="submit" className="btn-small btn-small--primary">+ إضافة منطقة</button>
      </form>

      {error && (
        <p className="form-error" role="alert">
          {error}{' '}
          <button type="button" className="admin-link" onClick={() => setError('')}>
            إخفاء
          </button>
        </p>
      )}

      {zones.length === 0 ? (
        <p className="admin-status">لسا ما في مناطق. ضيفي أول منطقة من فوق 👆</p>
      ) : (
        <div className="admin-card table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>المنطقة</th>
                <th>أجرة التوصيل</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {zones.map(zone => (
                <ZoneRow
                  key={zone.id}
                  zone={zone}
                  onSaved={updated => setZones(zones.map(z => (z.id === updated.id ? updated : z)))}
                  onDeleted={id => setZones(zones.filter(z => z.id !== id))}
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

export default ZonesPage
