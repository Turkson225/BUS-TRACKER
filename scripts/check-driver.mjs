import assert from 'node:assert/strict';
import { DriverLocation, LocationCancelled, locationError } from '../lib/driver-location.ts';
let reads = [], watches = [], cleared = [], fixes = [], errors = [];
const gps = {
  getCurrentPosition(success, error, options) { reads.push({success, error}); assert.equal(options.maximumAge, 0); },
  watchPosition(success, error) { watches.push({success, error}); return watches.length - 1; },
  clearWatch(id) { cleared.push(id); }
};
const fix = (timestamp = Date.now()) => ({timestamp, coords:{latitude:5.6,longitude:-0.2,accuracy:8}});
const location = new DriverLocation(gps, p => fixes.push(p), e => errors.push(e));
const enabling = location.enable();
assert.equal(location.enabled, false);
reads.at(-1).success(fix()); await enabling;
assert.equal(location.enabled, true); assert.equal(fixes.length, 1);
await location.fresh(); assert.equal(reads.length, 1);
watches[0].success(fix(Date.now()-60000)); assert.equal(fixes.length,1);
watches[0].success(fix(NaN)); assert.equal(fixes.length,1);
location.stop(); assert.equal(location.enabled,false); assert.deepEqual(cleared,[0]);
watches[0].success(fix()); assert.equal(fixes.length,1);
const cancelled = location.enable(); location.stop();
await assert.rejects(cancelled, LocationCancelled);
reads.at(-1).success(fix()); assert.equal(location.enabled,false);
const denied = location.enable(); reads.at(-1).error({code:1});
await assert.rejects(denied, e => e.code===1);
assert.match(locationError({code:1}), /allow location/);
assert.match(locationError({code:3}), /in time/);
const old = location.enable(); reads.at(-1).success(fix(Date.now()-60000));
await assert.rejects(old,/old/);
const again = location.enable(); reads.at(-1).success(fix()); await again;
watches[0].error({code:1}); assert.equal(location.enabled,true);
watches.at(-1).error({code:1}); assert.equal(location.enabled,false); assert.equal(errors.length,1);
const freshStart = location.enable(); reads.at(-1).success(fix(Date.now()-20000)); await freshStart;
const fresh = location.fresh(); location.stop(); await assert.rejects(fresh,LocationCancelled);
await assert.rejects(location.fresh(),/Turn on location/);
console.log('Driver GPS checks passed: permission, freshness, cancellation, watch cleanup and stale phone isolation.');
