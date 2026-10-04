import assert from 'node:assert/strict';
import { testRuntime } from './test-runtime.mjs';
const runtime = await testRuntime();
try {
  const db = await runtime.getD1Database('DB');
  async function call(user, body, status = 200) {
    const response = await runtime.dispatchFetch('https://pilot.test/api/transport', {
      method: body ? 'POST' : 'GET',
      headers: { 'oai-authenticated-user-id': user, 'oai-authenticated-user-email': `${user}@example.test`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    assert.equal(response.status, status, JSON.stringify({ user, body, data }));
    return data;
  }
  await call('admin', { action: 'setup', company: 'Section fixture' });
  for (const [user, section] of [['flight', 'Flightops'], ['ful', 'Fulops'], ['cca', 'CCA']]) {
    await call('admin', { action: 'member', member: { email: `${user}@example.test`, name: user, role: 'worker', section } });
    assert.equal((await call(user)).user.section, section);
  }
  await call('admin', { action: 'member', member: { email: 'driver@example.test', name: 'Driver', role: 'driver' } });
  await call('admin', { action: 'member', member: { email: 'legacy@example.test', name: 'Legacy worker', role: 'worker' } });
  assert.equal((await call('legacy')).user.section, null, 'older workers can choose a section after sign-in');
  await call('legacy', { action: 'worker-section', section: 'CCA' });
  assert.equal((await call('legacy')).user.section, 'CCA', 'section persists across reads');
  await call('flight', { action: 'worker-section', section: 'Fulops', email: 'cca@example.test', userId: 'cca', role: 'driver' });
  assert.equal((await call('flight')).user.section, 'Fulops');
  assert.equal((await call('flight')).user.role, 'worker', 'role hints cannot grant driver access');
  assert.equal((await call('cca')).user.section, 'CCA', 'workers cannot update another account');
  assert.deepEqual((await call('flight')).members, [], 'workers cannot see the member directory');
  await call('flight', { action: 'start', busId: 'any-bus', test: true }, 403);
  await call('flight', { action: 'member', member: { email: 'flight@example.test', name: 'Promote myself', role: 'driver' } }, 403);
  for (const section of [null, '', 'Admin', 'flightops', 1]) await call('flight', { action: 'worker-section', section }, 400);
  for (const user of ['driver', 'admin', 'stranger']) await call(user, { action: 'worker-section', section: 'Flightops' }, 403);
  await call('admin', { action: 'member', member: { email: 'bad@example.test', name: 'Bad', role: 'worker', section: 'Other' } }, 400);
  await call('admin', { action: 'member', member: { email: 'driver@example.test', name: 'Driver', role: 'driver', section: 'CCA' } }, 400);
  await call('admin', { action: 'member', member: { email: 'flight@example.test', name: 'Renamed', role: 'worker' } });
  assert.equal((await call('flight')).user.section, 'Fulops', 'older admin clients preserve the saved section');
  const members = (await call('admin')).members;
  assert.equal(members.find(member => member.email === 'flight@example.test').section, 'Fulops');
  assert.equal((await call('driver')).user.section, null);
  assert.ok((await call('driver')).members.every(member => member.section === null), 'driver directory excludes workers');
  await call('admin', { action: 'member', member: { email: 'flight@example.test', name: 'Approved driver', role: 'driver' } });
  const promoted = (await call('flight')).user;
  assert.equal(promoted.role, 'driver'); assert.equal(promoted.section, null, 'promotion clears worker section');
  await assert.rejects(db.prepare('UPDATE members SET section=? WHERE email=? AND user_id=? AND role=?').bind('CCA', 'driver@example.test', 'driver', 'driver').run(), 'database constraint rejects driver sections');
  console.log('Worker section checks passed: all three sections, persistence, own-account updates, member approval, role escalation prevention, private directories and safe role changes.');
} finally { await runtime.dispose(); }
