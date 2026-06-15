# Validate Delivery Portal

A client delivery portal for Validate video review, file delivery, notes, approvals, version history, and client notifications.

## Current Features

- Supabase-backed admin and client accounts
- Admin client dashboard with client workspaces
- Client projects with videos, images, and review access
- Project sharing to selected client accounts
- Email invites and update notifications through Resend
- Optional SMS invites and update notifications through Twilio
- Direct video uploads through Bunny Stream or Vimeo
- Automatic Bunny collections and Vimeo folders by project name
- Version history with latest-version review by default
- Client notes and admin notes on each version
- Per-client seen and approval tracking
- Admin reminder notices when shared clients have not opened the latest version
- Vimeo thumbnail support through a server-side thumbnail route
- Profile photo upload for note avatars
- Admin/client invite-code generator in Settings
- Password updates and reset-email sending in Settings
- Upload processing check for Bunny and Vimeo transcodes

## Local Preview

Run a local static server:

```sh
python3 -m http.server 3000
```

Then open:

```txt
http://localhost:3000
```

Local browser previews call the production API routes for server actions, so Vercel environment variables still control uploads, email, and private Supabase helpers.

## Accounts And Data

Accounts and portal data live in Supabase. Browser storage only remembers UI state between refreshes.

Supabase project:

```txt
https://axvnifoamejuxxqhezwr.supabase.co
```

Run `schema.sql` in the Supabase SQL Editor to create the required tables, RLS policies, and invite-code signup flow.

Invite codes are generated from the admin Settings tab. Generate a fresh code for each admin or client email instead of reusing a shared code.

First admin account:

```txt
henry@createwithvalidate.com
```

## Environment Variables

Set these in Vercel Production:

```txt
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
BUNNY_STREAM_LIBRARY_ID=
BUNNY_STREAM_API_KEY=
VIMEO_ACCESS_TOKEN=
RESEND_API_KEY=
PORTAL_FROM_EMAIL=
PORTAL_REPLY_TO_EMAIL=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_MESSAGING_SERVICE_SID=
```

`SUPABASE_SERVICE_ROLE_KEY`, `BUNNY_STREAM_API_KEY`, `VIMEO_ACCESS_TOKEN`, `RESEND_API_KEY`, and `TWILIO_AUTH_TOKEN` must stay server-side only.

## Email

Client invites and update notices are sent by:

```txt
/api/send-review-email
```

`PORTAL_FROM_EMAIL` must use a verified Resend sending domain. The client email button links back into the portal review route for that project.

## SMS

Optional SMS notices are sent by:

```txt
/api/send-sms
```

Use a Twilio Messaging Service for beta. Clients add a phone number and opt in during signup or later in Settings. Admins can then check SMS for those clients when sharing a project; clients without a saved phone number stay email-only.

## Upload Providers

### Bunny Stream

The browser asks:

```txt
/api/create-bunny-upload
```

The server creates or reuses a Bunny Stream collection named after the project, creates the video, returns temporary TUS credentials, and the browser uploads directly to Bunny.

### Vimeo

The browser asks:

```txt
/api/create-vimeo-upload
```

The server creates or reuses a Vimeo folder named after the project, creates a private Vimeo upload, returns the TUS upload link, and the browser uploads directly to Vimeo.

After either provider receives the upload, the portal can check provider processing status. If a transcode is still running, the admin can wait or save the version and come back after the provider finishes.

## Deploy

Push changes to GitHub, then deploy production with Vercel:

```sh
.tools/vercel-cli/node_modules/.bin/vercel --prod --yes
```

Production URL:

```txt
https://validate-delivery-portal.vercel.app
```

## Beta Notes

- Clients only see projects shared with their account.
- Admins can share projects, notify all clients, or send reminders only to clients who have not opened the latest version.
- Vimeo private videos may require Vimeo-side access permissions depending on account settings.
- Generated invite codes are email-bound and expire after 14 days.
