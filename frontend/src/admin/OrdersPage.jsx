import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDate, formatMoney, STATUS } from '../orderStatus'
import { adminApi } from './adminApi'

const FILTERS = [
  { value: 'pending_review', label: 'To review' },
  { value: 'open', label: 'All open' },
  { value: '', label: 'All' },
]

function OrdersPage({ onSessionEnded }) {
  const [filter, setFilter] = useState('pending_review')
  const [result, setResult] = useState({ filter: null, orders: [] })
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    adminApi
      .orders(filter)
      .then(orders => active && setResult({ filter, orders }))
      .catch(err => (err.status === 401 ? onSessionEnded() : active && setError(err.message)))
    return () => {
      active = false
    }
  }, [filter, onSessionEnded])

  const loading = result.filter !== filter

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Orders</h1>
          <p className="page-head__hint">
            New online orders are requests. Review each one, then approve, reject, or propose changes.
          </p>
        </div>
      </div>

      <div className="filter-chips">
        {FILTERS.map(f => (
          <button
            key={f.value}
            type="button"
            className={filter === f.value ? 'chip-small chip-small--on' : 'chip-small'}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="form-error">{error}</p>}
      {loading && <p className="admin-status">Loading orders...</p>}
      {!loading && result.orders.length === 0 && <p className="admin-status">No orders here yet.</p>}

      {!loading && result.orders.length > 0 && (
        <div className="admin-card table-wrap">
          <table className="admin-table orders-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Event date</th>
                <th>Pieces</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {result.orders.map(order => (
                <tr key={order.id}>
                  <td>
                    <Link to={`/admin/orders/${order.id}`} className="order-link">{order.code}</Link>
                    <small className="muted"> · {formatDate(order.created_at, 'en-GB')}</small>
                  </td>
                  <td dir="auto">{order.customer_name}</td>
                  <td>
                    {formatDate(order.event_date, 'en-GB')}
                    <small className={order.days_left < 7 ? 'muted muted--warn' : 'muted'}> · {order.days_left} days</small>
                  </td>
                  <td>{order.piece_count}</td>
                  <td>{formatMoney(order.total) ?? '—'}</td>
                  <td><span className={`tag tag--${STATUS[order.status].tone}`}>{STATUS[order.status].en}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default OrdersPage
