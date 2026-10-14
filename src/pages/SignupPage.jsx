import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate, Link } from 'react-router-dom'
import { APP_NAME } from '../config'

export default function SignupPage() {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [role, setRole] = useState('shop')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignup(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    // 1. Create the auth account
    const { data, error: signupError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (signupError) {
      setError(signupError.message)
      setLoading(false)
      return
    }

    // 2. Save the role and name to the profiles table
    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      full_name: fullName,
      role: role,
    })

    if (profileError) {
      setError(profileError.message)
      setLoading(false)
      return
    }

    setSuccess('Account created successfully! Redirecting...')

    // 3. Redirect based on role
    setTimeout(() => {
      if (role === 'supplier') {
        navigate('/supplier/dashboard')
      } else {
        navigate('/shop/dashboard')
      }
    }, 1000)
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.logo}>{APP_NAME}</h1>
          <p style={styles.tagline}>Order stock from suppliers, simply.</p>
        </div>

        <form onSubmit={handleSignup} style={styles.form}>
          <div style={styles.fieldGroup}>
            <label htmlFor="signup-name" style={styles.label}>
              Full Name
            </label>
            <input
              id="signup-name"
              style={styles.input}
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              placeholder="Your name"
              autoComplete="name"
            />
          </div>

          <div style={styles.fieldGroup}>
            <label htmlFor="signup-email" style={styles.label}>
              Email
            </label>
            <input
              id="signup-email"
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
            <label htmlFor="signup-password" style={styles.label}>
              Password
            </label>
            <div style={styles.passwordWrapper}>
              <input
                id="signup-password"
                style={styles.passwordInput}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="At least 6 characters"
                minLength={6}
                autoComplete="new-password"
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

          <div style={styles.fieldGroup}>
            <span style={styles.label}>I am a...</span>
            <div style={styles.roleContainer}>
              <button
                type="button"
                onClick={() => setRole('shop')}
                style={{
                  ...styles.roleCard,
                  ...(role === 'shop' ? styles.roleCardSelected : {}),
                }}
              >
                <span style={styles.roleTitle}>I run a shop</span>
                <span style={styles.roleSub}>Buy stock for my store</span>
              </button>

              <button
                type="button"
                onClick={() => setRole('supplier')}
                style={{
                  ...styles.roleCard,
                  ...(role === 'supplier' ? styles.roleCardSelected : {}),
                }}
              >
                <span style={styles.roleTitle}>I'm a supplier</span>
                <span style={styles.roleSub}>Sell goods to shops</span>
              </button>
            </div>
          </div>

          {error && <p style={styles.error}>{error}</p>}
          {success && <p style={styles.success}>{success}</p>}

          <button
            style={{
              ...styles.button,
              ...(loading ? styles.buttonDisabled : {}),
            }}
            type="submit"
            disabled={loading}
          >
            {loading ? 'Please wait...' : 'Sign Up'}
          </button>
        </form>

        <p style={styles.footerText}>
          Already have an account?{' '}
          <Link to="/login" style={styles.link}>
            Log in
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
  roleContainer: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
  },
  roleCard: {
    minHeight: '68px',
    padding: '10px 8px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--card)',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    textAlign: 'center',
    transition: 'all 0.15s ease',
  },
  roleCardSelected: {
    border: '2px solid var(--amber)',
    backgroundColor: 'var(--amber-light)',
  },
  roleTitle: {
    fontSize: '15px',
    fontWeight: '700',
    color: 'var(--text)',
  },
  roleSub: {
    fontSize: '12px',
    color: 'var(--muted)',
  },
  error: {
    color: 'var(--error)',
    fontSize: '14px',
    fontWeight: '500',
    margin: '0',
    borderLeft: '3px solid var(--error)',
    paddingLeft: '8px',
  },
  success: {
    color: 'var(--success)',
    fontSize: '14px',
    fontWeight: '500',
    margin: '0',
    borderLeft: '3px solid var(--success)',
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
