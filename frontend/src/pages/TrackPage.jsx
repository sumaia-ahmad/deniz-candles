import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { fetchOrder, reportPayment, respondToChanges } from '../api'
import { cleanAmount } from '../numberInput'
import PageHeader from '../components/PageHeader'
import Price from '../components/Price'
import { useSiteSettings } from '../currency'
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
      <input dir="ltr" value={code} onChange={e => setCode(e.target.value)} placeholder="DZ-XXXXXXXX" aria-label="رمز الطلب" />
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

function TransferDetails({ details }) {
  if (!details) return <p className="transfer-box__fallback">سنتواصل معك لتزويدك بتفاصيل التحويل.</p>
  return (
    <div className="transfer-box">
      <span>معلومات التحويل</span>
      <p>{details}</p>
    </div>
  )
}

function ReportPayment({ order, suggestedAmount, onReported }) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(suggestedAmount ? String(Number(suggestedAmount)) : '')
  const [reference, setReference] = useState('')
  const [receipt, setReceipt] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!order.can_report_payment) return null
  if (!open) {
    return (
      <div className="report-cta">
        <p>يرجى إرفاق صورة الإشعار عند إتمام عملية التحويل.</p>
        <button type="button" className="btn btn--primary" onClick={() => setOpen(true)}>
          إرفاق صورة الإشعار
        </button>
      </div>
    )
  }

  async function submit(event) {
    event.preventDefault()
    const data = new FormData()
    data.append('amount', amount)
    data.append('transfer_number', reference)
    data.append('receipt', receipt)
    setBusy(true)
    setError('')
    try {
      onReported(await reportPayment(order.code, data))
      setOpen(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="report-form" onSubmit={submit}>
      <label className="form-field">
        <span>المبلغ المحوَّل ($) *</span>
        <input type="text" inputMode="decimal" dir="ltr" value={amount} onChange={e => setAmount(cleanAmount(e.target.value))} required />
      </label>
      <label className="form-field">
        <span>رقم العملية (اختياري)</span>
        <input dir="ltr" value={reference} onChange={e => setReference(e.target.value)} maxLength={60} />
      </label>
      <label className="form-field">
        <span>صورة الإشعار *</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setReceipt(e.target.files[0] || null)} required />
      </label>
      {error && <p className="order-error">{error}</p>}
      <div className="proposal__actions">
        <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'جارٍ الإرسال...' : 'إرسال الإشعار'}</button>
        <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>إلغاء</button>
      </div>
    </form>
  )
}

const REPORT_STATUS = {
  reported: { text: 'تم استلام الإشعار، وجارٍ التحقق منه ⏳', tone: 'wait' },
  received: { text: 'تم تأكيد الدفعة ✓', tone: 'ok' },
  rejected: { text: 'تعذّر تأكيد هذه الدفعة', tone: 'bad' },
}

function PaymentReports({ reports }) {
  if (!reports.length) return null
  return (
    <ul className="report-list">
      {reports.map((report, index) => (
        <li key={index} className={`report-list__item report-list__item--${REPORT_STATUS[report.status]?.tone}`}>
          <span>
            إشعار بقيمة <strong dir="ltr">{formatMoney(report.amount)}</strong>: {REPORT_STATUS[report.status]?.text}
          </span>
          {report.reason && <small>السبب: {report.reason}</small>}
        </li>
      ))}
    </ul>
  )
}

function OrderView({ order, onChange }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { transfer_details: transferDetails } = useSiteSettings()

  const depositPaid = order.deposit_required && Number(order.paid) >= Number(order.deposit_required)
  const waitingForDeposit = order.status === 'awaiting_deposit' && !depositPaid
  // Governorate orders are paid in full by transfer before shipping (BR-4).
  const fullPaymentDue =
    order.delivery_method === 'governorate' &&
    ['approved', 'confirmed', 'in_progress', 'ready'].includes(order.status) &&
    order.remaining !== null &&
    Number(order.remaining) > 0

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
          <p>أهلاً {order.customer_name} 🤍</p>
        </div>
        <span className={`status-pill status-pill--${STATUS[order.status].tone}`}>{STATUS[order.status].ar}</span>
      </div>

      <Progress status={order.status} />

      {order.status === 'pending_review' && (
        <p className="track-note">تم استلام طلبك، وهو قيد المراجعة. سنتواصل معك قريباً لتأكيده.</p>
      )}
      {waitingForDeposit && (
        <div className="track-note">
          <p>
            تمت الموافقة على طلبك 🎉 ولتثبيته يُرجى دفع عربون
            {order.deposit_required && <> بقيمة <strong dir="ltr">{formatMoney(order.deposit_required)}</strong></>}.
          </p>
          <TransferDetails details={transferDetails} />
          <ReportPayment
            order={order}
            suggestedAmount={Math.max(0, Number(order.deposit_required) - Number(order.paid))}
            onReported={onChange}
          />
        </div>
      )}
      {order.status === 'awaiting_deposit' && depositPaid && (
        <p className="track-note">تم استلام العربون، شكراً لك 🤍 سيتم تأكيد طلبك قريباً.</p>
      )}
      {fullPaymentDue && (
        <div className="track-note">
          <p>
            يتم الشحن إلى المحافظات بعد تحويل كامل المبلغ
            {' '}(<strong dir="ltr">{formatMoney(order.remaining)}</strong>).
          </p>
          <TransferDetails details={transferDetails} />
          <ReportPayment order={order} suggestedAmount={order.remaining} onReported={onChange} />
        </div>
      )}
      <PaymentReports reports={order.payment_reports} />
      {order.status === 'rejected' && order.admin_message && (
        <p className="track-note track-note--sad">نعتذر، تعذّر قبول هذا الطلب: {order.admin_message}</p>
      )}

      {order.status === 'changes_proposed' && (
        <div className="proposal">
          <h3>لدينا اقتراح تعديل على طلبك</h3>
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
              <td>{item.unit_price ? <Price usd={item.unit_price * item.quantity} /> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="order-summary order-summary--flat">
        {order.delivery_method === 'damascus' && (
          <div><span>التوصيل</span><strong><Price usd={order.delivery_fee} /></strong></div>
        )}
        <div className="order-summary__total">
          <span>المجموع</span>
          <strong>{order.total ? <Price usd={order.total} /> : 'يُحدَّد بعد المراجعة'}</strong>
        </div>
        {order.deposit_required && !['rejected', 'cancelled'].includes(order.status) && (
          <div className="deposit-line">
            <span>العربون المطلوب</span>
            <strong>
              <Price usd={order.deposit_required} />
              <small className={Number(order.paid) >= Number(order.deposit_required) ? 'deposit-ok' : 'deposit-due'}>
                {Number(order.paid) >= Number(order.deposit_required) ? 'تم استلام العربون ✓' : 'لم يُستلم بعد'}
              </small>
            </strong>
          </div>
        )}
        {Number(order.paid) > 0 && (
          <>
            <div><span>المدفوع</span><strong><Price usd={order.paid} /></strong></div>
            {order.remaining !== null && (
              <div><span>الباقي</span><strong><Price usd={order.remaining} /></strong></div>
            )}
          </>
        )}
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
              يرجى الاحتفاظ برمز الطلب <strong dir="ltr">{order.code}</strong> أو برابط هذه الصفحة لمتابعة طلبك.
            </p>
          </div>
        )}

        <h1 className="order-page__title">تتبّع طلبك</h1>
        <CodeSearch initial={code || ''} />

        {state === 'loading' && <p className="status">جارٍ تحميل الطلب...</p>}
        {state === 'not-found' && <p className="status">لم نعثر على طلب بهذا الرمز. يرجى التحقق منه والمحاولة مجدداً.</p>}
        {state === 'error' && <p className="status">حدث خطأ، يرجى المحاولة لاحقاً.</p>}
        {state === 'ready' && <OrderView order={order} onChange={setOrder} />}
      </main>
    </div>
  )
}

export default TrackPage
