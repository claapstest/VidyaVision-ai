import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, Loader2, AlertCircle, Sparkles } from 'lucide-react';

export default function LoginPage({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!email.trim() || !password) {
      setError('Please enter both your work email and password.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim(), password })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'Invalid email or password. Please check your credentials.');
        return;
      }

      // Store JWT token locally for Authorization header fallback in addition to HTTP-only cookie
      if (data.token) {
        try {
          localStorage.setItem('vv_auth_token', data.token);
          localStorage.setItem('vv_user_profile', JSON.stringify(data.user));
        } catch (e) {
          console.warn('Could not save token to localStorage:', e);
        }
      }

      if (onLoginSuccess) {
        onLoginSuccess(data.user);
      }
    } catch (err) {
      console.error('Login request failed:', err);
      setError('Failed to reach authentication server. Please verify your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFillAdmin = () => {
    setEmail('admin@vidyavision.com');
    setPassword('VidyaVision@2026');
    setError('');
  };

  return (
    <div style={{
      minHeight: '100dvh',
      width: '100%',
      backgroundColor: '#f1f5f9',
      backgroundImage: `
        radial-gradient(at 0% 0%, rgba(27, 59, 111, 0.08) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(241, 101, 34, 0.08) 0px, transparent 50%),
        radial-gradient(at 50% 50%, rgba(16, 185, 129, 0.04) 0px, transparent 50%)
      `,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: "'Inter', sans-serif"
    }}>
      {/* Subtle ambient decorative blur circles */}
      <div style={{
        position: 'absolute',
        width: '420px',
        height: '420px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(27, 59, 111, 0.12) 0%, rgba(27, 59, 111, 0) 70%)',
        top: '-120px',
        left: '-120px',
        pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute',
        width: '380px',
        height: '380px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(241, 101, 34, 0.1) 0%, rgba(241, 101, 34, 0) 70%)',
        bottom: '-100px',
        right: '-100px',
        pointerEvents: 'none'
      }} />

      {/* Main Glassmorphic Login Card */}
      <div style={{
        maxWidth: '460px',
        width: '100%',
        backgroundColor: 'rgba(255, 255, 255, 0.94)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderRadius: '20px',
        border: '1px solid rgba(27, 59, 111, 0.12)',
        boxShadow: '0 20px 40px -15px rgba(27, 59, 111, 0.12), 0 0 1px 1px rgba(27, 59, 111, 0.05)',
        padding: '2.5rem 2.25rem',
        position: 'relative',
        zIndex: 10
      }}>
        {/* Top Accent Strip */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '4px',
          borderTopLeftRadius: '20px',
          borderTopRightRadius: '20px',
          background: 'linear-gradient(90deg, #1b3b6f 0%, #F16522 50%, #10b981 100%)'
        }} />

        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.85rem' }}>
          <div style={{ marginBottom: '0.85rem' }}>
            <img
              src="/vidyavision-logo.svg"
              alt="VidyaVision Logo"
              style={{
                height: '46px',
                width: 'auto',
                maxWidth: '220px',
                objectFit: 'contain',
                display: 'inline-block'
              }}
            />
          </div>

          <p style={{
            fontSize: '0.86rem',
            color: '#3b5278',
            fontWeight: '500',
            margin: '0 0 0.85rem 0'
          }}>
            AI Admission Telephony & Lead Intelligence
          </p>
        </div>

        {/* Error Notification */}
        {error && (
          <div style={{
            backgroundColor: 'rgba(244, 63, 94, 0.08)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            borderRadius: '10px',
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.65rem',
            animation: 'fadeIn 0.25s ease'
          }}>
            <AlertCircle size={18} style={{ color: '#f43f5e', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '0.82rem', color: '#be123c', fontWeight: '500', lineHeight: 1.45 }}>
              {error}
            </div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
          {/* Email Field */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '0.82rem',
              fontWeight: '600',
              color: '#1b3b6f',
              marginBottom: '0.4rem'
            }}>
              Work Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={17} style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b'
              }} />
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="counselor@vidyavision.com"
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem 0.75rem 2.4rem',
                  fontSize: '0.92rem',
                  backgroundColor: '#ffffff',
                  border: '1.5px solid rgba(27, 59, 111, 0.15)',
                  borderRadius: '10px',
                  color: '#1b3b6f',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => e.target.style.borderColor = '#F16522'}
                onBlur={(e) => e.target.style.borderColor = 'rgba(27, 59, 111, 0.15)'}
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <label style={{
                fontSize: '0.82rem',
                fontWeight: '600',
                color: '#1b3b6f'
              }}>
                Password
              </label>
            </div>
            <div style={{ position: 'relative' }}>
              <Lock size={17} style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b'
              }} />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                style={{
                  width: '100%',
                  padding: '0.75rem 2.6rem 0.75rem 2.4rem',
                  fontSize: '0.92rem',
                  backgroundColor: '#ffffff',
                  border: '1.5px solid rgba(27, 59, 111, 0.15)',
                  borderRadius: '10px',
                  color: '#1b3b6f',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => e.target.style.borderColor = '#F16522'}
                onBlur={(e) => e.target.style.borderColor = 'rgba(27, 59, 111, 0.15)'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(prev => !prev)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Sign In Button */}
          <button
            type="submit"
            disabled={isLoading}
            style={{
              marginTop: '0.5rem',
              width: '100%',
              padding: '0.85rem 1.5rem',
              backgroundColor: '#1b3b6f',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              fontSize: '0.95rem',
              fontWeight: '700',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 12px rgba(27, 59, 111, 0.25)',
              transition: 'all 0.2s ease',
              opacity: isLoading ? 0.75 : 1
            }}
            onMouseEnter={(e) => {
              if (!isLoading) {
                e.currentTarget.style.backgroundColor = '#152e56';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isLoading) {
                e.currentTarget.style.backgroundColor = '#1b3b6f';
                e.currentTarget.style.transform = 'translateY(0)';
              }
            }}
          >
            {isLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Verifying Credentials...</span>
              </>
            ) : (
              <span>Sign In to VidyaVision</span>
            )}
          </button>
        </form>

        {/* Quick Admin Demo Fill Pill for Fast Testing */}
        <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
          <button
            type="button"
            onClick={handleFillAdmin}
            style={{
              background: 'none',
              border: '1px dashed rgba(241, 101, 34, 0.4)',
              borderRadius: '6px',
              padding: '0.35rem 0.75rem',
              fontSize: '0.75rem',
              color: '#F16522',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              backgroundColor: 'rgba(241, 101, 34, 0.04)'
            }}
            title="Autofill default Super Admin credentials"
          >
            <Sparkles size={13} /> Fill Default Super-Admin Credentials
          </button>
        </div>

        {/* Divider */}
        <div style={{
          height: '1px',
          backgroundColor: 'rgba(27, 59, 111, 0.08)',
          margin: '1.5rem 0 1.25rem 0'
        }} />

        {/* Help Note at Bottom */}
        <p style={{
          fontSize: '0.78rem',
          color: '#64748b',
          textAlign: 'center',
          lineHeight: 1.5,
          margin: 0
        }}>
          Need an account or password reset? Contact your <b>VidyaVision Administrator</b>.
        </p>
      </div>
    </div>
  );
}
