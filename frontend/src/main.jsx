import { ClerkProvider } from '@clerk/react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const root = createRoot(document.getElementById('root'));

if (!publishableKey) {
  console.error('VITE_CLERK_PUBLISHABLE_KEY environment variable is not set');
  root.render(
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f7ff',
        fontFamily: 'system-ui',
        padding: '24px',
      }}
    >
      <div
        style={{
          maxWidth: '520px',
          width: '100%',
          background: '#ffffff',
          borderRadius: '24px',
          border: '1px solid rgba(15, 23, 42, 0.08)',
          boxShadow: '0 24px 60px rgba(15, 23, 42, 0.08)',
          padding: '32px',
          textAlign: 'center',
        }}
      >
        <h1 style={{ marginBottom: '16px' }}>Clerk publishable key missing</h1>
        <p style={{ marginBottom: '0' }}>
          Set <code>VITE_CLERK_PUBLISHABLE_KEY</code> in <code>frontend/.env</code>.
        </p>
      </div>
    </div>
  );
} else {
  root.render(
    <ClerkProvider publishableKey={publishableKey}>
      <App />
    </ClerkProvider>
  );
}
