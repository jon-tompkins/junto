'use client';

import { signIn } from 'next-auth/react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  message?: string;
}

export function AuthModal({ isOpen, onClose, message }: AuthModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative rounded-sm p-8 max-w-sm w-full mx-4 shadow-2xl" style={{ background: '#141210', border: '1px solid rgba(176,141,87,0.28)' }}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 transition"
          style={{ color: 'rgba(245,239,224,0.4)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#F5EFE0'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(245,239,224,0.4)'; }}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="text-center mb-6">
          <div className="text-2xl font-bold mb-1" style={{ fontFamily: 'var(--font-oswald)' }}>
            <span style={{ color: '#F5EFE0' }}>my</span>
            <span style={{ color: '#B08D57' }}>junto</span>
          </div>
          <p className="text-sm mt-3" style={{ color: 'rgba(245,239,224,0.5)' }}>
            {message || 'Sign in to subscribe to newsletters and create your own.'}
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => signIn('twitter', { callbackUrl: window.location.pathname })}
            className="w-full flex items-center justify-center gap-3 px-6 py-3 rounded-sm font-semibold transition uppercase tracking-wide"
            style={{ background: '#B08D57', color: '#080604', fontFamily: 'var(--font-oswald)' }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Continue with X
          </button>

          <button
            onClick={() => signIn('google', { callbackUrl: window.location.pathname })}
            className="w-full flex items-center justify-center gap-3 px-6 py-3 rounded-sm font-medium transition"
            style={{ background: '#1c1a17', color: 'rgba(245,239,224,0.8)', border: '1px solid rgba(176,141,87,0.28)' }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>
        </div>

        <p className="text-xs text-center mt-5" style={{ color: 'rgba(245,239,224,0.3)' }}>
          By signing in you agree to our terms of service.
        </p>
      </div>
    </div>
  );
}
