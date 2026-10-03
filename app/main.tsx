import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { BusFront } from 'lucide-react';
import TransportApp from './transport-app';
import { configured, loadClerk, signIn } from '@/lib/client';
import 'leaflet/dist/leaflet.css';
import './globals.css';
import './glass.css';

function App() {
  const [ready, setReady] = useState(!configured), [signedIn, setSignedIn] = useState(false), [demo, setDemo] = useState(!configured), [error, setError] = useState('');
  useEffect(() => {
    if (!configured) return;
    let cancelled = false, remove: (() => void) | undefined;
    loadClerk().then(clerk => {
      if (cancelled) return;
      setSignedIn(Boolean(clerk.user)); setReady(true);
      remove = clerk.addListener(({ user }) => { setSignedIn(Boolean(user)); setDemo(false); });
    }).catch(e => { setError(e.message); setReady(true); });
    return () => { cancelled = true; remove?.(); };
  }, []);
  if (demo || signedIn) return <>{!configured && <div className="connection-banner" role="status">Design preview · Clerk and Supabase have not been connected. The bus shown is a sample.</div>}{signedIn && <button className="signout-control" onClick={() => void window.Clerk.signOut({ redirectUrl: location.href })}>Sign out</button>}<TransportApp key={signedIn ? 'live' : 'demo'} previewOnly={!signedIn}/></>;
  return <main className="auth-screen"><section className="auth-card"><span className="auth-logo"><BusFront size={36}/></span><p className="eyebrow">YOUR MORNING, ON TIME</p><h1>Your bus.<br/>One less worry.</h1><p>See where the company bus is and get ready when it approaches your pickup point.</p>{error && <p role="alert">{error}</p>}<button className="button full" disabled={!ready || !!error} onClick={signIn}>{ready ? 'Sign in with your company email' : 'Loading sign-in…'}</button>{error && <button className="button secondary full" onClick={() => location.reload()}>Retry sign-in</button>}<button className="text-button" onClick={() => setDemo(true)}>Explore the sample tracker</button><small>Morning pickup · 06:00–08:00 GMT</small></section></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
