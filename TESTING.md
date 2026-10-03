# Test the tracker

The website workflow runs TypeScript checks, the production Pages build, the schema/query-registry check, and isolated tests against PostgreSQL. It also checks the generated dashboard deployment, tests its actual bundled Clerk verifier and administrator setup, and confirms that a failed or repeated SQL installation preserves the database. Test identities, GPS trails, and sender responses are fixtures; they do not prove live phone behavior or email delivery.

## Account and route test

1. Connect a test Clerk instance and a dedicated Supabase test project using `SETUP.md`.
2. Sign in with an address other than `ADMIN_EMAIL`. Company initialization must be denied.
3. Sign in as the configured administrator. Create the company, record at least 100 m while moving with the phone screen open, stop, review the map, and save. Reload and confirm the saved route remains.
4. Assign that route to the company bus. Add two verified driver emails and at least two worker emails. A signed-in account that has not been approved must be denied company data.
5. Each worker taps their own point on the route, saves a shift plan, and reloads. Check that their pickup remains private and belongs to the current route revision.

## Driver handover test

Use **Test trip** for safe testing outside the morning window; test trips create no worker alerts or emails.

1. Driver A starts the test trip, permits GPS, and keeps the page open. A worker checks the map update.
2. Driver A offers the trip to Driver B. Driver A's phone must stop sharing and workers must see the pending handover state.
3. Driver B accepts with a fresh GPS fix. Confirm the same journey continues, with the same stop progress and delay.
4. Driver A tries to resume or submit an old update. It must be refused. Repeat B → A to check multiple swaps.
5. Leave the tracking screen or disable GPS. Confirm the map marks old fixes as stale. Resume only on the active driver's phone.
6. End the trip; both phones must stop live tracking.

## Notification and email field test

Use test accounts that you control. Automated tests never send mail. A real live-arrival test must take place between **06:00 and 08:00 GMT**, with a live trip.

1. Worker 1 saves today's on-shift plan and a pickup point. Worker 2 saves today's off-shift plan. Worker 3 saves tomorrow's plan. Enable browser notifications for Worker 1; verify a test push reaches that device.
2. Connect the company email sender and use **Send me a test email** while signed in as the administrator. Check the inbox and spam folder.
3. Drive the saved route toward Worker 1's pickup. Confirm an approaching notification at the chosen distance and an arrival notification near the point. Check the arrival email and its recorded delivery state.
4. Confirm Workers 2 and 3 received no journey alerts. Disable Worker 1's arrival email for another trip and confirm email opt-out is honored.
5. Swap drivers before the point and again afterward. Confirm approaching/arrival emails are not repeated for that worker during the same trip.
6. Record or revise the route. Old pickup plans must require confirmation and must not trigger arrival notifications against the new route revision.

If GPS permission is denied, fixes are weak, or the phone locks, the app must display the condition. Browser GPS does not guarantee tracking in the background. Email arrival time depends on the provider; do not rely on email as the sole instant warning.
