import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDate, formatMoney, STATUS } from '../orderStatus'
import { adminApi } from './adminApi'

const PERIODS = [6, 12, 24]

function monthName(key) {
  return new Date(`${key}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function ReportsPage({ onSessionEnded }) {
  const [months, setMonths] = useState(12)
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    adminApi
      .reports(months)
      .then(data => active && setReport(data))
      .catch(err => (err.status === 401 ? onSessionEnded() : active && setError(err.message)))
    return () => {
      active = false
    }
  }, [months, onSessionEnded])

  if (report === null) return <p className="admin-status">{error || 'Loading reports...'}</p>

  const thisMonth = report.months.find(m => m.month === currentMonth())

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p className="page-head__hint">
            Sales count accepted orders (confirmed to delivered) in the month of their event, without delivery fees.
            Material cost comes from the stock each order used, so profit is known once preparation starts.
          </p>
        </div>
        <div className="segmented">
          {PERIODS.map(p => (
            <button key={p} type="button" className={months === p ? 'segmented__on' : ''} onClick={() => setMonths(p)}>
              {p} months
            </button>
          ))}
        </div>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="stat-cards">
        <div className="admin-card stat-card">
          <span>Sales this month</span>
          <strong>{formatMoney(thisMonth?.sales ?? 0)}</strong>
        </div>
        <div className="admin-card stat-card">
          <span>Gross profit this month</span>
          <strong>{formatMoney(thisMonth?.gross_profit ?? 0)}</strong>
        </div>
        <div className="admin-card stat-card">
          <span>Received this month</span>
          <strong>{formatMoney(thisMonth?.received ?? 0)}</strong>
        </div>
        <div className="admin-card stat-card">
          <span>Still owed by customers</span>
          <strong className={Number(report.receivables_total) > 0 ? 'warn-text' : ''}>
            {formatMoney(report.receivables_total)}
          </strong>
        </div>
      </div>

      <h2 className="report-title">Month by month</h2>
      <div className="admin-card table-wrap">
        <table className="admin-table report-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Orders</th>
              <th>Pieces</th>
              <th>Sales</th>
              <th>Material cost</th>
              <th>Gross profit</th>
              <th>Received</th>
              <th>Purchases</th>
            </tr>
          </thead>
          <tbody>
            {report.months.map(m => (
              <tr key={m.month} className={m.orders === 0 && m.received === '0.00' && m.purchases === '0.00' ? 'row-muted' : ''}>
                <td><strong>{monthName(m.month)}</strong></td>
                <td>{m.orders}</td>
                <td>{m.pieces}</td>
                <td>{formatMoney(m.sales)}</td>
                <td>{formatMoney(m.material_cost)}</td>
                <td className={Number(m.gross_profit) < 0 ? 'warn-text' : ''}>{formatMoney(m.gross_profit)}</td>
                <td>{formatMoney(m.received)}</td>
                <td>{formatMoney(m.purchases)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="report-grid">
        <div>
          <h2 className="report-title">Best sellers</h2>
          <div className="admin-card table-wrap">
            {report.top_products.length === 0 ? (
              <p className="muted">No sales in this period yet.</p>
            ) : (
              <table className="admin-table report-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Pieces</th>
                    <th>Orders</th>
                    <th>Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {report.top_products.map(p => (
                    <tr key={`${p.kind}-${p.name}`}>
                      <td dir="auto">{p.name}</td>
                      <td>{p.pieces}</td>
                      <td>{p.orders}</td>
                      <td>{formatMoney(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div>
          <h2 className="report-title">By occasion</h2>
          <div className="admin-card table-wrap">
            {report.by_category.length === 0 ? (
              <p className="muted">No sales in this period yet.</p>
            ) : (
              <table className="admin-table report-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Pieces</th>
                    <th>Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {report.by_category.map(c => (
                    <tr key={c.label}>
                      <td>{c.label}</td>
                      <td>{c.pieces}</td>
                      <td>{formatMoney(c.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <h2 className="report-title">Money still owed</h2>
      <div className="admin-card table-wrap">
        {report.receivables.length === 0 ? (
          <p className="muted">Every accepted order is fully paid. 🎉</p>
        ) : (
          <table className="admin-table report-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Event</th>
                <th>Status</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Remaining</th>
              </tr>
            </thead>
            <tbody>
              {report.receivables.map(o => (
                <tr key={o.id}>
                  <td><Link className="order-link" to={`/admin/orders/${o.id}`}>{o.code}</Link></td>
                  <td dir="auto">{o.customer}</td>
                  <td>{formatDate(o.event_date, 'en-GB')}</td>
                  <td><span className={`tag tag--${STATUS[o.status].tone}`}>{STATUS[o.status].en}</span></td>
                  <td>{formatMoney(o.total)}</td>
                  <td>
                    {formatMoney(o.paid)}
                    {Number(o.with_driver) > 0 && <span className="muted"> (+{formatMoney(o.with_driver)} with driver)</span>}
                  </td>
                  <td className="warn-text">{formatMoney(o.remaining)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

export default ReportsPage
