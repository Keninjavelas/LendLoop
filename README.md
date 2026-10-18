# LendLoop

A peer-to-peer borrowing and lending management system built on the MERN stack. List the things you own, request the things you need, approve loans, record anything you have lent — even off-platform — and let priority-driven reminders chase the returns for you.

The project is a MongoDB CRUD demonstration: eight related collections, document references, embedded subdocuments, validation, indexes, aggregation pipelines, and multi-document transactions.

## Features

- Register and log in with a bcrypt-hashed password and a JWT stored in an HttpOnly cookie
- Create, read, update, and delete your own item listings (search, category filters, availability)
- Request to borrow an item with a proposed return date and a note
- Approve or reject incoming requests; approving opens a loan atomically
- Record a **manual lending entry** for anything you have handed over, whether or not it was ever listed on LendLoop and whether or not the borrower has an account
- Categories with a **default priority** that new entries inherit
- **Priority-driven reminder schedules** — low, medium and high each get their own set of offsets and channels
- Manual "send reminder now" with a template picker, a live preview and placeholder substitution
- Automatic reminders from a cron job, gated on recorded borrower consent, with a per-loan kill switch
- Move a deadline and re-arm the whole schedule; step a priority up or down; every change is written to an audit trail
- Track active, overdue, and returned loans in both directions
- Confirm returns as the lender, which puts the item back on the shelf
- Archive listings that have a loan history instead of deleting them, so past loans keep resolving
- Dashboard with live counts and an attention queue, plus an editable profile

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19 + Vite 8 |
| Styling | Tailwind CSS 4 (token-only, no config file) |
| Routing | React Router 7 |
| HTTP client | Axios |
| Backend | Node.js + Express 5 (ESM) |
| Database | MongoDB (Atlas or local) |
| ODM | Mongoose 9 |
| Auth | JWT + bcryptjs, HttpOnly cookie |
| Scheduling | node-cron |
| Mail | Nodemailer (SMTP, Resend-over-SMTP, or a local preview transport) |
| Icons / toasts | lucide-react, sonner |
| Dev server | nodemon, concurrently |

## Project structure

```
LendLoop/
├── client/                 React + Vite frontend
│   └── src/
│       ├── components/     layout, common, items, requests, loans, templates
│       ├── pages/          15 route-level screens
│       ├── context/        AuthContext
│       ├── hooks/          useAuth
│       ├── services/       axios instance + one module per API resource
│       ├── utils/          dates, class names, shared constants
│       └── index.css       design tokens (@theme) + base layer
├── server/
│   ├── scripts/            seed.js, migrate.js
│   └── src/
│       ├── config/         db.js, seedDefaults.js
│       ├── models/         User, Item, BorrowRequest, Loan, Category,
│       │                   ReminderTemplate, ReminderLog, LoanHistory
│       ├── controllers/    auth, item, request, loan, user, category,
│       │                   template, reminder
│       ├── routes/         /api/{auth,categories,items,loans,reminders,
│       │                   requests,templates,users}
│       ├── services/       email, whatsapp, reminder, deadline
│       ├── jobs/           reminderScheduler (node-cron)
│       ├── middleware/     protect, error handling, ObjectId validation
│       └── utils/          generateToken + cookie helpers, renderTemplate, constants
└── package.json            root scripts that run both apps
```

## Getting started

### 1. Prerequisites

- Node.js 20 or newer
- Access to a MongoDB instance (Atlas cluster, or a local container — see below)

### 2. Database

**MongoDB Atlas (recommended for deployment):** create a free cluster, add a database user, allow your IP, and copy the connection string.

**Local Docker:** approving a request writes to four documents in one transaction, and transactions require a replica set. A single-node replica set is enough:

```bash
docker run -d --name lendloop-mongo -p 27017:27017 mongo:7 --replSet rs0
docker exec lendloop-mongo mongosh --quiet --eval "rs.initiate()"
```

### 3. Environment variables

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

`server/.env`

| Variable | Purpose |
| --- | --- |
| `PORT` | API port (default `5000`) |
| `MONGODB_URI` | Connection string, e.g. `mongodb://localhost:27017/lendloop?replicaSet=rs0` |
| `JWT_SECRET` | Random string of at least 32 characters. Startup rejects the example placeholder |
| `CLIENT_URL` | Allowed CORS origin(s), comma-separated. Trailing slashes are ignored |
| `NODE_ENV` | `development`, `test` or `production` |
| `SERVE_CLIENT` | `true` serves `client/dist` with SPA deep-link fallback; `false` is API-only. Defaults to `true` in production, otherwise `false` |
| `TRUST_PROXY` | Hop count (`1`) or `true` (one hop) when a reverse proxy terminates HTTPS. Leave blank when directly exposed |
| `AUTH_RATE_LIMIT_WINDOW_MS` / `AUTH_RATE_LIMIT_MAX` | Fixed-window limit for login and registration per IP (default 20 attempts / 15 minutes) |
| `REMINDER_SCHEDULER_ENABLED` | `false` stops the cron job; manual sends still work (default `true`) |
| `REMINDER_CRON` | node-cron expression for the reminder pass (default `* * * * *`, every minute) |
| `REMINDER_TIMEZONE` | IANA timezone for the cron expression; blank uses the server clock |
| `MAIL_DRIVER` | `preview` (render and log, never send), `resend`, or anything else for plain SMTP |
| `MAIL_FROM` | From header, e.g. `LendLoop <no-reply@example.com>` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` | Generic SMTP provider. `SMTP_SECURE=true` only for port 465 |
| `RESEND_API_KEY` / `RESEND_HOST` / `RESEND_PORT` / `RESEND_SECURE` | Resend over SMTP; the SMTP user is always the literal string `resend` |

`client/.env`

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | API base URL, baked in at build time. Defaults to `/api` for same-origin serving. Use a full URL only when the built SPA calls a different origin |

`.env` files are gitignored. Never expose `MONGODB_URI`, `JWT_SECRET` or any mail credential to the frontend — the client only ever receives `VITE_API_URL`.

**Driver precedence.** `MAIL_DRIVER=resend` with a `RESEND_API_KEY` wins; otherwise `MAIL_DRIVER=preview` forces the local stream transport; otherwise a set `SMTP_HOST` is used; otherwise it falls back to preview. With no mail provider configured the reminder pipeline still runs end to end — messages are rendered and logged with status `preview` rather than dropped, and the UI says so.

### 4. Install and run

```bash
npm run install:all   # root + server + client dependencies
npm --prefix server run seed   # shared categories + reminder templates (idempotent)
npm run dev           # API on :5000 and Vite on :5173 together
```

Open http://localhost:5173.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run install:all` | Installs dependencies for the root, server, and client |
| `npm run dev` | Runs the API and the client concurrently |
| `npm run dev:server` | API only, with nodemon reload |
| `npm run dev:client` | Vite dev server only |
| `npm run build` | Production build of the client into `client/dist` |
| `npm start` | Runs the API with plain node |
| `npm --prefix server test` | Backend integration + unit suite against `MONGODB_URI_TEST` |
| `npm --prefix client test` | Client utility tests (lending form, dates) |
| `npm --prefix server run seed` | Inserts the six shared categories and six reminder templates |
| `npm --prefix server run migrate` | Upgrades a pre-priority database (see below) |

**Seeding** is insert-only and idempotent: it checks for an existing row before inserting, and swallows the duplicate-key race. Re-running it never overwrites a default priority a lender has since edited.

**Migration** is only needed for a database created before categories and priorities existed. It seeds first, then drops the stale index definitions Mongoose will not replace in place, renames `borrowedAt` → `lentAt` on the raw collection, maps legacy free-text item categories onto the six shared ones (anything unrecognised falls through to `Other`), backfills each loan's `itemName`, `categoryId`, embedded `borrower`, `origin`, `priority` and `reminders`, re-arms every schedule, and finally rebuilds the item and loan indexes from the current schemas. Existence checks read raw documents on purpose — the model applies schema defaults on load, which would make an unmigrated row look already filled in.

## API

All endpoints are prefixed with `/api`. Protected routes read the user from the signed cookie, never from a client-supplied id. `GET /api/health` is unauthenticated and reports database connectivity.

### Auth

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Register and sign in |
| POST | `/api/auth/login` | Sign in |
| POST | `/api/auth/logout` | Clear the auth cookie |
| GET | `/api/auth/me` | Current user |

### Borrowers

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/borrowers` | Account-linked borrowers you have lent to (`borrowers`) plus each unmerged manual snapshot (`manualEntries`), with counts. `q` searches name, email and phone |
| GET | `/api/borrowers/:id` | One account borrower's history with you. Returns 404 when you have never lent to that account, so another lender's relationships stay invisible |

Manual snapshots are never merged with each other or with an account, even when name, email and phone match. A new entry can only set `borrowerId` for an account this lender has already lent to; otherwise the borrower details stay a manual snapshot.

### Categories

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/categories` | Shared categories plus your own |
| POST | `/api/categories` | Create a personal category |
| PATCH | `/api/categories/:id` | Rename or change the default priority |
| DELETE | `/api/categories/:id` | Delete your own category |

Shared categories (`ownerId: null`, `isSystem: true`) ship with LendLoop and cannot be edited or deleted through the API; the client renders their controls disabled.

### Items

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/items` | List and search (`q`, `categoryId`, `status`); returns `items`, `total`, and per-category counts |
| POST | `/api/items` | Create a listing |
| GET | `/api/items/mine` | Your listings, with pending request counts |
| GET | `/api/items/:id` | Item details |
| PATCH | `/api/items/:id` | Edit your listing |
| DELETE | `/api/items/:id` | Delete, or archive when a loan history exists |

Listing is public so the landing page can send a signed-out visitor straight to Explore. `/mine` is registered before `/:id` so it is never swallowed by the parameter route.

### Requests

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/requests` | Request to borrow an item |
| GET | `/api/requests/incoming` | Requests on your items (`status`, `itemId`); each carry `borrowerHistory` computed only from your own loans |
| GET | `/api/requests/outgoing` | Requests you have sent (`status`, `itemId`) |
| PATCH | `/api/requests/:id/approve` | Approve and open the loan |
| PATCH | `/api/requests/:id/reject` | Reject |
| PATCH | `/api/requests/:id/cancel` | Cancel your own pending request |

### Loans

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/loans` | Your loans (`role=lent\|borrowed`, `status`, `priority`, `overdue=true`, `q`, `borrowerId`, `categoryId`, `from`, `to`, `sort=attention\|due\|priority\|newest\|oldest\|borrower`). Date-only `from`/`to` are inclusive calendar days in UTC |
| POST | `/api/loans` | Create a manual lending entry |
| GET | `/api/loans/:id` | Loan details, restricted to the two parties |
| PATCH | `/api/loans/:id` | Reminder settings: enabled, channels, frequency, template mode, custom message, overdue cadence |
| PATCH | `/api/loans/:id/deadline` | Move the due date and re-arm the schedule |
| PATCH | `/api/loans/:id/priority` | Change priority (records `prioritySource: manual`) |
| PATCH | `/api/loans/:id/category` | Change the category |
| PATCH | `/api/loans/:id/return` | Lender confirms the item came back |
| GET | `/api/loans/:id/history` | Audit trail for that entry |
| GET | `/api/loans/:id/reminders` | Reminder logs for that entry |
| POST | `/api/loans/:id/reminders` | Send one now (manual mode) |
| GET | `/api/loans/:id/reminders/preview` | Render a message without sending it |
| GET | `/api/loans/:id/reminders/schedule` | Upcoming and already-sent slots |

Every loan response is passed through `decorate`, which adds three derived fields: `isOverdue`, `deliveryChannels` (the channels that are actually usable right now) and `channelReadiness` (per-channel `selected` / `consented` / `hasContact`, so the UI can explain *why* a channel is unavailable).

### Reminders

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/reminders` | Your reminder logs (`channel`, `mode`, `status`, `loanId`, `from`, `to`), newest first, capped at 200 |
| GET | `/api/reminders/overview` | Control-centre summary, next scheduled slots, blocked entries with missing-channel reasons, recent failures and recent activity |
| POST | `/api/reminders/:id/retry` | Retry a `failed` attempt or regenerate a `link`. Submitted and preview logs are rejected so a message is never duplicated |
| POST | `/api/reminders/run` | Fire the scheduler pass on demand, scoped to your own entries. Kept for automation; not shown as a primary UI control |

### Insights

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/insights` | Snapshot counts plus range-bound lending, returns, on-time rate, monthly volume, category mix and reminder activity (`from`, `to`; default last 90 days) |
| GET | `/api/insights/export` | CSV of the same range's lending entries. Privacy-minimised (no email/phone) and formula-injection neutralised |

Ranges are inclusive calendar days. The on-time rate is `null` until five returns exist in the range; `smallSample` and `sampleSize` explain why. Closed records without a return timestamp are reported separately as `missingTimestampClosed` rather than guessed as on time or late. `to` earlier than `from`, an impossible date, or a range over three years returns 400.

### Templates

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/templates` | Shared templates plus your own (`scope`, `priority`) |
| POST | `/api/templates` | Create a template |
| PATCH | `/api/templates/:id` | Edit your own |
| DELETE | `/api/templates/:id` | Delete your own |

### Profile

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/users/me` | Your profile |
| PATCH | `/api/users/me` | Update name and phone (email is the login identifier and is not editable) |

## Data model

Eight collections in the `lendloop` database, related by ObjectId references.

**users** — `name`, `email` (unique, lowercase), `passwordHash` (`select: false`), `phone`, timestamps.

**items** — `ownerId`, `title`, `description`, `categoryId`, `condition` (`New` | `Good` | `Fair`), `imageUrl`, `status` (`available` | `borrowed` | `archived`), timestamps.

**requests** — `itemId`, `borrowerId`, `ownerId`, `message`, `requestedReturnDate`, `status` (`pending` | `approved` | `rejected` | `cancelled`), timestamps.

**loans** — `origin` (`request` | `manual`), `requestId`, `itemId` (null for an entry recorded against something never listed), `itemName`, `description`, `categoryId`, `lenderId`, `borrowerId` (null when the borrower has no account), an embedded `borrower` subdocument (`name`, `email`, `phone`, `consent`), `lentAt`, `dueDate`, `returnedAt`, `status` (`active` | `returned`), `priority` (`low` | `medium` | `high`), `prioritySource` (`category` | `manual`), `notes`, and an embedded `reminders` subdocument, timestamps.

**categories** — `name`, `description`, `defaultPriority`, `ownerId` (null for a shared category), `isSystem`, timestamps.

**reminderTemplates** — `name`, `scope` (`priority` | `category` | `general`), `priority`, `categoryId`, `ownerId`, `isSystem`, `subject`, `body`, timestamps. A `placeholders` virtual lists the keys the template actually uses, derived by regex so the documented list cannot drift from the renderer.

**reminderLogs** — `loanId`, `lenderId`, `channel`, `mode` (`manual` | `automatic`), `dedupeKey`, `scheduleSlot`, `templateId`, `templateName`, `recipient`, `subject`, `body`, `status` (`sent` | `preview` | `link` | `failed`), `provider`, `providerMessageId`, `link`, `error`, `triggeredBy`, `sentAt`, timestamps.

**loanHistory** — `loanId`, `actorId`, `kind` (`created` | `deadline` | `priority` | `category` | `status` | `reminders` | `borrower` | `notes`), `field`, `from`, `to`, `reason`, timestamps.

### Indexes

Unique user email. Item owner, `status`+`categoryId`, and a text index on title and description. Request lookups by item and by each party. Loan lookups by lender, borrower, `status`+`dueDate`, `lenderId`+`priority`+`dueDate`, `categoryId`, and the scheduler cursor `status`+`reminders.enabled`+`reminders.nextDueAt`. Reminder logs by loan and by lender.

Three partial unique indexes act as database-level safeguards rather than application conventions:

- one pending request per borrower per item
- at most one active loan per item — guarded with `itemId: { $type: 'objectId' }` so unlisted manual entries, whose `itemId` is null, are excluded from the uniqueness check
- one reminder log per loan per `dedupeKey` — guarded with `dedupeKey: { $type: 'string' }` so manual sends, which have no slot, are never deduplicated

Category names are unique per owner, which is what lets a shared category and a personal category carry the same name.

Overdue is never stored. It is derived from an active loan whose `dueDate` is in the past.

## Priority and reminders

### Priority drives the schedule

A new entry inherits its category's `defaultPriority`. `prioritySource` records whether the value still tracks the category (`category`) or was overridden by the lender (`manual`) — so a later change to a category default never silently rewrites a priority someone set deliberately.

| Priority | Offsets from the due date | Default channels |
| --- | --- | --- |
| `low` | 1 day before | email |
| `medium` | 2 days before, and on the day | email |
| `high` | 3 days before, 1 day before, and on the day | email + WhatsApp |

Once the due date passes, overdue reminders repeat every `overdueIntervalHours` (default 48) up to `maxOverdueReminders` (default 5, hard cap 50).

`reminders.frequency` selects where the offsets come from: `manual` disables automation entirely (the lender can still send by hand), `daily` follows the priority schedule above, and `custom` uses `customOffsetsDays`.

### Slots, cursors and dedupe

Each reminder is a **slot** keyed by `pre:<offset>:<dueDateISO>` or `overdue:<n>:<dueDateISO>`. Because the resolved due date is baked into the key, postponing a deadline arms a fresh set of reminders for the new date while a given date-and-slot combination can never be sent twice.

Two independent layers stop a duplicate message:

1. `reminders.nextDueAt` is the scheduler cursor, indexed, and advances past each slot it consumes. A second cron pass over the same window scans the loan and finds nothing due.
2. The `dedupeKey` on each log is `<slotKey>:<channel>`, backed by the partial unique index. Even if the cursor is rewound, the insert fails rather than messaging the borrower again.

`nextDueAt` is set to `null` when delivery is impossible — the entry is closed, automation is off, the frequency is `manual`, or no channel is usable — so the scheduler's index scan never picks up a loan it could not message.

A slot missed by more than **24 hours** is skipped rather than sent late (`CATCH_UP_WINDOW_MS`). An offline server or a backdated entry therefore cannot dump every stale reminder on one borrower at once. Overlapping scheduler runs are refused outright, so the logs stay honest about what actually happened.

### Consent gating

A channel is usable only when **all three** hold: the lender selected it, the borrower consented to it, and there is valid contact detail to reach them on (a well-formed email; a phone number with at least 8 digits once normalised to `wa.me`'s digits-only format).

Consent is recorded **per lending entry** on the embedded `borrower.consent` subdocument (`email`, `whatsapp`, `note`, `recordedAt`), not on the user account — a manual entry's borrower may have no account at all. **Priority never forces a channel.** A high-priority entry whose borrower declined WhatsApp falls back to email, and one with no usable channel sends nothing at all; `channelReadiness` in the API response tells the UI exactly which of the three conditions failed.

### Templates and placeholders

A message is assembled by `reminders.templateMode`, which selects a strategy rather than a fallback chain:

- `priority` — the template scoped to the entry's priority
- `category` — the template scoped to the entry's category; if there is none, resolution falls through to the priority template
- `custom` — the lender's own `customMessage`, paired with the built-in subject line

Within a scope the lender's own template wins over a shared one. An explicit `templateId` — what the manual send modal's picker supplies — overrides the mode entirely. If nothing matches, a built-in default subject and body are used, so a reminder is never sent as an empty string.

Supported placeholders:

`{borrowerName}` `{itemName}` `{dueDate}` `{dueDateTime}` `{category}` `{priority}` `{lenderName}` `{daysUntilDue}` `{duePhrase}`

Unknown placeholders are left untouched rather than blanked, so a typo stays visible to the lender. HTML bodies are generated from the plain text with escaping applied, never by interpolating raw template text into markup.

### Delivery honesty

The system never claims a delivery it did not make. Each log's `status` says exactly what happened:

| Status | Meaning |
| --- | --- |
| `sent` | A message actually left the process through SMTP or Resend |
| `preview` | No mail provider is configured — the message was rendered and logged, not sent |
| `link` | WhatsApp produced a prefilled `wa.me` link the lender must open and press send on. There is no WhatsApp Business API integration and no automated delivery |
| `failed` | The provider rejected or could not complete the send; `error` carries the reason |

The UI keeps these visually distinct — green for `sent`, blue for `preview`, amber for `link`, red for `failed` — and spells out the preview and link cases in words next to the badge.

## Business rules

- You cannot borrow your own item, and only `available` items accept requests
- A borrower cannot hold two pending requests for the same item
- Only the owner approves or rejects; only the borrower cancels
- Approving runs in a transaction: the request is approved, the item becomes `borrowed`, a loan is created, and every competing pending request is rejected
- Only the lender confirms a return; the loan closes with `returnedAt` and the item becomes `available` again
- Requested return dates must be in the future
- Items with an active loan cannot be deleted; items with loan history are archived rather than deleted so historical loans still resolve
- Only the lender can change a loan's deadline, priority, category or reminder settings, and a returned entry can no longer be rescheduled
- Changing a deadline or priority writes a before/after pair to `loanHistory`. The reminders diff records only the fields the lender controls — the scheduler's own `nextDueAt`, `lastSentAt` and `autoSentCount` are excluded, because the save itself immediately invalidates them and recording them would freeze a stale value into the audit trail

## Deployment

LendLoop runs as one Node process plus MongoDB. The production build is a static SPA in `client/dist` that Express can serve itself, with `/api/*` remaining JSON.

### 1. Build and configure

```bash
npm run install:all
npm run build                     # client/dist
cp server/.env.example server/.env
```

In `server/.env` for production:

- `NODE_ENV=production`
- `MONGODB_URI` — Atlas or another MongoDB that supports transactions (replica set). A standalone `mongod` cannot approve requests or create loans
- `JWT_SECRET` — at least 32 random characters; startup refuses the example placeholder
- `CLIENT_URL=https://your-host.example` — the exact browser origin(s), comma-separated
- `SERVE_CLIENT=true` (or leave it unset; production defaults to true) so Express serves the SPA and deep links such as `/loans/123` fall back to `index.html`
- `TRUST_PROXY=1` when exactly one reverse proxy terminates TLS. Leave blank when the API is directly reachable
- `REMINDER_SCHEDULER_ENABLED=true` on **one** instance only (see below)
- Real mail provider variables if reminders should leave the process. `MAIL_DRIVER=preview` is honest but delivers nothing

Start it with:

```bash
npm start
```

Startup validates the environment, refuses weak or placeholder secrets, and prints warnings for a localhost `CLIENT_URL`, an unavailable mail provider, or preview mode in production. `GET /api/health` returns 200 only while MongoDB is connected. `SIGTERM`/`SIGINT` stop the cron job, close the HTTP server and disconnect MongoDB; connections still open after 10 seconds force an exit.

### 2. HTTPS, cookies and origins

Production auth cookies are `HttpOnly`, `SameSite=Lax` and `Secure`, so the public origin must be HTTPS. The recommended topology is one origin with Express serving both the SPA and `/api`, which keeps the cookie first-party. Build the client with `VITE_API_URL=/api` (the default) for that topology. If the SPA is on a separate static host, build it with a full `VITE_API_URL`, configure that host to rewrite every non-asset path to `index.html`, set `SERVE_CLIENT=false`, and point `CLIENT_URL` at the static origin. A truly cross-site cookie (`SameSite=None`) is not supported here because it would require a CSRF token.

### 3. Scheduler ownership

The reminder cron runs inside the API process. Run exactly one scheduler-enabled instance. The database's partial unique index prevents duplicate reminder **logs**, but two scheduler instances could both dispatch a message before either log insert lands. Additional API replicas should set `REMINDER_SCHEDULER_ENABLED=false`; manual sends continue to work. The in-memory auth rate limiter is also per process, so a multi-process deployment would need a shared store to enforce one global bucket.

### 4. Pre-deployment checks

```bash
npm --prefix server test          # requires MONGODB_URI_TEST ending in _test
npm --prefix client test
npm run build
```

Then rehearse with production env values against a disposable database and confirm: `/api/health`, login/logout, a deep link refresh, an approve/return transaction, the reminders overview and a CSV download. Deployment-ready is not the same as provider-verified: real email delivery, Atlas connectivity, TLS termination and off-host backups can only be confirmed in the target environment.

## Security

- Passwords hashed with bcrypt (12 rounds) and never returned by the API
- JWT in an HttpOnly, SameSite=Lax cookie (Secure in production) — no token in localStorage
- SameSite=Lax plus a strict CORS origin allowlist is the CSRF mitigation; switching the cookie to `SameSite=None` for a cross-site deployment requires adding a CSRF token
- Ownership is enforced in the query filter as well as in the controller
- Login and registration are rate limited per IP (20 attempts / 15 minutes by default) so credential stuffing cannot run unbounded
- Responses set `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, a restrictive `Permissions-Policy` and HSTS in production
- Startup rejects missing, short or placeholder signing secrets and malformed database URLs; production static serving only ever reads `client/dist`
- JSON bodies capped at 100kb, ObjectIds validated, consistent JSON error envelope, 5xx details hidden in production
- `POST /api/reminders/run` is scoped to the caller's own entries, so it can never be used to message someone else's borrower
- Mail credentials live only in `server/.env` and are read inside `emailService`; none of them reach a response body or the client bundle

## Design system

The client is dark-only, and every colour is a token declared once in `client/src/index.css` under Tailwind 4's `@theme`. There is no Tailwind config file and no light theme.

| Token | Value | Role |
| --- | --- | --- |
| `canvas` | `#0C0F0E` | Page background |
| `surface` | `#151B17` | Cards and panels |
| `raised` | `#1B231D` | Inputs, insets, hover states |
| `line` / `line-soft` | `#29362D` / `#202A23` | Borders and inner dividers |
| `ink` / `muted` / `faint` | `#F4F7F5` / `#94A39B` / `#7D8C84` | Text, three steps down |
| `primary` | `#17E88A` | Actions and active states only |
| `primary-ink` | `#06110C` | Type that sits **on** a solid accent fill — white would be 1.6:1 |
| `pending` | `#F0B429` | A deadline that needs attention |
| `danger` | `#FF6B6B` | Overdue, rejected, or failed — never decorative |
| `info` | `#56B4E9` | Informational, including "rendered but not sent" |

Space Grotesk (`font-display`) carries headings and the `lendloop.` wordmark; Inter (`font-sans`) carries body copy, forms and dense data. Three custom utilities — `panel`, `inset-panel`, `eyebrow` — keep every card on the same radius, border and fill, and every small uppercase label on the same tracking. Separation comes from 1px borders and stepped fills rather than shadows. `color-scheme: dark` on `:root` makes native date pickers, select popups and scrollbars render dark.

Every token pair was checked against WCAG AA for the size it is used at, including `faint`, which is reserved for 11px eyebrows and placeholders and therefore has to clear 4.5:1.

Desktop and mobile are deliberately not the same layout scaled down. Desktop gets a narrow persistent sidebar, a spacious main workspace and contextual side panels; mobile gets compact cards, a five-item bottom navigation bar and modals that render as bottom sheets.

## Demo accounts

Created while verifying the full borrowing workflow against a local database:

| Role | Email | Password |
| --- | --- | --- |
| Lender | `amara@lendloop.demo` | `lender-pass-123` |
| Borrower | `ben@lendloop.demo` | `borrower-pass-456` |

Amara lists a scientific calculator, Ben requests it, Amara approves (loan opens, item becomes `borrowed`), then confirms the return (loan closes, item becomes `available`). Both users see the transaction in their own Requests and Loans history.
