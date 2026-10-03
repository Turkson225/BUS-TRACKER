# OnRoute · Company Bus Tracker

One company bus, one live journey, and multiple drivers who can hand over the same journey along the route. Morning pickup runs from **06:00 to 08:00 GMT**.

The frontend runs on **GitHub Pages**, accounts use **Clerk**, and the database and transport API run on **Supabase**. Without connected account settings the website clearly shows a sample bus, not live company data.

## Features

- Administrator: configure the company, record the actual route with phone GPS, review and save the trail, assign the route to the bus, and approve workers and drivers.
- Worker: sign in, tap a pickup point on the route map, choose the day's shift, set an approaching-alert distance from 500 m to 5 km, and enable arrival emails and phone push notifications.
- Driver: share fresh phone GPS, report a delay, offer the journey to another approved driver, and let the next driver accept with a fresh GPS fix. The trip, pickup progress, and existing alerts stay intact.
- Map: see the bus and your own pickup point, with clear stale-location and pending-handover states. The map refreshes every eight seconds; driver fixes upload at most once every five seconds.
- Alerts: on-shift workers receive approaching and arrival events along the saved route. Arrival email is sent once per worker per trip. Off-shift workers and future-date plans are excluded.

## Connect the accounts and publish

Follow [SETUP.md](SETUP.md). All application source, database migration, deployment workflows, and tests are in this repository. Private credentials belong in GitHub Secrets or Supabase Edge Function secrets, never in source files or browser configuration.

- Website workflow: [Test and publish website](../../actions/workflows/test-and-pages.yml)
- Backend workflow: [Deploy Supabase backend](../../actions/workflows/deploy-backend.yml)
- Email sender: [EMAIL_SETUP.md](EMAIL_SETUP.md)
- Field test: [TESTING.md](TESTING.md)

GitHub Pages must be enabled with **Settings → Pages → Source: GitHub Actions**. The expected website address is `https://turkson225.github.io/BUS-TRACKER/`; it is only live after the deployment workflow succeeds.

## Local development

Use Node.js 24 and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Set `BASE_PATH=/` in your local environment to serve at the root. For connected local testing use a separate test Clerk instance and Supabase project, and set the backend's `APP_ORIGIN` to the exact local origin. The GitHub Pages build defaults to `/BUS-TRACKER/`.

```sh
pnpm typecheck
pnpm db:generate
pnpm build
pnpm test
```

`pnpm db:generate` checks the migration's fixed server-query registry. Before the first database deployment, regenerate it with `node scripts/generate-database.mjs` if backend queries change. After applying the migration, add a new migration for future schema or query-registry changes rather than rewriting an applied migration.

Local behavior tests use an isolated SQLite fixture. GitHub Actions runs the same behavior tests through the actual Supabase database adapter against an isolated PostgreSQL 17 database, plus database permission and transaction checks. Auth tests use freshly generated RSA keys and mocked Clerk responses; email tests use a mocked sender. No test sends real employee emails or changes a live database.

## Runtime and access

The backend verifies Clerk session signatures, issuer, expiry, session status, and website origin. It reads the verified primary email from Clerk's server API, then applies the company's approved member list. The configured `ADMIN_EMAIL` alone can initialize the company. Application roles are stored in the database and cannot be supplied by the browser.

Ten transport tables are in a private PostgreSQL schema with RLS enabled and no browser access. The Edge Function alone can call a service-only RPC containing a fixed set of reviewed operations. It accepts query identifiers and literal parameters, not arbitrary SQL. Batches are transactional; conditional updates prevent competing handover acceptances or an old driver's phone from updating the bus.

The frontend does not connect directly to the transport tables. Supabase's optional native Clerk Third-Party Auth integration can be enabled for future RLS-scoped features; this app's Edge Function verifies Clerk session tokens itself. It does not use the deprecated Supabase JWT-template integration.

## Phone limitations

Phone GPS recording and driver tracking require HTTPS, location permission, and the tracking screen to remain open. Browsers may stop GPS when the phone is locked or the app goes into the background. The app requests a screen wake lock where available and marks old fixes as stale; it cannot guarantee background tracking. On iPhone, phone push requires installing the app on the Home Screen on a supported iOS version.

Recorded routes must cover at least 100 m and have no GPS gap over 500 m. Pickup points must lie within 150 m of the route. Route revisions require workers to confirm their pickup again. Arrival email requires a fresh fix within 120 m of the pickup, within 150 m along the route, and GPS accuracy of 60 m or better. Test trips last up to two hours and deliberately send no arrival notifications or emails.

Map tiles use OpenStreetMap's public tile service. Review the provider's usage policy before a larger rollout. Email delivery depends on the configured sender's quota and connectivity; acceptance by the sender does not prove inbox delivery.
