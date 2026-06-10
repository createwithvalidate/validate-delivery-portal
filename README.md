# Validate Delivery Portal

A first-pass client delivery portal for Validate video review, comments, approvals, version history, and future Vimeo/Bunny upload integrations.

## What is built

- Admin client dashboard
- Client project list
- Project detail view
- Video review page
- Version history
- Comment thread
- Approval action
- Client preview mode
- Create client/project/video/version flows
- Resend-ready client email notifications
- Bunny Stream upload handshake for browser video uploads
- Static Vercel deployment config

The prototype still has a browser `localStorage` fallback, but the beta account foundation is wired for Supabase Auth and the tables in `schema.sql`.

## Local preview

Because this is a static prototype, you can open `index.html` directly in a browser.

For a local server:

```sh
python3 -m http.server 3000
```

Then open `http://localhost:3000`.

## Replace the logo

Place the real Validate logo at:

```txt
assets/validate-logo.png
```

That file is used in both the login screen and the sidebar. PNG, SVG, or WebP will work, but if you use another format, update the two `assets/validate-logo.png` references in `index.html`.

## Deploy to GitHub and Vercel

1. Create a new GitHub repo.
2. Push this folder to that repo.
3. Import the repo in Vercel.
4. Use the default static project settings.
5. Add the Resend environment variables in Vercel before testing email.

Vercel will serve `index.html` at the project root.

## Resend email setup

The `Send latest to client` button posts to:

```txt
/api/send-review-email
```

That serverless function sends through Resend and keeps the API key out of the browser.

In Resend:

1. Go to `https://resend.com/domains`.
2. Add and verify the sending domain you want to use.
3. Create an API key.

In Vercel, add:

```txt
RESEND_API_KEY=re_...
PORTAL_FROM_EMAIL=Validate <delivery@your-verified-domain.com>
PORTAL_REPLY_TO_EMAIL=your-reply-address@your-verified-domain.com
```

`PORTAL_FROM_EMAIL` must use a domain that is verified in Resend.

## Bunny Stream setup

The `Upload new version` form can upload a selected video file to Bunny Stream.

The browser asks `/api/create-bunny-upload` for temporary upload credentials, then uploads directly to Bunny's TUS endpoint. This keeps the Bunny Stream API key out of client-side code and avoids pushing large video files through Vercel.

In Vercel, add:

```txt
BUNNY_STREAM_API_KEY=
BUNNY_STREAM_LIBRARY_ID=
```

`BUNNY_STREAM_API_KEY` is the API key from the specific Bunny Stream video library. `BUNNY_STREAM_LIBRARY_ID` is the numeric Video Library ID from that same Bunny Stream library.

## Backend upgrade path

## Supabase beta setup

Supabase project:

```txt
https://axvnifoamejuxxqhezwr.supabase.co
```

Signup rule:

```txt
Invite-only
```

First admin email:

```txt
henry@createwithvalidate.com
```

To turn on persistent accounts/data:

1. Open Supabase.
2. Go to `SQL Editor`.
3. Paste and run `schema.sql`.
4. Create an account on the portal using:
   - Email: `henry@createwithvalidate.com`
   - Invite code: `VALIDATE-ADMIN-BETA`
5. After sign in, Supabase will mark that profile as `admin`.

The login screen now supports:

- Sign in
- Create account from invite
- Admin/client mode toggle

The local UI still keeps a fallback state while we finish the full table-by-table data sync.

The next production pass should finish:

- Supabase reads/writes for every create/edit/delete action
- Admin invite sending through Resend
- Password reset
- Client-only RLS verification tests

Recommended environment variables:

```txt
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=only_for_server_routes_later
BUNNY_STREAM_LIBRARY_ID=
BUNNY_STREAM_API_KEY=
VIMEO_ACCESS_TOKEN=
RESEND_API_KEY=
PORTAL_FROM_EMAIL=
PORTAL_REPLY_TO_EMAIL=
```
