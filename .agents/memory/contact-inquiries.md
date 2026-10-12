---
name: Contact inquiry handling
description: Contact scope, save-before-notification behavior and honest delivery acknowledgements.
---
Keep contact inquiries separate from the existing careers application service.

Send contact-form email notifications only to info@gethadley.com; do not send an automatic confirmation email to the submitter.

**Why:** The user clarified that they only want the email coming to their team and do not want an email sent to the person submitting.

**How to apply:** Treat the submitter's address as reply-to for the internal notification, not as a recipient of an automatic response.

**Why:** The user requested a sales contact form, not a change to the job-application workflow. Reusing the application service would mix different submissions and delivery expectations.

**How to apply:** Preserve the existing application behavior when changing branding. Keep the sales form minimal: the user removed phone and firm, retained Name and Work Email, and subsequently asked to add Area of Interest.

Save contact inquiries privately before attempting a notification. Provider acceptance is not proof of inbox delivery; preserve the inquiry and show an honest acknowledgement if email cannot be confirmed.

**Why:** The user requested email notifications after initially using private saves. Notification failures must not lose a lead or encourage duplicate submissions after a successful send.

**How to apply:** Keep inquiry data out of public endpoints, logs, source files, and screenshots. Distinguish private receipt, provider acceptance and confirmed delivery.

Use the connected Google Workspace mailbox for internal notifications, not Resend. Never blindly retry an uncertain Gmail send; read back first and leave the notification unconfirmed if it cannot be found.

**Why:** The user explicitly chose Google Workspace instead of Resend. Gmail does not support the previous provider's idempotency keys, so retrying a lost send response can duplicate notifications.

**How to apply:** Send from the authenticated mailbox to the team inbox, retain submitter reply-to, and keep the inquiry saved even if notification acceptance cannot be confirmed.
