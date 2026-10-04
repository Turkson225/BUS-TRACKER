# Evening home drop-offs and weekly shifts

This update adds a separate evening service (18:00–21:00 GMT), one designated night driver, separate worker home destinations, seven-day shift submissions, private passenger lists, safe drop-off confirmation and saved GPS trails for administrator review. Existing morning service (06:00–08:00 GMT) and driver swaps are preserved.

## Install on the existing tracker

1. In your existing Supabase project's SQL Editor, paste and run the complete `upgrade-evening-weekly.sql` file once. It requires the earlier worker-section upgrade. The update preserves your company, members, morning routes, bus and pickup points. Do not run `setup.sql` on the existing database.
2. Open Edge Functions → `transport` → Code. Replace its source with the complete matching `transport.ts` file and deploy. Keep your current Clerk, administrator, origin and notification/email settings. The frontend activates the new screens only when this matching backend reports support.
3. Refresh the tracker and sign in as Administrator.

## Administrator setup

- In **Route & stops**, choose **Evening home drop-off route**, record the journey from the company toward home destinations, stop, review and save. You can also add a manual evening route with times between 18:00 and 20:59.
- In **Company bus**, assign both the morning route and the evening route to the same bus, then save.
- In **Evening & weekly shifts**, choose the approved night driver and save. Only that driver can start an evening trip. End active evening trips before changing this assignment.
- Use **Weekly worker submissions** to view names, verified sign-in emails, sections, working days and requested rides.
- Use **Recorded evening trips** to review saved GPS trails. To monitor an active trip, open **Bus map**. GPS points are recorded only while the phone actually shares location; missing fixes are not reconstructed.

## Workers

- In **My pickup**, save your morning pickup point as usual.
- Save a separate **Evening home destination** on the map. Use a safe stopping place near home. It need not be the morning pickup point.
- Enter your name, select a week starting date, mark your working days and enter your shift/hours. Tick morning pickup and/or evening home ride for each working day, then submit the week.
- The email comes from your verified sign-in account; the form cannot redirect alerts to someone else's address. Enable phone notifications and arrival emails if you want both.
- Changing a saved pickup/home point does not silently move an already booked evening destination; submit the week again to apply changes.

## Night driver

- Select **Evening home drop-offs**, turn on phone location, then start the evening trip. Outside 18:00–21:00, use Test mode.
- Use **Preview today’s passengers** before starting duty. During a trip, the passenger list contains workers booked for that evening, their contact email and their saved home destination.
- Confirm each safe drop-off after the worker alights. End the trip when duty is finished. Evening trips do not use morning driver swaps.
- Keep the browser open, phone powered and internet available while tracking. Phone GPS and notification delivery still require a real-device check before rollout.

## Alerts and privacy

- Morning approach distances follow the saved pickup route. Evening home alerts use straight-line proximity to the submitted home point, explicitly labelled in the app; this is not a traffic ETA or turn-by-turn navigator.
- Evening approach/near-home alerts are sent only for booked workers on shift, with fresh GPS and usable accuracy. Test trips do not send worker alerts. Near-home emails use the configured company sender.
- Workers see their own home and submission. The administrator and responsible trip driver can view the applicable passenger destinations; other workers and unrelated drivers cannot see the passenger list.
- The database tables remain private with RLS and no browser-role access. Clerk authentication and the verified server function remain required.

## Validation

Automated checks cover service time boundaries, separate destinations, verified-email binding, duplicate/invalid week rejection, one designated night driver, roster privacy, drop-off confirmation, recorded route service, saved GPS history, home approach/arrival emails, off-shift exclusion and test isolation. Morning tracking, swaps, saved pickups and notification regression checks also run. Email delivery is mocked in tests; real phone GPS and actual email/push delivery must be checked in the deployed company project.
