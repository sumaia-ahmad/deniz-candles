import { useCallback, useEffect, useState } from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import logo from '../assets/logo.png'
import { adminApi } from './adminApi'
import LoginPage from './LoginPage'
import ProductsPage from './ProductsPage'
import ZonesPage from './ZonesPage'
import './admin.css'

function AdminApp() {
  // undefined = still checking, null = signed out, object = signed-in user
  const [user, setUser] = useState(undefined)

  useEffect(() => {
    adminApi.me().then(setUser).catch(() => setUser(null))
  }, [])

  const handleSessionEnded = useCallback(() => setUser(null), [])

  async function handleLogout() {
    await adminApi.logout().catch(() => {})
    setUser(null)
  }

  if (user === undefined) return <p className="admin-status" dir="ltr">Checking your session...</p>
  if (user === null) return <LoginPage onLogin={setUser} />

  const isAdmin = user.role === 'admin'

  return (
    <div className="admin" dir="ltr" lang="en">
      <header className="admin-header">
        <div className="admin-header__brand">
          <img src={logo} alt="" />
          <span>Deniz Studio</span>
          <small>Dashboard</small>
        </div>
        <nav className="admin-nav">
          {isAdmin && <NavLink to="/admin/products">Products & Prices</NavLink>}
          {isAdmin && <NavLink to="/admin/zones">Delivery Zones</NavLink>}
        </nav>
        <div className="admin-header__user">
          <span>{user.username}</span>
          <button type="button" className="admin-link" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <main className="admin-main">
        {isAdmin ? (
          <Routes>
            <Route index element={<Navigate to="products" replace />} />
            <Route path="products" element={<ProductsPage onSessionEnded={handleSessionEnded} />} />
            <Route path="zones" element={<ZonesPage onSessionEnded={handleSessionEnded} />} />
            <Route path="*" element={<Navigate to="products" replace />} />
          </Routes>
        ) : (
          <p className="admin-status">Hi {user.username} 👋 The orders page is coming soon.</p>
        )}
      </main>
    </div>
  )
}

export default AdminApp
