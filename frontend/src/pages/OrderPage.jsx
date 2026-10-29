import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchCatalog, fetchZones, placeOrder } from '../api'
import PageHeader from '../components/PageHeader'
import { cleanWholeNumber } from '../numberInput'
import { formatMoney } from '../orderStatus'
import '../order.css'

const GOVERNORATES = [
  'ريف دمشق', 'حلب', 'حمص', 'حماة', 'اللاذقية', 'طرطوس', 'إدلب',
  'دير الزور', 'الرقة', 'الحسكة', 'درعا', 'السويداء', 'القنيطرة',
]

let nextKey = 1
function newItem(product) {
  return {
    key: nextKey++,
    product_id: product ? product.id : '',
    size_id: product ? product.sizes[0].id : '',
    quantity: product?.kind === 'favor' ? 20 : 1,
    colors: '',
    custom_text: '',
  }
}

function addDays(days) {
  const day = new Date()
  day.setDate(day.getDate() + days)
  return day.toLocaleDateString('en-CA') // YYYY-MM-DD in local time
}

function ItemRow({ item, products, index, canRemove, onChange, onRemove }) {
  const product = products.find(p => p.id === Number(item.product_id))
  const size = product?.sizes.find(s => s.id === Number(item.size_id))

  function chooseProduct(productId) {
    const chosen = products.find(p => p.id === Number(productId))
    onChange({ ...item, product_id: productId, size_id: chosen ? chosen.sizes[0].id : '' })
  }

  return (
    <div className="order-item">
      <div className="order-item__head">
        {product?.images[0] && <img src={product.images[0]} alt="" className="order-item__image" />}
        <h3>القطعة {index + 1}</h3>
        {canRemove && (
          <button type="button" className="link-button" onClick={onRemove}>
            إزالة
          </button>
        )}
      </div>

      <div className="form-grid">
        <label className="form-field form-field--wide">
          <span>القطعة *</span>
          <select value={item.product_id} onChange={e => chooseProduct(e.target.value)} required>
            <option value="">اختاري قطعة...</option>
            <optgroup label="توزيعات">
              {products.filter(p => p.kind === 'favor').map(p => (
                <option key={p.id} value={p.id}>{p.name_ar}</option>
              ))}
            </optgroup>
            <optgroup label="هدايا">
              {products.filter(p => p.kind === 'gift').map(p => (
                <option key={p.id} value={p.id}>{p.name_ar}</option>
              ))}
            </optgroup>
          </select>
        </label>

        {product && product.sizes.length > 1 && (
          <label className="form-field">
            <span>الحجم *</span>
            <select value={item.size_id} onChange={e => onChange({ ...item, size_id: e.target.value })} required>
              {product.sizes.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name_ar}{s.price ? ` · ${formatMoney(s.price)}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="form-field">
          <span>العدد *</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={item.quantity}
            onChange={e => onChange({ ...item, quantity: cleanWholeNumber(e.target.value, 4) })}
            required
          />
        </label>

        <label className="form-field">
          <span>الألوان *</span>
          <input
            value={item.colors}
            onChange={e => onChange({ ...item, colors: e.target.value })}
            placeholder="مثلاً: زهري وأبيض"
            maxLength={200}
            required
          />
        </label>

        <label className="form-field">
          <span>الاسم أو العبارة *</span>
          <input
            value={item.custom_text}
            onChange={e => onChange({ ...item, custom_text: e.target.value })}
            placeholder="مثلاً: Lara 2026"
            maxLength={200}
            required
          />
        </label>
      </div>

      {size && (
        <p className="order-item__price">
          {size.price
            ? `${formatMoney(size.price)} للقطعة · ${formatMoney(size.price * (Number(item.quantity) || 0))}`
            : 'السعر بيتأكد بعد مراجعة الطلب'}
        </p>
      )}
    </div>
  )
}

function OrderPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [products, setProducts] = useState([])
  const [zones, setZones] = useState([])
  const [loadState, setLoadState] = useState('loading')

  const [items, setItems] = useState([])
  const [form, setForm] = useState({
    name: '', phone: '', instagram: '', event_date: '',
    delivery_method: 'damascus', zone_id: '', governorate: '', address: '', notes: '', website: '',
  })
  const [image, setImage] = useState(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    Promise.all([fetchCatalog(), fetchZones()])
      .then(([catalog, zoneList]) => {
        setProducts(catalog.products)
        setZones(zoneList)
        const preselected = catalog.products.find(p => p.id === Number(searchParams.get('product')))
        setItems([newItem(preselected)])
        if (zoneList.length === 0) setForm(f => ({ ...f, delivery_method: 'governorate' }))
        setLoadState('ready')
      })
      .catch(() => setLoadState('error'))
  }, [searchParams])

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  const chosenSizes = items
    .map(item => products.find(p => p.id === Number(item.product_id))?.sizes.find(s => s.id === Number(item.size_id)))
    .filter(Boolean)

  // Earliest allowed event date: the longest preparation time among the chosen pieces (BR-9).
  const leadDays = Math.max(0, ...chosenSizes.map(s => s.min_lead_days))
  const minDate = addDays(leadDays)

  const zone = zones.find(z => z.id === Number(form.zone_id))
  const deliveryFee = form.delivery_method === 'damascus' && zone ? Number(zone.fee) : 0
  const totals = useMemo(() => {
    let sum = 0
    items.forEach(item => {
      const size = products.find(p => p.id === Number(item.product_id))?.sizes.find(s => s.id === Number(item.size_id))
      if (!size) return
      if (size.price !== null) sum += Number(size.price) * (Number(item.quantity) || 0)
    })
    return { sum }
  }, [items, products])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (form.event_date && form.event_date < minDate) {
      setError(`أقرب تاريخ ممكن لهالطلب هو ${minDate}`)
      return
    }
    const payload = {
      ...form,
      zone_id: form.delivery_method === 'damascus' ? Number(form.zone_id) : null,
      items: items.map(({ product_id, size_id, quantity, colors, custom_text }) => ({
        product_id: Number(product_id),
        size_id: Number(size_id),
        quantity: Number(quantity),
        colors,
        custom_text,
      })),
    }
    const data = new FormData()
    data.append('order', JSON.stringify(payload))
    if (image) data.append('reference_image', image)
    data.append('website', form.website)

    setSubmitting(true)
    try {
      const order = await placeOrder(data)
      navigate(`/track/${order.code}?new=1`)
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <div className="site">
      <PageHeader />
      <main className="container order-page">
        <h1 className="order-page__title">اطلبي من Deniz</h1>
        <p className="order-page__intro">
          عبّي التفاصيل، ورح نراجع طلبك ونتواصل معك لنأكده. الطلب ما بيعتبر مؤكد إلا بعد موافقتنا.
        </p>

        {loadState === 'loading' && <p className="status">عم نحمّل...</p>}
        {loadState === 'error' && <p className="status">صار في مشكلة بالتحميل، جربي بعد شوي 🙏</p>}

        {loadState === 'ready' && (
          <form className="order-form" onSubmit={handleSubmit}>
            <section className="order-section">
              <h2>القطع</h2>
              {items.map((item, index) => (
                <ItemRow
                  key={item.key}
                  item={item}
                  index={index}
                  products={products}
                  canRemove={items.length > 1}
                  onChange={updated => setItems(items.map(i => (i.key === item.key ? updated : i)))}
                  onRemove={() => setItems(items.filter(i => i.key !== item.key))}
                />
              ))}
              {items.length < 20 && (
                <button type="button" className="btn btn--ghost" onClick={() => setItems([...items, newItem()])}>
                  + إضافة قطعة تانية
                </button>
              )}
            </section>

            <section className="order-section">
              <h2>المناسبة</h2>
              <div className="form-grid">
                <label className="form-field">
                  <span>تاريخ المناسبة *</span>
                  <input type="date" min={minDate} value={form.event_date} onChange={e => update('event_date', e.target.value)} required />
                  <small>
                    {leadDays >= 14
                      ? 'التوزيعات بتحتاج 14 يوم على الأقل للتحضير'
                      : `هالطلب بيحتاج ${leadDays} أيام على الأقل للتحضير`}
                  </small>
                </label>
              </div>
            </section>

            <section className="order-section">
              <h2>الاستلام</h2>
              <div className="choice-row">
                <label className={form.delivery_method === 'damascus' ? 'choice choice--on' : 'choice'}>
                  <input
                    type="radio"
                    name="delivery"
                    checked={form.delivery_method === 'damascus'}
                    onChange={() => update('delivery_method', 'damascus')}
                    disabled={zones.length === 0}
                  />
                  توصيل داخل دمشق
                </label>
                <label className={form.delivery_method === 'governorate' ? 'choice choice--on' : 'choice'}>
                  <input
                    type="radio"
                    name="delivery"
                    checked={form.delivery_method === 'governorate'}
                    onChange={() => update('delivery_method', 'governorate')}
                  />
                  شحن للمحافظات
                </label>
              </div>
              {zones.length === 0 && <p className="hint">التوصيل داخل دمشق غير متاح من الموقع حالياً.</p>}

              <div className="form-grid">
                {form.delivery_method === 'damascus' ? (
                  <label className="form-field">
                    <span>المنطقة *</span>
                    <select value={form.zone_id} onChange={e => update('zone_id', e.target.value)} required>
                      <option value="">اختاري منطقتك...</option>
                      {zones.map(z => (
                        <option key={z.id} value={z.id}>{z.name_ar} · {formatMoney(z.fee)}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="form-field">
                    <span>المحافظة *</span>
                    <select value={form.governorate} onChange={e => update('governorate', e.target.value)} required>
                      <option value="">اختاري المحافظة...</option>
                      {GOVERNORATES.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </label>
                )}
                <label className="form-field form-field--wide">
                  <span>العنوان *</span>
                  <input value={form.address} onChange={e => update('address', e.target.value)} maxLength={300} placeholder="الحي، الشارع، أقرب نقطة دالة" required />
                </label>
              </div>
              {form.delivery_method === 'governorate' && (
                <p className="hint">
                  📦 الشحن عن طريق شركة القدموس. أجرة الشحن بتدفعيها للشركة عند الاستلام، ولازم تحويل المبلغ كامل قبل الشحن.
                </p>
              )}
            </section>

            <section className="order-section">
              <h2>معلوماتك</h2>
              <div className="form-grid">
                <label className="form-field">
                  <span>الاسم *</span>
                  <input value={form.name} onChange={e => update('name', e.target.value)} maxLength={100} autoComplete="name" required />
                </label>
                <label className="form-field">
                  <span>رقم الموبايل *</span>
                  <input type="tel" dir="ltr" value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="09xx xxx xxx" autoComplete="tel" required />
                </label>
                <label className="form-field">
                  <span>حساب الإنستغرام (اختياري)</span>
                  <input dir="ltr" value={form.instagram} onChange={e => update('instagram', e.target.value)} placeholder="@username" />
                </label>
              </div>
            </section>

            <section className="order-section">
              <h2>تفاصيل إضافية</h2>
              <div className="form-grid">
                <label className="form-field form-field--wide">
                  <span>صورة مرجعية (اختياري)</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setImage(e.target.files[0] || null)} />
                  <small>صورة للشكل أو الألوان اللي بدك ياهن (حتى 10MB)</small>
                </label>
                <label className="form-field form-field--wide">
                  <span>ملاحظات (اختياري)</span>
                  <textarea rows={4} value={form.notes} onChange={e => update('notes', e.target.value)} maxLength={2000} />
                </label>
              </div>
              {/* Hidden from people; bots that fill it in get rejected (spam protection). */}
              <input
                className="honeypot"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={form.website}
                onChange={e => update('website', e.target.value)}
              />
            </section>

            <section className="order-summary">
              <div><span>القطع</span><strong>{formatMoney(totals.sum)}</strong></div>
              {form.delivery_method === 'damascus' && (
                <div><span>التوصيل</span><strong>{zone ? formatMoney(zone.fee) : '—'}</strong></div>
              )}
              <div className="order-summary__total">
                <span>المجموع</span>
                <strong>{formatMoney(totals.sum + deliveryFee)}</strong>
              </div>

              {error && <p className="order-error" role="alert">{error}</p>}
              <button type="submit" className="btn btn--primary order-submit" disabled={submitting}>
                {submitting ? 'عم نبعت الطلب...' : 'إرسال الطلب'}
              </button>
            </section>
          </form>
        )}
      </main>
    </div>
  )
}

export default OrderPage
