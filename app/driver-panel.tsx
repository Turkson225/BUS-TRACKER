import { BusFront, Navigation, MapPin, Radio, Users, Check, Clock3, ShieldCheck, Square, AlertTriangle, ArrowRightLeft, Power } from 'lucide-react';
import type { Bus, Route, Trip } from '../lib/transport';

export type DriverPanelProps = {
  service?:'morning'|'evening'; nightAllowed?:boolean; canDrive: boolean; configured: boolean; inWindow: boolean; busy: boolean;
  bus?: Bus; route?: Route; companyTrip?: Trip; ownTrip?: Trip; incomingTrip?: Trip;
  locationOn: boolean; locating: boolean; sharing: boolean; accuracy: number | null;
  lastFixAt: number | null; lastUploadAt: number | null; now: number; gpsMessage: string; error: string;
  testTrip: boolean; nextDriver: string; nextDrivers: { id: string; name: string }[]; delay: string;
  onLocation: () => void; onLocationOff: () => void; onTrack: () => void; onPause: () => void;
  onTestTrip: (value: boolean) => void; onNextDriver: (value: string) => void;
  onSwap: () => void; onCancelSwap: () => void; onEnd: () => void;
  onCompleteStop: () => void; onDelay: (value: string) => void; onUpdateDelay: () => void;
};

export function trackingBlock(p: DriverPanelProps): string | null {
  if (!p.canDrive) return 'Your administrator must approve this account as a driver.';
  if(p.service==='evening'&&p.nightAllowed===false)return 'Only the designated night driver can start evening trips.';
  if (!p.configured) return 'Ask your administrator to finish company setup.';
  if (!p.bus || !p.route) return 'Ask your administrator to add the bus and assign its route.';
  if (p.ownTrip?.handoverName) return `Swap requested. Waiting for ${p.ownTrip.handoverName} to accept.`;
  if (p.companyTrip && !p.ownTrip && !p.incomingTrip) return `${p.companyTrip.driverName} is driving. Ask them to send a swap to your account.`;
  if (!p.companyTrip && !p.inWindow && !p.testTrip) return p.service==='evening'?'Evening trips run 18:00–21:00 GMT. Choose Test mode to try tracking now.':'Morning trips run 06:00–08:00 GMT. Choose Test mode to try tracking now.';
  if (!p.locationOn) return 'First, turn on location in step 1.';
  return null;
}

export default function DriverPanel(p: DriverPanelProps) {
  const duty = p.ownTrip ?? p.incomingTrip;
  const block = trackingBlock(p);
  const stale = p.lastFixAt !== null && p.now - p.lastFixAt > 45000;
  const weak = p.accuracy !== null && p.accuracy > 100;
  const mode = p.companyTrip ? !!p.companyTrip.test : p.testTrip;
  const stop = duty ? p.route?.stops[duty.nextStop] : undefined;
  const stoppedAt = p.lastUploadAt ? `${Math.max(0, Math.floor((p.now - p.lastUploadAt) / 1000))}s ago` : null;
  const uploadStale = p.lastUploadAt !== null && p.now - p.lastUploadAt > 45000;
  const title = p.ownTrip?.handoverName ? 'Swap pending' : p.incomingTrip ? 'Your turn to drive' : p.sharing ? 'Tracking the bus' : p.ownTrip ? 'Tracking paused' : p.companyTrip ? 'Another driver is on duty' : 'Ready for your duty';
  return <div className="driver-workspace">
    <div className="page-heading"><div><p className="eyebrow">DRIVER DUTY</p><h1>{p.service==='evening'?'Drive. Track. Drop off.':'Drive. Track. Swap.'}</h1><p>{p.service==='evening'?'One night driver. Home destinations for workers on shift.':'One company bus. A clear handover between phones.'}</p></div><span className="driver-duty-badge"><Radio size={16}/>{title}</span></div>
    {p.error && <div className="driver-error" role="alert"><AlertTriangle size={20}/><span>{p.error}</span></div>}
    <section className="panel driver-bus-summary" aria-label="Your bus and route"><span className="driver-bus-icon"><BusFront size={27}/></span><div><h2>{p.bus?.name ?? 'Company bus not set up'}</h2><p>{p.bus?.plate ?? 'Registration pending'} · {p.route?.name ?? 'Route pending'}</p></div><div className="driver-current"><small>CURRENT DRIVER</small><strong>{p.companyTrip?.driverName ?? 'No driver on duty'}</strong><span>{mode ? 'Test trip · no worker alerts' : p.service==='evening'?'Home drop-offs · 18:00–21:00 GMT':'Morning pickup · 06:00–08:00 GMT'}</span></div></section>
    {!p.canDrive && <div className="notice"><ShieldCheck size={20}/><span>Your administrator needs to add your email as a driver before you can track this bus.</span></div>}
    <div className="driver-steps">
      <section className="panel driver-step" aria-labelledby="driver-location-title">
        <div className="driver-step-heading"><span className="driver-step-number">1</span><div><h2 id="driver-location-title">Phone location</h2><p>Give this phone access to GPS.</p></div><MapPin size={23}/></div>
        <div className={`driver-location-status ${p.locationOn && !stale && !weak ? 'ready' : ''}`} role="status"><span className="driver-status-dot"/><div><strong>{p.locating ? 'Finding your location…' : !p.locationOn ? 'Location is off' : stale ? 'Waiting for a fresh GPS fix' : weak ? 'Location on · weak accuracy' : 'Location is on'}</strong><small>{p.locationOn && p.accuracy !== null ? `Accuracy ±${Math.round(p.accuracy)} m` : 'Tap below, then choose Allow in your browser.'}</small></div></div>
        <button className={`button full ${p.locationOn ? 'secondary' : ''}`} disabled={p.busy || p.locating || !p.canDrive} onClick={p.locationOn ? p.onLocationOff : p.onLocation}><Power size={18}/>{p.locating ? 'Finding location…' : p.locationOn ? 'Turn off location' : 'Turn on location'}</button>
        <p className="help-text">Turn on your phone’s Location setting first. Your position stays on this phone until you start tracking or accept a swap.</p>
      </section>
      <section className="panel driver-step" aria-labelledby="driver-trip-title">
        <div className="driver-step-heading"><span className="driver-step-number">2</span><div><h2 id="driver-trip-title">Bus tracking</h2><p>Share the bus location with workers.</p></div><Navigation size={23}/></div>
        {!p.companyTrip && <label className="driver-test-choice"><input type="checkbox" checked={p.testTrip} disabled={p.busy || !p.canDrive} onChange={e => p.onTestTrip(e.target.checked)}/><span><strong>Test mode</strong><small>Try GPS and driver swaps without sending worker alerts.</small></span></label>}
        {p.incomingTrip && <div className="driver-inline-notice"><strong>{p.incomingTrip.driverName} sent you a swap.</strong><span>Turn on location, then accept below. The same trip and pickup progress continue.</span></div>}
        {p.sharing ? <><div className="driver-tracking-live" role="status"><Radio size={20}/><div><strong>{uploadStale || stale ? 'Waiting for a confirmed location' : stoppedAt ? 'Bus location is being shared' : 'Sending the first location…'}</strong><small>{stoppedAt ? `Last sent ${stoppedAt}` : 'Waiting for the server to confirm GPS.'}</small></div></div><button className="button secondary full" disabled={p.busy} onClick={p.onPause}><Square size={17}/>Pause bus tracking</button></> : <><p className="driver-block-reason" id="driver-tracking-reason">{block ?? (p.incomingTrip ? 'Accept the swap to become the current driver.' : p.ownTrip ? 'Resume sharing from this phone.' : 'Location is ready. You can start your trip.')}</p><button className="button full" aria-describedby="driver-tracking-reason" disabled={p.busy || p.locating || !!block} onClick={p.onTrack}><Navigation size={18}/>{p.busy ? 'Please wait…' : p.incomingTrip ? 'Accept swap & start tracking' : p.ownTrip ? 'Resume bus tracking' : mode ? 'Start test trip' : p.service==='evening'?'Start evening trip':'Start morning trip'}</button>{!p.companyTrip && !p.inWindow && !p.testTrip && p.canDrive && <button className="text-button driver-test-shortcut" disabled={p.busy} onClick={() => p.onTestTrip(true)}>Use test mode now</button>}</>}
        {p.gpsMessage && <p className="driver-gps-message" role="status">{p.gpsMessage}</p>}
      </section>
      <section className="panel driver-step" aria-labelledby="driver-swap-title">{p.service==='evening'?<><div className="driver-step-heading"><span className="driver-step-number">3</span><h2 id="driver-swap-title">Home drop-offs</h2></div><p>Use the passenger list below to see home destinations and confirm each safe drop-off.</p><p className="help-text">Evening duty uses one designated driver. Finish all drop-offs, then end the trip.</p></>:<>
        <div className="driver-step-heading"><span className="driver-step-number">3</span><div><h2 id="driver-swap-title">Swap driver</h2><p>Pass the same trip to the next phone.</p></div><ArrowRightLeft size={23}/></div>
        {p.ownTrip?.handoverName ? <><div className="driver-inline-notice"><strong>Waiting for {p.ownTrip.handoverName}</strong><span>Your phone has stopped sharing. The next driver must sign in and accept the swap.</span></div><button className="button secondary full" disabled={p.busy} onClick={p.onCancelSwap}>Cancel driver swap</button></> : <><label className="driver-select-label">Next driver<select value={p.nextDriver} disabled={p.busy || !p.ownTrip || !p.nextDrivers.length} onChange={e => p.onNextDriver(e.target.value)}><option value="">Choose an approved driver</option>{p.nextDrivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</select></label><button className="button secondary full" disabled={p.busy || !p.ownTrip || !p.nextDriver || !p.nextDrivers.some(driver => driver.id === p.nextDriver)} onClick={p.onSwap}><Users size={18}/>Swap to selected driver</button><p className="help-text">{!p.ownTrip ? 'Start your trip or accept a swap before passing the bus to another driver.' : !p.nextDrivers.length ? 'Ask your administrator to add another approved driver first.' : 'Once sent, your GPS stops. The selected driver opens Driver on their phone and accepts the swap.'}</p></>}
      </>} </section>
    </div>
    <div className="driver-bottom-grid"><section hidden={p.service==='evening'} className="panel driver-pickups"><div className="section-heading"><h2>Pickup progress</h2><span className="status-tag">{duty ? `${duty.nextStop}/${p.route?.stops.length ?? 0} stops` : 'Not started'}</span></div>{duty ? <><p className="eyebrow">NEXT PICKUP</p><h3>{stop?.name ?? 'All stops completed'}</h3><p>{stop ? `${stop.time} scheduled · confirm after workers have boarded.` : 'The pickup route is complete.'}</p>{p.ownTrip && <><button className="button secondary" disabled={p.busy || !!p.ownTrip.handoverName || !stop} onClick={p.onCompleteStop}><Check size={17}/>Mark pickup complete</button><div className="driver-delay-row"><label className="driver-select-label">Bus delay<select value={p.delay} disabled={p.busy || !!p.ownTrip.handoverName} onChange={e => p.onDelay(e.target.value)}><option value="0">No delay</option>{[5, 10, 15, 30].map(minutes => <option key={minutes} value={String(minutes)}>{minutes} minutes</option>)}</select></label><button className="button secondary" disabled={p.busy || !!p.ownTrip.handoverName} onClick={p.onUpdateDelay}><Clock3 size={17}/>Save delay</button></div></>}</> : <p>Start tracking to see your next pickup and report delays.</p>}</section><section className="panel driver-trip-finish"><h2>Finish your duty</h2><p>{p.service==='evening'?'Confirm the home drop-offs in the passenger list. End the trip after everyone has been safely dropped off.':<>Changing drivers? Use <strong>Swap driver</strong> above. End the trip when the bus has finished the route.</>}</p>{p.ownTrip && <button className="button danger full" disabled={p.busy} onClick={p.onEnd}>End trip & turn off location</button>}<div className="driver-phone-help"><AlertTriangle size={18}/><p>Keep this screen open and your phone charged while tracking. Set up location and swap drivers while the bus is parked.</p></div></section></div>
  </div>;
}
