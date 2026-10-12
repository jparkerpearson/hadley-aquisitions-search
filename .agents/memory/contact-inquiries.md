---
name: Contact inquiry handling
description: Contact scope, save-before-notification behavior and honest delivery acknowledgements.
---
Keep contact inquiries separate from the existing careers application service.

Contact now opens a prefilled email to info@gethadley.com instead of submitting a website form or sending through Resend. The message is "I'd like to learn more about Hadley AI".

**Why:** After the Resend setup required domain verification, the user explicitly chose a Contact button that opens an email instead. They do not want automatic emails to submitters.

**How to apply:** Keep Contact actions as mailto links. Do not restore the form or Resend sending without a new request. Opening a draft does not automatically send it; the visitor sends through their own email app.

**Why:** The user requested a sales contact form, not a change to the job-application workflow. Reusing the application service would mix different submissions and delivery expectations.

**How to apply:** Preserve the existing application behavior when changing sales contact; email contact is separate from job applications.

If a website contact form is restored in future, save inquiries privately before attempting a notification. Resend acceptance is not proof of inbox delivery.

**Why:** The user requested email notifications after initially using private saves. Notification failures must not lose a lead or encourage duplicate submissions after a successful send.

**How to apply:** Keep inquiry data out of public endpoints, logs, source files, and screenshots. Retry ambiguous email failures with the same idempotency key and distinguish private receipt, provider acceptance and confirmed delivery.
