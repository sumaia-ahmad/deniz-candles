import { formatSyp, useSypRate } from '../currency'
import { formatMoney } from '../orderStatus'

// A dollar price with its Syrian pound equivalent underneath (when the admin has set a rate).
function Price({ usd, className = '' }) {
  const rate = useSypRate()
  const syp = formatSyp(usd, rate)
  return (
    <span className={`price ${className}`}>
      <span className="price__usd">{formatMoney(usd)}</span>
      {syp && <span className="price__syp">≈ {syp}</span>}
    </span>
  )
}

export default Price
