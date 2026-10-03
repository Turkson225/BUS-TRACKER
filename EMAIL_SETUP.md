# Connect the company arrival-email sender

No arrival emails are sent until the sender is connected in Supabase and a live trip reaches an eligible pickup point.

Use a Google account owned by the company. This sender uses Google Apps Script and MailApp; it does not read your Gmail inbox. Workers receive an individual email at the address they sign in with. Only workers with a saved, current-route pickup plan, on shift that day, and arrival emails enabled are eligible. Approaching and arrival phone notifications are separate.

1. Sign in to the company Google account and open https://script.google.com/ . Create a new project named **OnRoute arrival emails**.
2. Copy the contents of `scripts/google-email-relay.gs` into `Code.gs` and save.
3. Select **initializeRelay** and click **Run**. Review and grant the email permission. This step checks the quota and generates a shared secret; it does not send an email.
4. Open **Project Settings → Script Properties**. Copy `ONROUTE_SECRET`. Keep this value private.
5. Choose **Deploy → New deployment → Web app**. Execute as **Me** (the company account). Set access to **Anyone** so the bus tracker server can call the endpoint. The script authenticates every send with the shared secret. If your Google Workspace policy prevents this, ask your company administrator about an approved transactional email service instead.
6. Copy the deployed Web app URL ending in `/exec`. The testing URL ending in `/dev` will not work here.
7. In **Supabase → Edge Functions → Secrets**, add `EMAIL_RELAY_URL` with the `/exec` URL, and add `EMAIL_RELAY_SECRET` as a **secret**, using the same value as `ONROUTE_SECRET`. Do not put it in frontend code, a chat message, or a committed file.
8. After publication, sign in as the transport administrator. In **Company setup → Arrival email sender**, click **Send me a test email**. Verify the sender address and the received message, including the spam folder.
9. Test one on-shift worker and one off-shift worker at a real pickup point before company rollout. A Test trip deliberately sends no arrival alerts or worker emails.

The app requests an arrival email only after a fresh GPS fix reaches the pickup area: within 120 m of the saved point, within 150 m along the current recorded route, and GPS accuracy 60 m or better. It de-duplicates by worker and trip, including after driver swaps. Email does not require browser notification permission or an open worker app. Mail submission is not proof of inbox delivery, and emails may arrive later than phone alerts.

Google imposes daily quotas. As checked on 3 October 2026, the published MailApp limits are 100 email recipients per day for consumer accounts and 1,500 for paid Google Workspace accounts; other account and trial limits may apply. Confirm that the chosen account supports the number of workers plus tests. The script checks remaining quota before sending. See [Google's current quotas](https://developers.google.com/apps-script/guides/services/quotas).

The backend follows Google's Content Service response redirect without sending the shared secret to the redirect destination. Transport events retry failed submissions up to three times while the event is under two minutes old, when another live GPS update triggers processing. Retries use the same event ID. The sender retains a one-day event record to prevent duplicates. An uncertain submission is recorded as `uncertain` and is not automatically retried; check the sender account before taking manual action. Failed or disconnected email delivery does not prevent the map or phone alerts from working.

References: [Apps Script web app deployment](https://developers.google.com/apps-script/guides/web), [MailApp](https://developers.google.com/apps-script/reference/mail/mail-app), [Content Service redirects](https://developers.google.com/apps-script/guides/content).
