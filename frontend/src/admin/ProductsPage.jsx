import { useCallback, useEffect, useState } from 'react'
import { adminApi } from './adminApi'
import { cleanAmount, cleanWholeNumber } from '../numberInput'

const KIND_TITLES = { favor: 'Favors', gift: 'Gifts' }

function CostCell({ size }) {
  if (size.recipe_count === 0) return <span className="muted">No recipe</span>
  if (size.unit_cost === null) return <span className="muted" title="Some materials have no cost yet">Cost unknown</span>
  const cost = Number(size.unit_cost)
  if (size.price === null) return <span>${size.unit_cost}</span>
  const profit = Number(size.price) - cost
  const margin = Number(size.price) > 0 ? Math.round((profit / Number(size.price)) * 100) : 0
  return (
    <span title={`Profit per piece: $${profit.toFixed(2)}`}>
      ${size.unit_cost} · <span className={profit < 0 ? 'warn-text' : 'ok-text'}>{margin}%</span>
    </span>
  )
}

// What one piece of a size is made of; the cost per piece comes from each material's average cost.
function RecipeEditor({ size, materials, onSaved, onClose, onError }) {
  const [lines, setLines] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    adminApi
      .recipe(size.id)
      .then(recipe => setLines(recipe.items.map(item => ({ material_id: String(item.material_id), quantity: item.quantity }))))
      .catch(onError)
  }, [size.id, onError])

  function updateLine(index, field, value) {
    setLines(lines.map((line, i) => (i === index ? { ...line, [field]: value } : line)))
  }

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    try {
      const items = lines.map(line => ({ material_id: Number(line.material_id), quantity: line.quantity }))
      const recipe = await adminApi.saveRecipe(size.id, items)
      onSaved({ ...size, unit_cost: recipe.unit_cost, recipe_count: recipe.items.length })
      onClose()
    } catch (err) {
      onError(err)
      setSaving(false)
    }
  }

  if (lines === null) return <p className="muted">Loading recipe...</p>
  if (materials.length === 0) return <p className="muted">Add your materials in Inventory first, then come back to build the recipe.</p>

  return (
    <form className="recipe" onSubmit={save}>
      <p className="muted">One piece of this size uses:</p>
      {lines.map((line, index) => {
        const material = materials.find(m => String(m.id) === line.material_id)
        return (
          <div key={index} className="recipe__line">
            <select value={line.material_id} onChange={e => updateLine(index, 'material_id', e.target.value)} required>
              <option value="">Material...</option>
              {materials.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <div className="money-input">
              <input type="text" inputMode="decimal" value={line.quantity} onChange={e => updateLine(index, 'quantity', cleanAmount(e.target.value))} placeholder="Qty" required aria-label="Quantity per piece" />
              <span>{material?.unit}</span>
            </div>
            <button type="button" className="admin-link admin-link--danger" onClick={() => setLines(lines.filter((_, i) => i !== index))}>×</button>
          </div>
        )
      })}
      <div className="action-buttons">
        <button type="button" className="admin-link" onClick={() => setLines([...lines, { material_id: '', quantity: '' }])}>+ Material</button>
        <button type="submit" className="btn-small btn-small--primary" disabled={saving}>{saving ? '...' : 'Save recipe'}</button>
        <button type="button" className="btn-small" onClick={onClose}>Cancel</button>
      </div>
    </form>
  )
}

function SizeRow({ size, materials, canDelete, onSaved, onDeleted, onError }) {
  const [editingRecipe, setEditingRecipe] = useState(false)
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
    <>
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
      <td className="row-cost">
        <CostCell size={size} />
        <button type="button" className="admin-link" onClick={() => setEditingRecipe(!editingRecipe)}>
          {size.recipe_count ? 'Recipe' : '+ Recipe'}
        </button>
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
    {editingRecipe && (
      <tr className="row-panel">
        <td colSpan={5}>
          <RecipeEditor size={size} materials={materials} onSaved={onSaved} onClose={() => setEditingRecipe(false)} onError={onError} />
        </td>
      </tr>
    )}
    </>
  )
}

function PhotoStrip({ product, onChange, onError }) {
  const [busy, setBusy] = useState(false)

  async function run(action) {
    setBusy(true)
    try {
      onChange(await action())
    } catch (err) {
      onError(err)
    } finally {
      setBusy(false)
    }
  }

  function upload(files) {
    if (!files.length) return
    const data = new FormData()
    Array.from(files).forEach(file => data.append('photos', file))
    run(() => adminApi.addPhotos(product.id, data))
  }

  return (
    <div className={busy ? 'photo-strip photo-strip--busy' : 'photo-strip'}>
      {product.photos.map((photo, index) => (
        <div key={photo.id} className="photo-strip__item">
          <img src={photo.url} alt="" />
          {index === 0 ? (
            <span className="photo-strip__cover">Cover</span>
          ) : (
            <button type="button" className="photo-strip__btn" title="Make cover" onClick={() => run(() => adminApi.makeCover(photo.id))}>
              ★
            </button>
          )}
          {product.photos.length > 1 && (
            <button
              type="button"
              className="photo-strip__btn photo-strip__btn--delete"
              title="Delete photo"
              onClick={() => window.confirm('Delete this photo?') && run(() => adminApi.deletePhoto(photo.id))}
            >
              ×
            </button>
          )}
        </div>
      ))}
      {product.photos.length < 10 && (
        <label className="photo-strip__add" title="Add photos">
          +
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => upload(e.target.files)} hidden />
        </label>
      )}
    </div>
  )
}

function NewProductForm({ occasions, onCreated, onCancel, onError }) {
  const [form, setForm] = useState({ kind: 'favor', occasion: '', name_ar: '', size_name: 'قياسي', price: '', min_lead_days: '0' })
  const [photos, setPhotos] = useState([])
  const [saving, setSaving] = useState(false)

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function chooseKind(kind) {
    // Favors need an occasion; big orders get their time from the large-order rule in Settings (BR-9).
    setForm(f => ({ ...f, kind, min_lead_days: kind === 'favor' ? '0' : '3' }))
  }

  async function submit(event) {
    event.preventDefault()
    const data = new FormData()
    Object.entries(form).forEach(([key, value]) => data.append(key, value))
    photos.forEach(file => data.append('photos', file))
    setSaving(true)
    try {
      onCreated(await adminApi.createProduct(data))
    } catch (err) {
      onError(err)
      setSaving(false)
    }
  }

  return (
    <form className="admin-card new-product" onSubmit={submit}>
      <h2 className="card-title">New product</h2>
      <div className="new-product__grid">
        <div className="field">
          <span>Type</span>
          <div className="segmented">
            {['favor', 'gift'].map(kind => (
              <button
                key={kind}
                type="button"
                className={form.kind === kind ? 'segmented__on' : ''}
                onClick={() => chooseKind(kind)}
              >
                {kind === 'favor' ? 'Favor' : 'Gift'}
              </button>
            ))}
          </div>
        </div>
        {form.kind === 'favor' && (
          <label className="field">
            <span>Occasion</span>
            <select value={form.occasion} onChange={e => update('occasion', e.target.value)} required>
              <option value="">Choose...</option>
              {occasions.map(o => (
                <option key={o.slug} value={o.slug}>{o.name_en}</option>
              ))}
            </select>
          </label>
        )}
        <label className="field new-product__wide">
          <span>Name (shown to customers)</span>
          <input dir="auto" value={form.name_ar} onChange={e => update('name_ar', e.target.value)} placeholder="e.g. شمعة قلب" required />
        </label>
        <label className="field">
          <span>Size</span>
          <input dir="auto" value={form.size_name} onChange={e => update('size_name', e.target.value)} required />
        </label>
        <label className="field">
          <span>Price ($)</span>
          <input type="text" inputMode="decimal" autoComplete="off" value={form.price} onChange={e => update('price', cleanAmount(e.target.value))} placeholder="Optional" />
        </label>
        <label className="field">
          <span>Min. days</span>
          <input type="text" inputMode="numeric" autoComplete="off" value={form.min_lead_days} onChange={e => update('min_lead_days', cleanWholeNumber(e.target.value))} required />
        </label>
        <label className="field new-product__wide">
          <span>Photos (the first one is the cover)</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => setPhotos(Array.from(e.target.files))} required />
        </label>
      </div>
      {photos.length > 0 && (
        <div className="photo-strip">
          {photos.map((file, index) => (
            <div key={index} className="photo-strip__item">
              <img src={URL.createObjectURL(file)} alt="" />
              {index === 0 && <span className="photo-strip__cover">Cover</span>}
            </div>
          ))}
        </div>
      )}
      <div className="action-buttons">
        <button type="submit" className="btn-small btn-small--primary" disabled={saving}>
          {saving ? 'Saving...' : 'Create product'}
        </button>
        <button type="button" className="btn-small" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function ProductCard({ product, materials, onChange, onDeleted, onError }) {
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

  async function removeProduct() {
    if (!window.confirm(`Delete "${product.name_ar}" for good? (To keep it but stop showing it, untick "Visible on site".)`)) return
    try {
      await adminApi.deleteProduct(product.id)
      onDeleted(product.id)
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

      <PhotoStrip product={product} onChange={onChange} onError={onError} />

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Size</th>
              <th>Price</th>
              <th>Min. days</th>
              <th>Cost · margin</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {product.sizes.map(size => (
              <SizeRow
                key={size.id}
                size={size}
                materials={materials}
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
        <div className="card-footer">
          <button type="button" className="admin-link" onClick={() => setAdding(true)}>
            + Add size
          </button>
          <button type="button" className="admin-link admin-link--danger" onClick={removeProduct}>
            Delete product
          </button>
        </div>
      )}
    </article>
  )
}

function ProductsPage({ onSessionEnded }) {
  const [products, setProducts] = useState(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [occasions, setOccasions] = useState([])
  const [creating, setCreating] = useState(false)
  const [materials, setMaterials] = useState([])

  const handleError = useCallback(err => (err.status === 401 ? onSessionEnded() : setError(err.message)), [onSessionEnded])

  useEffect(() => {
    adminApi.occasions().then(setOccasions).catch(() => {})
    adminApi.materials().then(list => setMaterials(list.filter(m => m.is_active))).catch(() => {})
  }, [])

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
            the event for that size. Large orders also follow the rule in Settings. "Cost" is what one piece's
            materials cost (from its recipe), and the % is the margin on the price.
            {withoutPrice > 0 && <strong> {withoutPrice} products still have no price.</strong>}
          </p>
        </div>
        <div className="page-head__tools">
          <button type="button" className="btn-small btn-small--primary" onClick={() => setCreating(true)}>
            + New product
          </button>
          <input
            className="search"
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
          placeholder="Search products..." dir="auto"
          />
        </div>
      </div>

      {creating && (
        <NewProductForm
          occasions={occasions}
          onCreated={product => {
            setProducts([...products, product])
            setCreating(false)
            setError('')
          }}
          onCancel={() => setCreating(false)}
          onError={handleError}
        />
      )}

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
                <ProductCard
                  key={product.id}
                  product={product}
                  materials={materials}
                  onChange={replaceProduct}
                  onDeleted={id => setProducts(products.filter(p => p.id !== id))}
                  onError={handleError}
                />
              ))}
          </div>
        </div>
      ))}
    </section>
  )
}

export default ProductsPage
