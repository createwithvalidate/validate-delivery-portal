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
- Static Vercel deployment config

The prototype persists demo data in browser `localStorage`.

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

## Backend upgrade path

The next production pass should replace `localStorage` with:

- Supabase Auth
- Supabase Postgres tables from `schema.sql`
- Vercel environment variables for provider keys
- Serverless routes for Bunny Stream uploads
- Serverless routes for Vimeo upload sessions
- Transactional emails for client notifications

Recommended environment variables:

```txt
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
BUNNY_STREAM_LIBRARY_ID=
BUNNY_STREAM_API_KEY=
VIMEO_ACCESS_TOKEN=
RESEND_API_KEY=
PORTAL_FROM_EMAIL=
PORTAL_REPLY_TO_EMAIL=
```
