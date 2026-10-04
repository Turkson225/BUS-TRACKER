# Deploy the bus tracker through the Supabase dashboard

Project: **lglwlqfgjqbbizbcrvzv**. Website: **https://turkson225.github.io/BUS-TRACKER/**.

This method uses your signed-in Supabase dashboard. It requires no Supabase personal access token or GitHub database-password secret. Keep the backend's Clerk Secret key private in Supabase.

## 1. Install the database

Open https://supabase.com/dashboard/project/lglwlqfgjqbbizbcrvzv and select **SQL Editor → New query**. Copy the entire contents of `setup.sql`, paste into the editor, and click **Run**.

Use this installation once on this dedicated project. It creates the private transport tables and server-only RPC in a transaction and records the repository migration version. If it reports that `transport_private` already exists, do not delete the schema or overwrite company data; check whether the database was already installed. Future database changes need new migrations.

To confirm installation, run this separate read-only query:

```sql
SELECT count(*) AS private_tables
FROM pg_tables WHERE schemaname = 'transport_private' AND rowsecurity;
SELECT version FROM supabase_migrations.schema_migrations
WHERE version = '20261003200000';
```

Expected results: **10** tables and version **20261003200000**.

## 2. Add Clerk settings privately

Open the Clerk application whose development Frontend API URL is **https://driven-dingo-9556.clerk.accounts.dev**. The website workflow already defaults to its supplied Publishable key. Enable email sign-in and verified email addresses, and copy its Secret key privately from its API keys page. Use this same Clerk instance for all settings. If choosing a different instance, override the website Publishable key as described below and use that instance's matching issuer and Secret key.

In **Supabase → Edge Functions → Secrets**, enter and save:

| Name | Value |
| --- | --- |
| `CLERK_SECRET_KEY` | Clerk Secret key, entered privately here |
| `CLERK_ISSUER` | `https://driven-dingo-9556.clerk.accounts.dev` for the supplied development instance |
| `ADMIN_EMAIL` | Your own verified primary sign-in email |
| `APP_ORIGIN` | `https://turkson225.github.io` |

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the function. Do not copy server keys into the website or GitHub frontend variables.

## 3. Deploy the backend

Select **Edge Functions → Deploy a new function → Via Editor**. Set the function name to **transport**. Replace all the template code in `index.ts` with the complete contents of `transport.ts`. It includes the backend and its JavaScript dependencies; no additional project files are needed. Click **Deploy function**.

In the function settings, turn **Verify JWT with legacy secret** off. This gateway check expects a Supabase token. The tracker instead verifies the Clerk session signature, issuer, expiry, authorized website origin and verified primary email inside the function before any database access. The API still requires sign-in.

The endpoint should be:

https://lglwlqfgjqbbizbcrvzv.supabase.co/functions/v1/transport

Open that address in a browser without signing in. Expected result: HTTP **401** with `Sign in to use company transport.` A 404 means the function has not been deployed under the name `transport`. A gateway `Missing authorization header` response means its legacy JWT check is still enabled. This verifies deployment and rejection of anonymous requests; the signed-in test below verifies the database connection.

## 4. Connect website sign-in

The supplied Clerk development Publishable key is already the website workflow's default. To use another Clerk instance, open https://github.com/Turkson225/BUS-TRACKER/settings/variables/actions and create **VITE_CLERK_PUBLISHABLE_KEY** with that instance's Publishable key (`pk_test_...` for development), then update its matching Supabase Clerk secrets.

The Supabase URL is already configured. Open the repository's **Actions → Test and publish website → Run workflow**, select `main`, and wait for success.

Open the website, sign in with the email saved as `ADMIN_EMAIL`, and initialize the company. A successful company setup confirms authenticated access to the deployed database. Record and review your route, assign it to the single bus, and approve driver and worker accounts.

## 5. Test before inviting workers

Use the **Test trip** option outside the morning pickup window. Test driver takeover with two approved accounts and verify that only the current driver's phone can upload location. Keep the driver's browser open and the phone unlocked while sharing GPS.

Phone push and arrival email need their provider settings before they can deliver real messages. Follow the repository's `SETUP.md`, `EMAIL_SETUP.md`, and `TESTING.md` for those steps. Development Clerk settings are for testing; complete Clerk's production setup before company rollout.

## Updating later

The original source and generated dashboard files are kept in GitHub. For backend code changes, run `pnpm manual:generate`, review the resulting files, and paste the updated `transport.ts` into the existing function editor, then choose **Deploy updates**. Do not rerun the initial `setup.sql` on an installed database. The dashboard itself does not offer source version control or rollback; use the repository's reviewed versions.

References: [Supabase dashboard deployment](https://supabase.com/docs/guides/functions/quickstart-dashboard), [function secrets](https://supabase.com/docs/guides/functions/secrets), [function authorization](https://supabase.com/docs/guides/functions/auth), [migration tracking](https://supabase.com/docs/guides/deployment/database-migrations).
