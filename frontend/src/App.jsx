import { ClerkLoaded, Show, SignIn, UserButton } from '@clerk/react';
import './App.css';

function App() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f5f7ff',
      color: '#111827',
      fontFamily: 'system-ui',
      padding: '24px'
    }}>
      <ClerkLoaded>
        <Show when="signed-out">
          <div style={{
            width: '100%',
            maxWidth: '480px',
            padding: '24px',
            borderRadius: '24px',
            border: '1px solid rgba(15, 23, 42, 0.08)',
            background: '#ffffff',
            boxShadow: '0 24px 60px rgba(15, 23, 42, 0.08)'
          }}>
            <SignIn 
              appearance={{
                elements: {
                  rootBox: 'w-full',
                  card: 'shadow-none'
                }
              }}
            />
          </div>
        </Show>

        <Show when="signed-in">
          <div style={{
            textAlign: 'center',
            width: '100%',
            maxWidth: '480px'
          }}>
            <h1>Welcome!</h1>
            <UserButton />
          </div>
        </Show>
      </ClerkLoaded>
    </div>
  );
}

export default App;
