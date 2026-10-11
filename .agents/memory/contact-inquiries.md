---
name: Contact inquiry handling
description: Contact scope, save-before-notification behavior and honest delivery acknowledgements.
---
Keep contact inquiries separate from the existing careers application service.

**Why:** The user requested a sales contact form, not a change to the job-application workflow. Reusing the application service would mix different submissions and delivery expectations.

**How to apply:** Preserve the existing application behavior when changing branding. Keep the sales form minimal: the user removed phone and firm, retained Name and Work Email, and subsequently asked to add Area of Interest.

Save contact inquiries privately before attempting a notification. Resend acceptance is not proof of inbox delivery; preserve the inquiry and show an honest acknowledgement if email cannot be confirmed.

**Why:** The user requested email notifications after initially using private saves. Notification failures must not lose a lead or encourage duplicate submissions after a successful send.

**How to apply:** Keep inquiry data out of public endpoints, logs, source files, and screenshots. Retry ambiguous email failures with the same idempotency key and distinguish private receipt, provider acceptance and confirmed delivery.
