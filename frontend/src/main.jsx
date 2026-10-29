import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import AdminApp from './admin/AdminApp.jsx'
import OrderPage from './pages/OrderPage.jsx'
import TrackPage from './pages/TrackPage.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/order" element={<OrderPage />} />
        <Route path="/track" element={<TrackPage />} />
        <Route path="/track/:code" element={<TrackPage />} />
        <Route path="/admin/*" element={<AdminApp />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
