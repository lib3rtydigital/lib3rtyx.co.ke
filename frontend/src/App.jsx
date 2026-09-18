import { ClerkLoaded, Show, SignIn, UserButton, useAuth } from '@clerk/react';
import { useEffect, useState } from 'react';
import './App.css';

function CheckoutReturn() {
  const { getToken } = useAuth();
    const reference = new URLSearchParams(window.location.search).get('trxref')
      || new URLSearchParams(window.location.search).get('reference');
    const [state, setState] = useState(reference ? 'Verifying your payment...' : 'No Paystack payment reference was found.');

  useEffect(() => {
    if (!reference) {
      return;
    }

    let active = true;
    void (async () => {
      const token = await getToken();
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(
        `${apiUrl}/api/checkout/verify?reference=${encodeURIComponent(reference)}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      const result = await response.json();
      if (active)
        setState(
          response.ok && result.paid
            ? 'Payment successful.'
            : result.error || 'Payment could not be verified.'
        );
    })().catch(() => {
      if (active) setState('Payment verification failed. Please contact support.');
    });

    return () => {
      active = false;
    };
  }, [getToken, reference]);

  return <h1>{state}</h1>;
}

function App() {
  if (window.location.pathname === '/checkout/return') {
    return <CheckoutReturn />;
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f7ff',
        color: '#111827',
        fontFamily: 'system-ui',
        padding: '24px',
      }}
    >
      <ClerkLoaded>
        <Show when="signed-out">
          <div
            style={{
              width: '100%',
              maxWidth: '480px',
              padding: '24px',
              borderRadius: '24px',
              border: '1px solid rgba(15, 23, 42, 0.08)',
              background: '#ffffff',
              boxShadow: '0 24px 60px rgba(15, 23, 42, 0.08)',
            }}
          >
            <SignIn
              appearance={{
                elements: {
                  rootBox: 'w-full',
                  card: 'shadow-none',
                },
              }}
            />
          </div>
        </Show>

        <Show when="signed-in">
          <div
            style={{
              textAlign: 'center',
              width: '100%',
              maxWidth: '480px',
            }}
          >
            <h1>Welcome!</h1>
            <UserButton />
          </div>
        </Show>
      </ClerkLoaded>
    </div>
  );
}

export default App;
