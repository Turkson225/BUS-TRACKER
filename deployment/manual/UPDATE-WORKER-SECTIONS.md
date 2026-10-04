# Enable Worker / Driver sign-in and worker sections

The website now offers **Worker**, **Driver**, and a separate **Administrator sign-in** link. Workers belong to **Flightops**, **Fulops**, or **CCA**. Clerk still verifies the account; the administrator's approved membership decides access. Choosing Driver cannot grant permission to drive.

## Update an existing Supabase database

1. Open your Supabase project **lglwlqfgjqbbizbcrvzv → SQL Editor → New query**.
2. Paste the complete contents of **upgrade-worker-sections.sql**, then click **Run** once. This adds the section field and updates the server-only query registry. Existing accounts, routes, pickups and trips are preserved. Do not rerun setup.sql on an existing database.
3. Open **Edge Functions → transport → Code**. Replace all of **index.ts** with the complete updated **transport.ts**, then choose **Deploy updates**. Keep the existing Clerk secrets.
4. Reload https://turkson225.github.io/BUS-TRACKER/ and use **Administrator sign-in**. In **Company setup → Workers & drivers**, add each approved email. For workers, choose Flightops, Fulops or CCA; for drivers, choose Driver.

If the original database was never installed, use the new **setup.sql** once instead of the upgrade. The new setup already includes worker sections. Deploy the same updated transport.ts afterward.

Existing workers without a section are asked to choose and save it after signing in. Their section is remembered across devices, and they can change it under **My pickup → My work section**. If the administrator already assigned their section, that saved value takes precedence over the sign-in selection.

Drivers open on the Driver screen, where the same bus trip can be handed over. Only approved drivers and the administrator can start or take over GPS sharing. Workers receive alerts according to their private pickup plan and on-shift dates; work sections do not change those rules.

## If the signed-in tracker still reports a service error

The screenshot's service error is separate from choosing a worker or driver. The anonymous endpoint responds with the expected sign-in requirement, but that does not confirm authenticated access.

Check **Edge Functions → Secrets** privately:

| Name | Value |
| --- | --- |
| CLERK_ISSUER | https://driven-dingo-9556.clerk.accounts.dev |
| CLERK_SECRET_KEY | Secret key from that same Clerk development application |
| ADMIN_EMAIL | Your verified primary administrator email |
| APP_ORIGIN | https://turkson225.github.io |

The new backend distinguishes a rejected Clerk secret key from an unreachable sign-in service. If the error remains, open **Edge Functions → transport → Logs**, trigger **Retry connection** in the app, and inspect the error at that time. Share only the error message or a screenshot with credentials hidden. Never paste Secret keys, session tokens, passwords or verification codes into chat.

The optional GitHub **Deploy Supabase backend** workflow requires a personal access token. It is not needed for these dashboard steps. **Test and publish website** publishes the frontend automatically.
