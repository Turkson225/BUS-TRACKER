# Connect Clerk, Supabase, and GitHub Pages

Use a dedicated Supabase project for this tracker. The initial migration creates a private schema and does not import any company records from the previous pilot.

The configured tracker project is **https://lglwlqfgjqbbizbcrvzv.supabase.co** (reference **lglwlqfgjqbbizbcrvzv**). GitHub's website and backend workflows now use these as defaults. The URL is public configuration; database passwords and deployment tokens must remain private.

## 1. Clerk

Create a Clerk application with email sign-in and verified email addresses. For testing use its development instance. Enable the authentication methods your company intends to use; disable unused ones. The app uses Clerk's prebuilt sign-in UI.

Copy the **Publishable key** (`pk_test_...` for testing) and **Frontend API URL** from Clerk's API keys page. Store the Secret key privately in Supabase, as described below. No custom email or administrator JWT claim is needed.

For company rollout, use a Clerk production instance and complete Clerk's production-domain setup. A custom company domain may be needed for that setup; do not assume a development instance is ready for production.

## 2. Supabase

The tracker project's URL and reference are already configured above. Use the [dashboard deployment guide](deployment/manual/README.md) to install the database and deploy the backend without a Supabase access token or GitHub database-password secret. This Vite app uses `VITE_SUPABASE_URL`; `NEXT_PUBLIC_SUPABASE_URL` is a Next.js variable and is not read by this app.

The backend has a custom Clerk verifier. `verify_jwt = false` in `supabase/config.toml` disables Supabase's incompatible legacy JWT gateway check; it does **not** make the transport API anonymous. Every transport request is authenticated in the function before accessing the database.

In **Supabase → Edge Functions → Secrets**, add:

| Secret | Value |
| --- | --- |
| `CLERK_SECRET_KEY` | Your Clerk application's Secret key |
| `CLERK_ISSUER` | Clerk Frontend API origin, such as `https://YOUR-INSTANCE.clerk.accounts.dev` |
| `ADMIN_EMAIL` | Your own verified Clerk primary email; only this address can initialize the company |
| `APP_ORIGIN` | `https://turkson225.github.io` — origin only, without `/BUS-TRACKER/` |

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to hosted Edge Functions. These are server-side settings. Never create `VITE_SUPABASE_SERVICE_ROLE_KEY` or place the Clerk Secret key in the frontend.

Optional: follow the [native Clerk integration guide](https://supabase.com/docs/guides/auth/third-party/clerk) to register Clerk under Supabase's Third-Party Auth. This is useful for future direct, RLS-scoped features. The current frontend only calls the authenticated Edge Function; it has no direct transport-table privileges.

## 3. GitHub account settings

Open this repository's **Settings → Secrets and variables → Actions**.

Add these **Variables**:

| Variable | Value |
| --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk Publishable key |
| `VITE_SUPABASE_URL` | Optional override; defaults to `https://lglwlqfgjqbbizbcrvzv.supabase.co` |
| `SUPABASE_PROJECT_REF` | Optional override; defaults to `lglwlqfgjqbbizbcrvzv` |

The dashboard method does not need any deployment secrets in GitHub. If you later choose the optional GitHub backend workflow, add these **Secrets**, privately in GitHub:

| Secret | Value |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Supabase personal access token for deployment |
| `SUPABASE_DB_PASSWORD` | This tracker's database password |

You do not need to paste private keys, tokens, or passwords into chat.

## 4. Deploy backend

For the selected dashboard method, follow [deployment/manual/README.md](deployment/manual/README.md). Its generated `setup.sql` installs the database in one transaction; its `transport.ts` is the single file to paste into the Edge Function editor. CI verifies both artifacts against the original source and tests the bundled entrypoint against an isolated PostgreSQL database.

For the optional GitHub workflow, open **Actions → Deploy Supabase backend → Run workflow** after storing its deployment secrets. The workflow links the selected Supabase project, applies the database migration, and deploys the `transport` Edge Function. It runs only when manually selected, so an ordinary source push does not alter a live database.

For a CLI alternative, install the Supabase CLI, log in, and run:

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy transport --project-ref YOUR_PROJECT_REF
```

Keep `CLERK_ISSUER`, the Clerk Publishable key, and the Secret key from the same Clerk instance.

## 5. Enable website hosting

In **Settings → Pages**, select **GitHub Actions** as the source. Then open **Actions → Test and publish website → Run workflow**. Tests must pass before GitHub deploys the website.

The website is expected at **https://turkson225.github.io/BUS-TRACKER/** after deployment succeeds. If no frontend account settings are present, it shows a clearly labeled sample preview.

## 6. Company and phone notifications

Sign in as the configured administrator, create the company, record and review the route, save it, and assign it to the single bus. Add workers and drivers using their verified Clerk primary email addresses. Workers then select their pickup point and save their shift plan.

To enable phone push, generate a VAPID key pair locally and add `VAPID_SERVER_PUBLIC_KEY`, `VAPID_SERVER_PRIVATE_KEY`, and `VAPID_SUBJECT` (for example, `mailto:transport@your-company.example`) as Supabase Edge Function secrets. The function returns only the public key to signed-in users. Workers use **Enable alerts** to grant notification permission on each device. If using Clerk/Supabase development projects, use separate test VAPID keys as well.

Connect arrival emails using [EMAIL_SETUP.md](EMAIL_SETUP.md). Store its shared secret in Supabase, not GitHub frontend variables. Redeploy the function if your provider requires it after changing secrets.

Follow [TESTING.md](TESTING.md) before inviting the company.

References: [Clerk JavaScript SDK](https://clerk.com/docs/js-frontend/getting-started/quickstart), [Clerk token verification](https://clerk.com/docs/guides/sessions/manual-jwt-verification), [Supabase deployments](https://supabase.com/docs/guides/deployment/managing-environments), [GitHub Pages publishing](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
