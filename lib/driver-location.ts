type PhoneGPS = Pick<Geolocation, 'getCurrentPosition' | 'watchPosition' | 'clearWatch'>;
const options: PositionOptions = { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 };

export class LocationCancelled extends Error {
  constructor() { super('Location request cancelled.'); }
}

export function locationError(error: unknown): string {
  const code = (error as { code?: number })?.code;
  if (code === 1) return 'Location is blocked. Turn on Location in your phone settings, then allow location for this website in your browser and try again.';
  if (code === 3) return 'Your phone could not find a location in time. Turn on phone Location, move to an open area, and try again.';
  if (code === 2) return 'Phone location is unavailable. Check that Location is on and try again outdoors.';
  return error instanceof Error ? error.message : 'Could not enable phone location. Please try again.';
}

// A phone can find GPS before a trip starts. Only the caller decides when to upload it.
export class DriverLocation {
  private generation = 0;
  private watcher: number | null = null;
  private latest: GeolocationPosition | null = null;
  private active = false;
  private pending = new Set<() => void>();
  private gps: PhoneGPS;
  private onFix: (fix: GeolocationPosition) => void;
  private onError: (error: GeolocationPositionError) => void;
  constructor(gps: PhoneGPS, onFix: (fix: GeolocationPosition) => void, onError: (error: GeolocationPositionError) => void) {
    this.gps = gps; this.onFix = onFix; this.onError = onError;
  }
  get enabled() { return this.active; }

  private current(generation: number): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error?: unknown, fix?: GeolocationPosition) => {
        if (settled) return;
        settled = true; clearTimeout(timer); this.pending.delete(cancel);
        if (error) reject(error); else resolve(fix!);
      };
      const cancel = () => finish(new LocationCancelled());
      // Browser permission prompts can outlast the GPS timeout; don't leave the UI stuck.
      const timer = setTimeout(() => finish({ code: 3 }), 25000);
      this.pending.add(cancel);
      try {
        this.gps.getCurrentPosition(fix => {
          if (generation !== this.generation) { cancel(); return; }
          if (!Number.isFinite(fix.timestamp) || Math.abs(Date.now() - fix.timestamp) > 30000) { finish(new Error('The location fix is old. Try turning on location again.')); return; }
          finish(undefined, fix);
        }, error => finish(error), options);
      } catch (error) { finish(error); }
    });
  }

  async enable(): Promise<GeolocationPosition> {
    this.stop();
    const generation = this.generation;
    const fix = await this.current(generation);
    if (generation !== this.generation) throw new LocationCancelled();
    this.active = true; this.latest = fix; this.onFix(fix);
    try {
      const id = this.gps.watchPosition(position => {
        if (generation !== this.generation || !this.active) return;
        if (!Number.isFinite(position.timestamp) || Math.abs(Date.now() - position.timestamp) > 30000) return;
        this.latest = position; this.onFix(position);
      }, error => {
        if (generation !== this.generation || !this.active) return;
        if (error.code === 1) this.stop();
        this.onError(error);
      }, options);
      if (generation === this.generation && this.active) this.watcher = id;
      else this.gps.clearWatch(id);
    } catch (error) { this.stop(); throw error; }
    if (!this.active) throw new LocationCancelled();
    return fix;
  }

  async fresh(): Promise<GeolocationPosition> {
    if (!this.active) throw new Error('Turn on location before starting bus tracking.');
    if (this.latest && Math.abs(Date.now() - this.latest.timestamp) < 15000) return this.latest;
    const generation = this.generation;
    const fix = await this.current(generation);
    if (generation !== this.generation || !this.active) throw new LocationCancelled();
    this.latest = fix; this.onFix(fix); return fix;
  }

  stop() {
    this.generation++; this.active = false; this.latest = null;
    if (this.watcher !== null) this.gps.clearWatch(this.watcher);
    this.watcher = null;
    for (const cancel of [...this.pending]) cancel();
  }
}
