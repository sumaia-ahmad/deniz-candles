import { useState } from 'react'
import logo from '../assets/logo.png'
import { adminApi } from './adminApi'

function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      onLogin(await adminApi.login(username, password, remember))
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login" dir="ltr" lang="en">
      <form className="login__box" onSubmit={handleSubmit}>
        <img src={logo} alt="Deniz Studio" className="login__logo" />
        <h1 className="login__title">Dashboard</h1>

        <label className="field">
          <span>Username</span>
          <input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        <label className="switch">
          <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
          <span>Keep me signed in for 30 days</span>
        </label>

        {error && <p className="form-error">{error}</p>}

        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

export default LoginPage
