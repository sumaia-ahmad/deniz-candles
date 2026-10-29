import { useCallback, useEffect, useState } from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import logo from '../assets/logo.png'
import { adminApi } from './adminApi'
import LoginPage from './LoginPage'
import OrderDetailPage from './OrderDetailPage'
import OrdersPage from './OrdersPage'
import ProductsPage from './ProductsPage'
import SettingsPage from './SettingsPage'
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
          <NavLink to="/admin/orders">Orders</NavLink>
          {isAdmin && <NavLink to="/admin/products">Products & Prices</NavLink>}
          {isAdmin && <NavLink to="/admin/zones">Delivery Zones</NavLink>}
          {isAdmin && <NavLink to="/admin/settings">Settings</NavLink>}
        </nav>
        <div className="admin-header__user">
          <span>{user.username}</span>
          <button type="button" className="admin-link" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <main className="admin-main">
        <Routes>
          <Route index element={<Navigate to="orders" replace />} />
          <Route path="orders" element={<OrdersPage onSessionEnded={handleSessionEnded} />} />
          <Route path="orders/:orderId" element={<OrderDetailPage isAdmin={isAdmin} onSessionEnded={handleSessionEnded} />} />
          {isAdmin && <Route path="products" element={<ProductsPage onSessionEnded={handleSessionEnded} />} />}
          {isAdmin && <Route path="zones" element={<ZonesPage onSessionEnded={handleSessionEnded} />} />}
          {isAdmin && <Route path="settings" element={<SettingsPage onSessionEnded={handleSessionEnded} />} />}
          <Route path="*" element={<Navigate to="orders" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default AdminApp
