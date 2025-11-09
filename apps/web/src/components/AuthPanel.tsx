import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import './AuthPanel.css'

export function AuthPanel() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const { login, register } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      if (isLogin) {
        await login(email, password)
      } else {
        await register(email, password, name)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  return (
    <div className="auth-panel">
      <h2>{isLogin ? 'Sign In' : 'Create Account'}</h2>
      <form onSubmit={handleSubmit}>
        {!isLogin && (
          <div className="form-group">
            <label htmlFor="name">Name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
        )}
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <div className="error">{error}</div>}
        <button type="submit" className="submit-btn">
          {isLogin ? 'Sign In' : 'Create Account'}
        </button>
      </form>
      <button className="toggle-btn" onClick={() => setIsLogin(!isLogin)}>
        {isLogin ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
      </button>
    </div>
  )
}
