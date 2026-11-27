
import { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './services/api';
import './AuthGate.css';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

function AuthGate({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restoreSession = async () => {
      const token = getToken();

      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await api.getMe();
        setUser(response.user);
      } catch (error) {
        console.error('Session restoration failed:', error.message);
        setToken(null);
      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, []);

  const handleLogin = async (credentials) => {
    const response = await api.login(credentials);
    setToken(response.token);
    setUser(response.user);
  };

  const handleRegister = async (userData) => {
    const response = await api.register(userData);
    setToken(response.token);
    setUser(response.user);
  };

  const handleUpdateUser = async (userData) => {
    const response = await api.updateMe(userData);
    setUser(response.user);
    return response.user;
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (error) {
      console.error('Logout request failed:', error.message);
    } finally {
      setToken(null);
      setUser(null);
    }
  };

  if (loading) {
    return (
      <div className="auth-loading">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p>Loading FairSplit...</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        updateUser: handleUpdateUser,
        logout: handleLogout,
      }}
    >
      {user ? (
        children
      ) : (
        <AuthScreen
          onLogin={handleLogin}
          onRegister={handleRegister}
        />
      )}
    </AuthContext.Provider>
  );
}

function AuthScreen({ onLogin, onRegister }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isRegister = mode === 'register';

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (isRegister && !name.trim()) {
      setError('Please enter your name.');
      return;
    }

    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    if (isRegister && password.length < 8) {
      setError('Password must contain at least 8 characters.');
      return;
    }

    setSubmitting(true);

    try {
      if (isRegister) {
        await onRegister({
          name: name.trim(),
          email: email.trim(),
          password,
        });
      } else {
        await onLogin({
          email: email.trim(),
          password,
        });
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError('');
    setPassword('');
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-icon">
            <i className="bi bi-wallet2"></i>
          </div>
          <span>FairSplit</span>
        </div>

        <div className="auth-heading">
          <h2>{isRegister ? 'Create your account' : 'Welcome back!'}</h2>
          <p>
            {isRegister
              ? 'Start managing shared expenses with ease.'
              : 'Sign in to manage your shared expenses.'}
          </p>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={!isRegister ? 'active' : ''}
            onClick={() => switchMode('login')}
          >
            Login
          </button>

          <button
            type="button"
            className={isRegister ? 'active' : ''}
            onClick={() => switchMode('register')}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div className="auth-field">
              <label htmlFor="auth-name">Full name</label>
              <input
                id="auth-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Enter your full name"
                autoComplete="name"
                required
              />
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="auth-email">Email address</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={isRegister ? 'At least 8 characters' : 'Enter your password'}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              required
              minLength={isRegister ? 8 : undefined}
            />
          </div>

          {error && (
            <div className="auth-error" role="alert">
              <i className="bi bi-exclamation-circle me-2"></i>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="auth-submit"
            disabled={submitting}
          >
            {submitting
              ? 'Please wait...'
              : isRegister
                ? 'Create Account'
                : 'Login'}
            {!submitting && (
              <i className="bi bi-arrow-right ms-2"></i>
            )}
          </button>
        </form>

        <p className="auth-footer">
          {isRegister
            ? 'Already have an account?'
            : "Don't have an account?"}{' '}
          <button
            type="button"
            onClick={() => switchMode(isRegister ? 'login' : 'register')}
          >
            {isRegister ? 'Login' : 'Register'}
          </button>
        </p>
      </div>
    </div>
  );
}

export default AuthGate;
