import { useEffect, useState } from 'react'
import { adminApi } from './adminApi'
import { cleanAmount, cleanWholeNumber } from '../numberInput'

const KIND_TITLES = { favor: 'Favors', gift: 'Gifts' }

function SizeRow({ size, canDelete, onSaved, onDeleted, onError }) {
  const [draft, setDraft] = useState({
    name_ar: size.name_ar,
    price: size.price ?? '',
    min_lead_days: size.min_lead_days,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const changed =
    draft.name_ar !== size.name_ar ||
    String(draft.price) !== String(size.price ?? '') ||
    String(draft.min_lead_days) !== String(size.min_lead_days)

  function update(field, value) {
    setDraft({ ...draft, [field]: value })
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    try {
      const updated = await adminApi.updateSize(size.id, draft)
      onSaved(updated)
      // Show the value exactly as the server stored it (e.g. "12" -> "12.00").
      setDraft({ name_ar: updated.name_ar, price: updated.price ?? '', min_lead_days: updated.min_lead_days })
      setSaved(true)
    } catch (err) {
      onError(err)
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!window.confirm(`Delete the size "${size.name_ar}"?`)) return
    try {
      await adminApi.deleteSize(size.id)
      onDeleted(size.id)
    } catch (err) {
      onError(err)
    }
  }

  return (
    <tr>
      <td>
        <input value={draft.name_ar} onChange={e => update('name_ar', e.target.value)} aria-label="Size name" dir="auto" />
      </td>
      <td>
        <div className="money-input">
          <span>$</span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={draft.price}
            onChange={e => update('price', cleanAmount(e.target.value))}
            placeholder="Price"
            aria-label="Price"
          />
        </div>
      </td>
      <td>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={draft.min_lead_days}
          onChange={e => update('min_lead_days', cleanWholeNumber(e.target.value))}
          aria-label="Minimum days before the event"
          className="input-short"
        />
      </td>
      <td className="row-actions">
        <button type="button" className="btn-small btn-small--primary" onClick={save} disabled={!changed || saving}>
          {saving ? '...' : 'Save'}
        </button>
        {saved && !changed && <span className="saved">✓</span>}
        {canDelete && (
          <button type="button" className="btn-small btn-small--danger" onClick={remove}>
            Delete
          </button>
        )}
      </td>
    </tr>
  )
}

function ProductCard({ product, onChange, onError }) {
  const [adding, setAdding] = useState(false)
  const [newSize, setNewSize] = useState({ name_ar: '', price: '' })

  function replaceSize(updated) {
    onChange({ ...product, sizes: product.sizes.map(s => (s.id === updated.id ? updated : s)) })
  }

  function removeSize(sizeId) {
    onChange({ ...product, sizes: product.sizes.filter(s => s.id !== sizeId) })
  }

  async function toggleVisible() {
    try {
      onChange(await adminApi.updateProduct(product.id, { is_visible: !product.is_visible }))
    } catch (err) {
      onError(err)
    }
  }

  async function addSize(event) {
    event.preventDefault()
    try {
      const size = await adminApi.addSize(product.id, newSize)
      onChange({ ...product, sizes: [...product.sizes, size] })
      setNewSize({ name_ar: '', price: '' })
      setAdding(false)
    } catch (err) {
      onError(err)
    }
  }

  return (
    <article className={product.is_visible ? 'admin-card' : 'admin-card admin-card--hidden'}>
      <div className="admin-card__head">
        {product.images[0] && <img src={product.images[0]} alt="" className="admin-card__image" />}
        <div className="admin-card__title">
          <h3 dir="auto">{product.name_ar}</h3>
          {!product.is_visible && <span className="badge">Hidden from customers</span>}
        </div>
        <label className="switch" title="Visible on the website">
          <input type="checkbox" checked={product.is_visible} onChange={toggleVisible} />
          <span>Visible on site</span>
        </label>
      </div>

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Size</th>
              <th>Price</th>
              <th>Min. days</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {product.sizes.map(size => (
              <SizeRow
                key={size.id}
                size={size}
                canDelete={product.sizes.length > 1}
                onSaved={replaceSize}
                onDeleted={removeSize}
                onError={onError}
              />
            ))}
          </tbody>
        </table>
      </div>

      {adding ? (
        <form className="inline-form" onSubmit={addSize}>
          <input
            value={newSize.name_ar}
            onChange={e => setNewSize({ ...newSize, name_ar: e.target.value })}
            placeholder="Size name (e.g. كبير)" dir="auto"
            required
          />
          <div className="money-input">
            <span>$</span>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={newSize.price}
              onChange={e => setNewSize({ ...newSize, price: cleanAmount(e.target.value) })}
              placeholder="Price"
            />
          </div>
          <button type="submit" className="btn-small btn-small--primary">Add</button>
          <button type="button" className="btn-small" onClick={() => setAdding(false)}>Cancel</button>
        </form>
      ) : (
        <button type="button" className="admin-link" onClick={() => setAdding(true)}>
          + Add size
        </button>
      )}
    </article>
  )
}

function ProductsPage({ onSessionEnded }) {
  const [products, setProducts] = useState(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  function handleError(err) {
    if (err.status === 401) onSessionEnded()
    else setError(err.message)
  }

  useEffect(() => {
    adminApi
      .products()
      .then(setProducts)
      .catch(err => (err.status === 401 ? onSessionEnded() : setError(err.message)))
  }, [onSessionEnded])

  function replaceProduct(updated) {
    setProducts(products.map(p => (p.id === updated.id ? updated : p)))
  }

  if (products === null) return <p className="admin-status">{error || 'Loading products...'}</p>

  const visible = products.filter(p => p.name_ar.includes(search.trim()))
  const withoutPrice = products.filter(p => p.sizes.some(s => s.price === null)).length

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Products & Prices</h1>
          <p className="page-head__hint">
            Prices are in US dollars, per size. "Min. days" is the shortest time allowed between the order and
            the event.
            {withoutPrice > 0 && <strong> {withoutPrice} products still have no price.</strong>}
          </p>
        </div>
        <input
          className="search"
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search products..." dir="auto"
        />
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}{' '}
          <button type="button" className="admin-link" onClick={() => setError('')}>
            Dismiss
          </button>
        </p>
      )}

      {['favor', 'gift'].map(kind => (
        <div key={kind} className="kind-group">
          <h2>{KIND_TITLES[kind]}</h2>
          <div className="admin-grid">
            {visible
              .filter(p => p.kind === kind)
              .map(product => (
                <ProductCard key={product.id} product={product} onChange={replaceProduct} onError={handleError} />
              ))}
          </div>
        </div>
      ))}
    </section>
  )
}

export default ProductsPage
