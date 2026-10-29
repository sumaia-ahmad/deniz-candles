import { Link } from 'react-router-dom'
import logo from '../assets/logo.png'

// Slim header for the inner pages (order form, tracking).
function PageHeader() {
  return (
    <header className="header">
      <div className="container header__inner">
        <Link to="/" className="brand">
          <img src={logo} alt="Deniz Studio" className="brand__logo" />
          <span className="brand__name">Deniz Studio</span>
        </Link>
        <nav className="nav">
          <Link to="/">الرئيسية</Link>
          <Link to="/track">تتبّع طلبك</Link>
        </nav>
      </div>
    </header>
  )
}

export default PageHeader
