import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { fetchOrder, respondToChanges } from '../api'
import PageHeader from '../components/PageHeader'
import { formatDate, formatMoney, STATUS, STEPS } from '../orderStatus'
import '../order.css'

function CodeSearch({ initial = '' }) {
  const [code, setCode] = useState(initial)
  const navigate = useNavigate()

  return (
    <form
      className="track-search"
      onSubmit={e => {
        e.preventDefault()
        if (code.trim()) navigate(`/track/${code.trim().toUpperCase()}`)
      }}
    >
      <input dir="ltr" value={code} onChange={e => setCode(e.target.value)} placeholder="DZ-XXXXXXXX" aria-label="كود الطلب" />
      <button type="submit" className="btn btn--primary">تتبّع</button>
    </form>
  )
}

function Progress({ status }) {
  if (status === 'rejected' || status === 'cancelled') return null
  const current = STEPS.indexOf(status === 'awaiting_deposit' ? 'approved' : status === 'changes_proposed' ? 'pending_review' : status)
  return (
    <ol className="progress">
      {STEPS.map((step, index) => (
        <li key={step} className={index <= current ? 'progress__step progress__step--done' : 'progress__step'}>
          <span className="progress__dot" />
          {STATUS[step].ar}
        </li>
      ))}
    </ol>
  )
}

function OrderView({ order, onChange }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function respond(accept) {
    setBusy(true)
    setError('')
    try {
      onChange(await respondToChanges(order.code, accept))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="track-card">
      <div className="track-card__head">
        <div>
          <p className="track-card__code" dir="ltr">{order.code}</p>
          <p>أهلين {order.customer_name} 🤍</p>
        </div>
        <span className={`status-pill status-pill--${STATUS[order.status].tone}`}>{STATUS[order.status].ar}</span>
      </div>

      <Progress status={order.status} />

      {order.status === 'pending_review' && (
        <p className="track-note">طلبك وصلنا، وعم نراجعه. رح نتواصل معك قريباً لنأكده.</p>
      )}
      {order.status === 'awaiting_deposit' && (
        <p className="track-note">طلبك مقبول 🎉 لتثبيته منحتاج عربون، ورح نتواصل معك بالتفاصيل.</p>
      )}
      {order.status === 'rejected' && order.admin_message && (
        <p className="track-note track-note--sad">للأسف ما قدرنا ناخد هالطلب: {order.admin_message}</p>
      )}

      {order.status === 'changes_proposed' && (
        <div className="proposal">
          <h3>عنا اقتراح تعديل على طلبك</h3>
          <p>{order.admin_message}</p>
          {order.proposed_event_date && (
            <p>التاريخ المقترح: <strong>{formatDate(order.proposed_event_date)}</strong></p>
          )}
          {error && <p className="order-error">{error}</p>}
          <div className="proposal__actions">
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => respond(true)}>
              موافقة على التعديل
            </button>
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => respond(false)}>
              رفض وإلغاء الطلب
            </button>
          </div>
        </div>
      )}

      <dl className="track-facts">
        <div><dt>تاريخ المناسبة</dt><dd>{formatDate(order.event_date)}</dd></div>
        <div>
          <dt>الاستلام</dt>
          <dd>{order.delivery_method === 'damascus' ? `توصيل إلى ${order.zone_name}` : `شحن إلى ${order.governorate} (القدموس)`}</dd>
        </div>
      </dl>

      <table className="track-items">
        <tbody>
          {order.items.map((item, index) => (
            <tr key={index}>
              <td>
                <strong>{item.product_name}</strong>
                {item.size_name !== 'قياسي' && ` · ${item.size_name}`}
                <small>{item.colors} · «{item.custom_text}»</small>
              </td>
              <td>× {item.quantity}</td>
              <td>{item.unit_price ? formatMoney(item.unit_price * item.quantity) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="order-summary order-summary--flat">
        {order.delivery_method === 'damascus' && (
          <div><span>التوصيل</span><strong>{formatMoney(order.delivery_fee)}</strong></div>
        )}
        <div className="order-summary__total">
          <span>المجموع</span>
          <strong>{order.total ? formatMoney(order.total) : 'بيتأكد بعد المراجعة'}</strong>
        </div>
      </div>
    </div>
  )
}

function TrackPage() {
  const { code } = useParams()
  const [searchParams] = useSearchParams()
  // The result remembers which code it belongs to, so a new code shows "loading" until it arrives.
  const [result, setResult] = useState({ code: null })

  useEffect(() => {
    if (!code) return
    let active = true
    fetchOrder(code)
      .then(order => active && setResult({ code, state: 'ready', order }))
      .catch(err => active && setResult({ code, state: err.status === 404 ? 'not-found' : 'error' }))
    return () => {
      active = false
    }
  }, [code])

  const state = !code ? 'idle' : result.code !== code ? 'loading' : result.state
  const order = result.order
  const setOrder = updated => setResult(r => ({ ...r, order: updated }))

  return (
    <div className="site">
      <PageHeader />
      <main className="container order-page">
        {searchParams.get('new') && state === 'ready' && (
          <div className="success-banner">
            <h2>تم إرسال طلبك 🎉</h2>
            <p>
              احفظي كود الطلب <strong dir="ltr">{order.code}</strong>، أو احفظي رابط هالصفحة، مشان تتابعي طلبك.
            </p>
          </div>
        )}

        <h1 className="order-page__title">تتبّع طلبك</h1>
        <CodeSearch initial={code || ''} />

        {state === 'loading' && <p className="status">عم نجيب طلبك...</p>}
        {state === 'not-found' && <p className="status">ما لقينا طلب بهالكود. تأكدي منه وجربي مرة تانية.</p>}
        {state === 'error' && <p className="status">صار في مشكلة، جربي بعد شوي 🙏</p>}
        {state === 'ready' && <OrderView order={order} onChange={setOrder} />}
      </main>
    </div>
  )
}

export default TrackPage
