import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate, Link } from 'react-router-dom'
import { APP_NAME } from '../config'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    // 1. Sign in with Supabase
    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (loginError) {
      setError('Wrong email or password. Please try again.')
      setLoading(false)
      return
    }

    // 2. Get the user's role from the profiles table
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single()

    if (profileError || !profile) {
      setError('Could not load your account. Please try again.')
      setLoading(false)
      return
    }

    // 3. Redirect based on role
    if (profile.role === 'supplier') {
      navigate('/supplier/dashboard')
    } else {
      navigate('/shop/dashboard')
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.logo}>{APP_NAME}</h1>
          <p style={styles.tagline}>Order stock from suppliers, simply.</p>
        </div>

        <form onSubmit={handleLogin} style={styles.form}>
          <div style={styles.fieldGroup}>
            <label htmlFor="login-email" style={styles.label}>
              Email
            </label>
            <input
              id="login-email"
              style={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div style={styles.fieldGroup}>
            <label htmlFor="login-password" style={styles.label}>
              Password
            </label>
            <div style={styles.passwordWrapper}>
              <input
                id="login-password"
                style={styles.passwordInput}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Your password"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={styles.toggleBtn}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <button
            style={{
              ...styles.button,
              ...(loading ? styles.buttonDisabled : {}),
            }}
            type="submit"
            disabled={loading}
          >
            {loading ? 'Please wait...' : 'Log In'}
          </button>
        </form>

        <p style={styles.footerText}>
          New here?{' '}
          <Link to="/signup" style={styles.link}>
            Create an account
          </Link>
        </p>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: 'var(--bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    boxSizing: 'border-box',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    backgroundColor: 'var(--card)',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
    boxSizing: 'border-box',
  },
  header: {
    textAlign: 'center',
    marginBottom: '24px',
  },
  logo: {
    color: 'var(--green)',
    fontSize: '28px',
    fontWeight: '700',
    letterSpacing: '-0.5px',
    margin: '0 0 6px',
  },
  tagline: {
    color: 'var(--muted)',
    fontSize: '15px',
    margin: 0,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '16px',
    fontWeight: '600',
    color: 'var(--text)',
  },
  input: {
    width: '100%',
    height: '48px',
    fontSize: '16px',
    padding: '0 14px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    backgroundColor: 'var(--card)',
    boxSizing: 'border-box',
    outline: 'none',
  },
  passwordWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    width: '100%',
  },
  passwordInput: {
    width: '100%',
    height: '48px',
    fontSize: '16px',
    padding: '0 64px 0 14px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    backgroundColor: 'var(--card)',
    boxSizing: 'border-box',
    outline: 'none',
  },
  toggleBtn: {
    position: 'absolute',
    right: '4px',
    top: '2px',
    bottom: '2px',
    minWidth: '56px',
    minHeight: '44px',
    background: 'none',
    border: 'none',
    color: 'var(--green)',
    fontWeight: '600',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '0 8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    color: 'var(--error)',
    fontSize: '14px',
    fontWeight: '500',
    margin: '0',
    borderLeft: '3px solid var(--error)',
    paddingLeft: '8px',
  },
  button: {
    width: '100%',
    height: '48px',
    backgroundColor: 'var(--green)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
    marginTop: '4px',
  },
  buttonDisabled: {
    backgroundColor: 'var(--muted)',
    cursor: 'not-allowed',
    opacity: 0.8,
  },
  footerText: {
    textAlign: 'center',
    marginTop: '20px',
    fontSize: '14px',
    color: 'var(--text)',
  },
  link: {
    color: 'var(--green)',
    fontWeight: '600',
    textDecoration: 'none',
    display: 'inline-block',
    padding: '4px 0',
  },
}
