import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { Users, Navigation } from 'lucide-react';
import AppLogo from './app-logo';
import TransportApp from './transport-app';
import SectionPicker from './section-picker';
import { configured, loadClerk, signIn } from '@/lib/client';
import { readSignInIntent, rememberSignInIntent, type WorkerSection } from '@/lib/access';
import 'leaflet/dist/leaflet.css';
import './globals.css';
import './glass.css';

function App() {
  const [ready, setReady] = useState(!configured), [signedIn, setSignedIn] = useState(false), [demo, setDemo] = useState(!configured), [error, setError] = useState('');
  const [choice] = useState(readSignInIntent);
  const [role, setRole] = useState<'worker' | 'driver'>(choice?.role ?? 'worker');
  const [section, setSection] = useState<WorkerSection | null>(choice?.section ?? null);
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
  function beginSignIn(admin = false) {
    rememberSignInIntent(admin ? null : { role, section: role === 'worker' ? section : null });
    void signIn().catch(e => setError(e.message));
  }
  if (demo || signedIn) return <>{!configured && <div className="connection-banner" role="status">Design preview · Company sign-in and live tracking are being set up. The bus shown is a sample.</div>}{signedIn && <button className="signout-control" onClick={() => { rememberSignInIntent(null); void window.Clerk.signOut({ redirectUrl: location.origin + import.meta.env.BASE_URL }); }}>Sign out</button>}<TransportApp key={signedIn ? 'live' : 'demo'} previewOnly={!signedIn} signInIntent={signedIn ? readSignInIntent() : null}/></>;
  return <main className="auth-screen"><section className="auth-card"><AppLogo/><p className="eyebrow">YOUR MORNING, ON TIME</p><h1>Your bus.<br/>One less worry.</h1><p>See where the company bus is and get ready when it approaches your pickup point.</p>
    <fieldset className="role-choice"><legend>How will you use OnRoute?</legend><div className="role-options">{(['worker', 'driver'] as const).map(value => <label key={value}><input type="radio" name="sign-in-role" value={value} checked={role === value} onChange={() => setRole(value)}/><span>{value === 'worker' ? <Users size={22}/> : <Navigation size={22}/>}<strong>{value === 'worker' ? 'Worker' : 'Driver'}</strong><small>{value === 'worker' ? 'Track my pickup' : 'Share bus location'}</small></span></label>)}</div></fieldset>
    {role === 'worker' ? <SectionPicker value={section} onChange={setSection}/> : <p className="auth-help">Use the email your administrator approved for driving. Your next driver can sign in here to take over the bus.</p>}
    {error && <p role="alert">{error}</p>}<button className="button full" disabled={!ready || !!error || (role === 'worker' && !section)} onClick={() => beginSignIn()}>{ready ? `Sign in as ${role === 'worker' ? 'worker' : 'driver'}` : 'Loading sign-in…'}</button><p className="auth-help">First time? Choose <strong>Sign up</strong> in the sign-in form using your approved company email.</p>{error && <button className="button secondary full" onClick={() => location.reload()}>Retry sign-in</button>}<button className="text-button admin-signin" disabled={!ready || !!error} onClick={() => beginSignIn(true)}>Administrator sign-in</button><small>Morning pickup · 06:00–08:00 GMT</small></section></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
