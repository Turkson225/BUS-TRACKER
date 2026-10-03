import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
assert.ok(html.includes('/BUS-TRACKER/assets/'));assert.ok(html.includes('/BUS-TRACKER/manifest.webmanifest'));assert.ok(!html.includes('signin-with-chatgpt'));
const manifest=JSON.parse(await readFile(new URL('../dist/manifest.webmanifest',import.meta.url),'utf8'));
assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');for(const icon of manifest.icons)assert.ok(!icon.src.startsWith('/'));
const worker=await readFile(new URL('../dist/sw.js',import.meta.url),'utf8');assert.ok(worker.includes('self.registration.scope'));assert.ok(!worker.includes("openWindow('/')"));
const assets=await readdir(new URL('../dist/assets/',import.meta.url));assert.ok(assets.some(x=>x.endsWith('.css')));assert.ok(assets.some(x=>x.endsWith('.js')));
for(const filename of assets.filter(x=>x.endsWith('.js'))){const source=await readFile(new URL('../dist/assets/'+filename,import.meta.url),'utf8');assert.ok(!source.includes('SUPABASE_SERVICE_ROLE_KEY'));assert.ok(!source.includes('CLERK_SECRET_KEY'));}
console.log('GitHub Pages build checks passed: project path, app manifest, scoped phone notifications and no server-secret variables in frontend output.');
