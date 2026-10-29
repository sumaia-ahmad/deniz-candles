import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatDate, formatMoney, STATUS } from '../orderStatus'
import { priceText, useSiteSettings } from '../currency'
import { cleanAmount } from '../numberInput'
import { adminApi } from './adminApi'

const ACTION_LABELS = {
  approved: 'Approve',
  changes_proposed: 'Propose changes',
  rejected: 'Reject',
  awaiting_deposit: 'Ask for deposit',
  confirmed: 'Mark confirmed',
  in_progress: 'Start preparing',
  ready: 'Mark ready',
  delivered: 'Mark delivered',
  cancelled: 'Cancel order',
}

// Ready-to-copy messages for the customer, in Arabic (FR-16d).
function customerMessage(order, rate, transferDetails) {
  const link = `${window.location.origin}/track/${order.code}`
  const hello = `أهلين ${order.customer_name} 🤍`
  const hasFavors = order.items.some(item => item.product_kind === 'favor')
  const deposit = order.deposit_required ? ` بقيمة ${priceText(order.deposit_required, rate)}` : ''
  const howToPay = transferDetails ? `\nمعلومات التحويل:\n${transferDetails}` : '\nرح نبعتلك تفاصيل التحويل.'
  switch (order.status) {
    case 'approved':
      return `${hello}\nتم قبول طلبك من Deniz Studio (رقم ${order.code}).${
        hasFavors || order.deposit_required ? `\nلتثبيت الطلب منحتاج عربون${deposit}.${howToPay}` : ''
      }\nفيكِ تتابعي طلبك من هون: ${link}`
    case 'awaiting_deposit':
      return `${hello}\nطلبك رقم ${order.code} مقبول 🎉 لتثبيته منحتاج عربون${deposit}.${howToPay}\n${link}`
    case 'changes_proposed':
      return `${hello}\nبخصوص طلبك رقم ${order.code}: ${order.admin_message}${
        order.proposed_event_date ? `\nالتاريخ المقترح: ${formatDate(order.proposed_event_date)}` : ''
      }\nفيكِ توافقي أو ترفضي التعديل من هون: ${link}`
    case 'rejected':
      return `${hello}\nللأسف ما منقدر ناخد طلبك رقم ${order.code}: ${order.admin_message}\nمنتمنى نخدمك بمناسبة تانية 🤍`
    case 'confirmed':
      return `${hello}\nتم تأكيد طلبك رقم ${order.code} ✨ رح نبلّش التحضير قريباً.\n${link}`
    case 'in_progress':
      return `${hello}\nبلّشنا تحضير طلبك رقم ${order.code} 🕯️\n${link}`
    case 'ready':
      return `${hello}\nطلبك رقم ${order.code} جاهز 🎀 رح نتواصل معك للتسليم.\n${link}`
    case 'delivered':
      return `${hello}\nشكراً لإنك اخترتِ Deniz Studio 🤍 منتمنى تكون مناسبتك حلوة.`
    case 'cancelled':
      return `${hello}\nتم إلغاء طلبك رقم ${order.code}. إذا حابة تطلبي من جديد نحنا بالخدمة 🤍`
    default:
      return `${hello}\nطلبك رقم ${order.code} وصلنا وعم نراجعه. فيكِ تتابعيه من هون: ${link}`
  }
}

function MessageBox({ order }) {
  const [copied, setCopied] = useState(false)
  const settings = useSiteSettings()
  const rate = settings.usd_to_syp ? Number(settings.usd_to_syp) : null
  const text = customerMessage(order, rate, settings.transfer_details)

  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="admin-card">
      <h3 className="card-title">Message for the customer</h3>
      <p className="page-head__hint">Copy it and send it on Instagram or WhatsApp.</p>
      <pre className="message-box" dir="rtl" lang="ar">{text}</pre>
      <button type="button" className="btn-small btn-small--primary" onClick={copy}>
        {copied ? 'Copied ✓' : 'Copy message'}
      </button>
    </div>
  )
}

function ActionPanel({ order, onUpdated, onError }) {
  const [mode, setMode] = useState(null) // 'rejected' | 'changes_proposed' while writing a message
  const [message, setMessage] = useState('')
  const [proposedDate, setProposedDate] = useState('')
  const [busy, setBusy] = useState(false)

  async function send(status, extra = {}) {
    setBusy(true)
    try {
      onUpdated(await adminApi.changeOrderStatus(order.id, { status, ...extra }))
      setMode(null)
      setMessage('')
      setProposedDate('')
    } catch (err) {
      // Payment rules only warn (BR-7): show the warning and let the admin decide.
      if (err.status === 409 && err.warnings) {
        const goAhead = window.confirm(`${err.warnings.join('\n')}\n\nContinue anyway?`)
        if (goAhead) {
          setBusy(false)
          return send(status, { ...extra, confirm: true })
        }
      } else {
        onError(err)
      }
    } finally {
      setBusy(false)
    }
  }

  function choose(status) {
    if (status === 'rejected' || status === 'changes_proposed') {
      setMode(status)
      return
    }
    if (status === 'cancelled' && !window.confirm('Cancel this order?')) return
    send(status)
  }

  if (order.next_statuses.length === 0) {
    return (
      <div className="admin-card">
        <h3 className="card-title">Actions</h3>
        <p className="page-head__hint">This order is closed.</p>
      </div>
    )
  }

  return (
    <div className="admin-card">
      <h3 className="card-title">Actions</h3>
      <div className="action-buttons">
        {order.next_statuses.map(status => (
          <button
            key={status}
            type="button"
            disabled={busy}
            className={
              status === 'rejected' || status === 'cancelled'
                ? 'btn-small btn-small--danger-outline'
                : status === 'changes_proposed'
                  ? 'btn-small'
                  : 'btn-small btn-small--primary'
            }
            onClick={() => choose(status)}
          >
            {ACTION_LABELS[status]}
          </button>
        ))}
      </div>

      {mode && (
        <form
          className="action-form"
          onSubmit={e => {
            e.preventDefault()
            send(mode, { message, proposed_event_date: mode === 'changes_proposed' ? proposedDate || null : undefined })
          }}
        >
          <label className="field">
            <span>{mode === 'rejected' ? 'Reason (shown to the customer)' : 'Proposed changes (shown to the customer)'}</span>
            <textarea
              rows={3}
              dir="auto"
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={mode === 'rejected' ? 'e.g. الأسبوع مليان بالطلبات' : 'e.g. بقدر خلّص 80 قطعة بدل 150'}
              required
            />
          </label>
          {mode === 'changes_proposed' && (
            <label className="field">
              <span>New event date (optional)</span>
              <input type="date" value={proposedDate} onChange={e => setProposedDate(e.target.value)} />
            </label>
          )}
          <div className="action-buttons">
            <button type="submit" className="btn-small btn-small--primary" disabled={busy}>
              {mode === 'rejected' ? 'Reject order' : 'Send proposal'}
            </button>
            <button type="button" className="btn-small" onClick={() => setMode(null)}>Back</button>
          </div>
        </form>
      )}
    </div>
  )
}

function WorkloadPanel({ order }) {
  const { workload } = order
  return (
    <div className="admin-card">
      <h3 className="card-title">Your week</h3>
      <p className="workload-big">
        <strong className={order.days_left < 7 ? 'warn-text' : ''}>{order.days_left}</strong> days until the event
      </p>
      <p className="page-head__hint">
        Week of {formatDate(workload.week_start, 'en-GB')}: {workload.orders.length} other open orders,{' '}
        <strong>{workload.pieces}</strong> pieces (+{order.piece_count} in this order).
      </p>
      {workload.orders.length > 0 && (
        <ul className="workload-list">
          {workload.orders.map(o => (
            <li key={o.id}>
              <Link to={`/admin/orders/${o.id}`} className="order-link">{o.code}</Link> · {formatDate(o.event_date, 'en-GB')} ·{' '}
              {o.pieces} pcs · {STATUS[o.status].en}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PaymentsPanel({ order, onUpdated, onError }) {
  const [deposit, setDeposit] = useState(order.deposit_required ?? '')
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ method: 'transfer', status: 'received', amount: '', transfer_number: '', is_deposit: false })
  const [receipt, setReceipt] = useState(null)
  const [busy, setBusy] = useState(false)

  const canCollectCash = order.delivery_method === 'damascus'
  const depositChanged = String(deposit) !== String(order.deposit_required ?? '')

  async function run(action) {
    setBusy(true)
    try {
      const updated = await action()
      onUpdated(updated)
      return updated
    } catch (err) {
      onError(err)
      return null
    } finally {
      setBusy(false)
    }
  }

  async function saveDeposit() {
    const updated = await run(() => adminApi.updateOrder(order.id, { deposit_required: deposit }))
    if (updated) setDeposit(updated.deposit_required ?? '')
  }

  async function addPayment(event) {
    event.preventDefault()
    const data = new FormData()
    Object.entries(form).forEach(([key, value]) => data.append(key, String(value)))
    if (receipt) data.append('receipt', receipt)
    const updated = await run(() => adminApi.addPayment(order.id, data))
    if (updated) {
      setAdding(false)
      setForm({ method: 'transfer', status: 'received', amount: '', transfer_number: '', is_deposit: false })
      setReceipt(null)
    }
  }

  return (
    <div className="admin-card">
      <h3 className="card-title">Payments</h3>

      <dl className="money-summary">
        <dt>Total</dt>
        <dd>{formatMoney(order.total) ?? '—'}</dd>
        <dt>Paid</dt>
        <dd className="ok-text">{formatMoney(order.paid)}</dd>
        {Number(order.with_driver) > 0 && (
          <>
            <dt>With driver</dt>
            <dd className="warn-text">{formatMoney(order.with_driver)}</dd>
          </>
        )}
        <dt>Remaining</dt>
        <dd><strong>{formatMoney(order.remaining) ?? '—'}</strong></dd>
      </dl>

      <div className="deposit-row">
        <span>Deposit required{order.has_favors ? '' : ' (optional for gifts)'}</span>
        <div className="money-input">
          <span>$</span>
          <input type="text" inputMode="decimal" value={deposit} onChange={e => setDeposit(cleanAmount(e.target.value))} placeholder="None" />
        </div>
        <button type="button" className="btn-small btn-small--primary" onClick={saveDeposit} disabled={!depositChanged || busy}>
          Save
        </button>
      </div>

      {order.payments.length > 0 && (
        <ul className="payment-list">
          {order.payments.map(p => (
            <li key={p.id}>
              <div>
                <strong>{formatMoney(p.amount)}</strong> · {p.method === 'transfer' ? 'Transfer' : 'Cash'}
                {p.is_deposit && <span className="tag tag--done">Deposit</span>}
                {p.status === 'with_driver' && <span className="tag tag--warn">With driver</span>}
                <small className="muted">
                  {' '}· {formatDate(p.created_at, 'en-GB')}
                  {p.transfer_number && ` · #${p.transfer_number}`}
                </small>
              </div>
              <div className="payment-list__actions">
                {p.receipt_url && (
                  <a href={p.receipt_url} target="_blank" rel="noreferrer" className="admin-link">Receipt</a>
                )}
                {p.status === 'with_driver' && (
                  <button type="button" className="btn-small btn-small--primary" disabled={busy} onClick={() => run(() => adminApi.markPaymentReceived(p.id))}>
                    Received
                  </button>
                )}
                <button
                  type="button"
                  className="admin-link admin-link--danger"
                  onClick={() => window.confirm('Delete this payment?') && run(() => adminApi.deletePayment(p.id))}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <form className="action-form" onSubmit={addPayment}>
          <div className="segmented">
            <button type="button" className={form.method === 'transfer' ? 'segmented__on' : ''} onClick={() => setForm({ ...form, method: 'transfer', status: 'received' })}>
              Transfer
            </button>
            <button type="button" className={form.method === 'cash' ? 'segmented__on' : ''} onClick={() => setForm({ ...form, method: 'cash' })}>
              Cash
            </button>
          </div>
          <label className="field">
            <span>Amount ($)</span>
            <input type="text" inputMode="decimal" autoComplete="off" value={form.amount} onChange={e => setForm({ ...form, amount: cleanAmount(e.target.value) })} required />
          </label>
          {form.method === 'transfer' ? (
            <>
              <label className="field">
                <span>Transfer reference from the customer (optional)</span>
                <input dir="ltr" value={form.transfer_number} onChange={e => setForm({ ...form, transfer_number: e.target.value })} />
              </label>
              <label className="field">
                <span>Receipt photo (optional)</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setReceipt(e.target.files[0] || null)} />
              </label>
            </>
          ) : (
            canCollectCash && (
              <label className="switch">
                <input type="checkbox" checked={form.status === 'with_driver'} onChange={e => setForm({ ...form, status: e.target.checked ? 'with_driver' : 'received' })} />
                <span>Still with the delivery driver</span>
              </label>
            )
          )}
          <label className="switch">
            <input type="checkbox" checked={form.is_deposit} onChange={e => setForm({ ...form, is_deposit: e.target.checked })} />
            <span>This is the deposit</span>
          </label>
          <div className="action-buttons">
            <button type="submit" className="btn-small btn-small--primary" disabled={busy}>Save payment</button>
            <button type="button" className="btn-small" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" className="admin-link" onClick={() => setAdding(true)}>+ Add payment</button>
      )}
    </div>
  )
}

function OrderDetailPage({ isAdmin, onSessionEnded }) {
  const { orderId } = useParams()
  const [result, setResult] = useState({ id: null })
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    adminApi
      .order(orderId)
      .then(order => active && setResult({ id: orderId, order }))
      .catch(err => (err.status === 401 ? onSessionEnded() : active && setResult({ id: orderId, failed: err.message })))
    return () => {
      active = false
    }
  }, [orderId, onSessionEnded])

  function handleError(err) {
    if (err.status === 401) onSessionEnded()
    else setError(err.message)
  }

  if (result.id !== orderId) return <p className="admin-status">Loading order...</p>
  if (result.failed) return <p className="admin-status">{result.failed}</p>
  const { order } = result
  const status = STATUS[order.status]

  return (
    <section>
      <Link to="/admin/orders" className="admin-link">← All orders</Link>
      <div className="page-head">
        <div>
          <h1>
            {order.code} <span className={`tag tag--${status.tone}`}>{status.en}</span>
          </h1>
          <p className="page-head__hint">Received {formatDate(order.created_at, 'en-GB')}</p>
        </div>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}{' '}
          <button type="button" className="admin-link" onClick={() => setError('')}>Dismiss</button>
        </p>
      )}

      <div className="order-layout">
        <div className="order-layout__main">
          <div className="admin-card">
            <h3 className="card-title">Items</h3>
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Product</th><th>Qty</th><th>Colors</th><th>Name / phrase</th><th>Price</th></tr>
                </thead>
                <tbody>
                  {order.items.map((item, index) => (
                    <tr key={index}>
                      <td dir="auto">
                        {item.product_name}
                        {item.size_name !== 'قياسي' && <small className="muted"> · {item.size_name}</small>}
                      </td>
                      <td>{item.quantity}</td>
                      <td dir="auto">{item.colors}</td>
                      <td dir="auto">{item.custom_text}</td>
                      <td>{item.unit_price ? formatMoney(item.unit_price * item.quantity) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="totals">
              {order.delivery_method === 'damascus' && <span>Delivery {formatMoney(order.delivery_fee)}</span>}
              <strong>Total {formatMoney(order.total) ?? '— (missing prices)'}</strong>
            </div>
          </div>

          <div className="admin-card">
            <h3 className="card-title">Notes from the customer</h3>
            <p dir="auto" className="notes">{order.notes || <span className="muted">No notes.</span>}</p>
            <h3 className="card-title">Reference image</h3>
            {order.reference_image_url ? (
              <a href={order.reference_image_url} target="_blank" rel="noreferrer">
                <img src={order.reference_image_url} alt="Reference" className="reference-image" />
              </a>
            ) : (
              <p className="muted">No image attached.</p>
            )}
          </div>

          {order.admin_message && (
            <div className="admin-card">
              <h3 className="card-title">Your last message</h3>
              <p dir="auto">{order.admin_message}</p>
              {order.proposed_event_date && <p>Proposed date: {formatDate(order.proposed_event_date, 'en-GB')}</p>}
            </div>
          )}
        </div>

        <aside className="order-layout__side">
          <ActionPanel
            order={order}
            onUpdated={updated => {
              setError('')
              setResult({ id: orderId, order: updated })
            }}
            onError={handleError}
          />
          {isAdmin && (
            <PaymentsPanel
              key={order.id}
              order={order}
              onUpdated={updated => {
                setError('')
                setResult({ id: orderId, order: updated })
              }}
              onError={handleError}
            />
          )}
          <MessageBox order={order} />
          <WorkloadPanel order={order} />

          <div className="admin-card">
            <h3 className="card-title">Customer</h3>
            <dl className="facts">
              <dt>Name</dt><dd dir="auto">{order.customer_name}</dd>
              <dt>Phone</dt><dd><a href={`tel:${order.customer_phone}`} dir="ltr">{order.customer_phone}</a></dd>
              {order.customer_instagram && (
                <>
                  <dt>Instagram</dt>
                  <dd>
                    <a href={`https://instagram.com/${order.customer_instagram}`} target="_blank" rel="noreferrer">
                      @{order.customer_instagram}
                    </a>
                  </dd>
                </>
              )}
              <dt>Event</dt><dd>{formatDate(order.event_date, 'en-GB')}</dd>
              <dt>Delivery</dt>
              <dd dir="auto">
                {order.delivery_method === 'damascus' ? `Damascus · ${order.zone_name}` : `Al-Qadmous · ${order.governorate}`}
              </dd>
              <dt>Address</dt><dd dir="auto">{order.address}</dd>
            </dl>
          </div>
        </aside>
      </div>
    </section>
  )
}

export default OrderDetailPage
