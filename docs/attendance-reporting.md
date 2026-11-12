# Sprint 7 — Live attendance and reporting

## Repository audit

Reviewed README/PRD, Prisma schema and prior migrations, Auth.js callbacks,
RBAC/event scope, invitation and guest services, QR access, check-in transactions,
public ticket lifecycle, existing dashboards/API conventions, unit tests and HTTP/browser suites.

Installed stack: Next.js 16.4.3 App Router with Cache Components, React 19.3.0,
TypeScript 5.9.3, Tailwind 4.3.3, Base UI 1.9.0/shadcn 4.22.1,
Prisma Client/CLI/pg adapter 7.10.1, Auth.js 5.0.0-beta.32, pg 8.23.1, Zod 4.6.7.
The local database server is PostgreSQL 18.6; existing connection configuration is retained.
The installed Next.js route-handler and server/client-component documentation
was read before implementation.

Actual model and access rules:

- `Invitation` is both the guest record and the invitation. There is no separate
  Guest model. `guestQuota` is the number of people permitted on that invitation.
- `Invitation.checkedInCount` is a cumulative counter; `checkedInAt` represents
  the first arrival. Neither is a count of invitation records.
- `CheckinLog` records each successful confirmed arrival, including count,
  method, operator, time and the server-issued idempotency nonce. It has no
  pending/failed state. Confirmation writes the counter and log atomically after
  validating quota, event state, assignment, verification and ticket state.
- Historical arrivals were backfilled by Sprint 5 and marked `legacy`. They
  remain included; the new UI labels them as historical rather than asserting
  an original scanning method.
- Public `PrecheckinRequest` tickets and cancellations/expiry are separate from
  attendance. They are never queried by the new reporting service. Confirmed
  public-ticket arrivals count through their ordinary `CheckinLog` only.
- Successful check-in logs provide an attendance audit trail; ticket records
  retain processing metadata. There is no general-purpose AuditLog model.
- Auth.js reloads the account on every session resolution and invalidates JWTs
  on account changes. The existing `eventScope` restricts clients to their active
  client organization and staff to assignments for active clients. Admins retain
  system-wide access, including historical events and inactive clients.
- Attendance timestamps use the existing PostgreSQL `timestamp(3)` UTC
  convention. The shared Prisma adapter forces UTC on every pooled connection;
  first-arrival SQL also explicitly writes UTC. Public ticket timestamps are
  already `timestamptz`. No attendance timestamps or counts are rewritten here.
- The earlier UI had a static attendance strip and bounded guest list. Event
  schedule input/display uses WIB. The Forest Green/Warm Ivory/Champagne design
  tokens, shared buttons, existing navigation and operational workflows remain.

## Implementation plan and decisions

The plan was presented before code changes: reuse confirmed logs, centralize
event-scoped reads, add a reporting timezone, integrate a polling dashboard in
the existing event detail, stream a protected CSV, then verify with the existing
test stack. No parallel attendance records or WebSocket infrastructure were added.

One snapshot endpoint supplies summary, activity and timeline together. Separate
requests for each would repeat authorization and risk visibly inconsistent
totals while arrivals are being recorded.

## Metrics and API

`GET /api/events/[eventId]/attendance` returns:

- `event`: name, current status, reporting timezone.
- `summary.invitations`: number of registered invitation/guest records.
- `summary.capacity`: sum of all invitation quotas, including unused places.
- `summary.attendees`: sum of confirmed log counts.
- `summary.arrivedInvitations`: distinct invitations with a confirmed log.
- `summary.remaining`: capacity minus confirmed attendees, floored at zero.
- `summary.percentage`: attendees / capacity × 100; zero when capacity is zero.
- `summary.latestCheckinAt`: latest log time, or null before the first arrival.
- `activity`: latest 20 records ordered by timestamp DESC, ID DESC; guest name,
  count, recorded method, historical flag and timestamp. Operator names appear
  only for admin/staff, with no email or account ID. Clients receive null.
- `timeline`: elapsed-time bucket size and per-bucket confirmed attendee counts.
- `refreshedAt`: server timestamp after the successful snapshot read.

All reads use one repeatable-read transaction. Event authorization occurs within
that transaction. Counts and timeline aggregate in PostgreSQL; no entire log
history is loaded into JavaScript. A nonempty snapshot uses five queries after
session authentication, independent of invitation count. Joins require both log
and invitation to belong to the requested event. No N+1 application queries.

The existing API wrapper provides 401 for anonymous sessions, 403 for forbidden
roles, 404 for inaccessible events, 400 for malformed UUIDs, and generic 500 errors.
Responses carry `Cache-Control: private, no-store`.

## Dashboard and timezone

The existing admin/client/staff event-detail routes contain the new attendance
section. Polling starts on mount, repeats 15 seconds after a request finishes,
and never overlaps requests. Requests time out after 10 seconds. Hiding the tab
clears the next timer; returning triggers refresh. Unmounting aborts the request,
clears timers and removes the visibility listener. No WebSockets are needed.

Initial loading, empty events, refresh progress, initial failures and stale data
have explicit states. Temporary network/server failures retain the previous
snapshot and successful-refresh timestamp. A 401/403/404 clears the dashboard
and stops polling. Manual refresh is available. No refresh success toast is used.

The bar chart shows attendees arriving in each interval, not cumulative totals.
Intervals start at 15 minutes and widen in 15-minute multiples for long histories
to keep at most 97 buckets. Buckets align to UTC elapsed time; labels use the
event's IANA timezone and include dates and UTC offsets in the detailed list.
This preserves events spanning midnight and repeated DST hours. Missing buckets
between real arrivals show zero. Empty events show an explanation, not fake data.

The chart is horizontally scrollable on small screens, with visible counts and
a keyboard-accessible numeric list. Activity is bounded and keyboard-scrollable.
Status is expressed in text, not color alone. Existing shared controls retain
44px touch targets and focus indicators.

`Event.timeZone` defaults to `Asia/Jakarta` for existing and new events. Admins
configure any valid IANA reporting zone in the event form. **Schedule entry remains
explicitly WIB**, preserving existing booking/date semantics; this setting changes
attendance display only. Storage and CSV timestamps remain UTC.

## CSV reporting

`GET /api/events/[eventId]/attendance/export` is available to administrators and
owning clients. Assigned staff can monitor attendance but cannot export.

Each invitation row contains event name/slug, scheduled UTC time, event status,
reporting timezone, generation time, stable report reference, guest name, quota,
confirmed count, absent/partial/full status, first confirmed time and latest
confirmed time. Empty events return a metadata row labelled as having no invitations.
Report references are truncated SHA-256 digests of invitation IDs, not QR codes
or raw internal IDs. No ticket secrets, contact details or staff identifiers are exported.

The CSV uses UTF-8 with BOM and CRLF, quotes every field, doubles embedded quotes,
and prefixes spreadsheet formula-like cells with an apostrophe, including dangerous
prefixes after whitespace/control characters. This applies to event fields too.
Names remain unmodified in the database.

Filename: `wedflow-attendance-{safe-event-slug}-{UTC-basic-timestamp}.csv`.

Export reads batches of 500 invitations using event/ID keyset pagination within
one repeatable-read transaction. Backpressure bounds server memory, and concurrent
invitation/check-in changes cannot mix snapshots across batches. Cancellation and
interruption fail the stream. The dashboard downloads only after the complete body
has arrived and displays a useful failure message without claiming success.

## Database and deployment

Two additive/compatible migrations are included:

1. Add the reporting timezone with the Jakarta default. No attendance backfill.
2. Replace the invitation event-only index with `(eventId, id)` for ordered CSV
   seeks. Its leading column also supports the previous event-only lookups.
   Existing `(eventId, createdAt, id)` log index supports recent activity, and the
   invitation/time log index supports report aggregation. No duplicate log indexes.

Apply before deploying the new application:

```sh
npx prisma migrate deploy
npm run build
```

Both migrations were applied to local PostgreSQL. Index creation uses a regular
transactional migration; schedule it appropriately for a large live installation.
The export route declares a 60-second maximum; its stream stops at 55 seconds and
the transaction has a 60-second timeout. Hosting must allow that duration.

## Verification

Executed successfully during implementation:

- `npm test`: 50 unit tests, including eight new attendance tests.
- `npm run test:attendance:e2e`: 56 HTTP/database/browser assertions. Real Auth.js
  accounts cover roles, event isolation, no-store responses, malformed IDs, zero
  capacity, public tickets, invalid confirmation, concurrent retries, partial
  family arrivals, timestamps, midnight, deterministic activity, 502-invitation
  CSV, escaping/privacy, concurrent export edits and aborted streams.
- Browser checks at 390px and 1440px: no document overflow, automatic polling,
  manual refresh, retained data after 503, recovery, hidden-tab pause/resume,
  access rejection and no browser exceptions. Screenshots were visually reviewed.
- `npm run test:attendance:migration`: isolated-schema, rollback-only verification
  of timezone backfill/default, preserved attendance/timestamps and export index.
- `npm run test:checkins:e2e`: 105 assertions plus browser checks.
- `npm run test:precheckins:e2e`: 139 assertions plus mobile browser checks,
  including cancellation, expiry, simultaneous operators and lost-response retry.
- `npm run lint`, `npm run typecheck`, `npm run build`.

The E2E scripts create random, isolated fixtures on a local server and clean up
their own rows. Use the existing test-server task on port 3100; set `AUTH_TEST_URL`
for another local port. Browser tests use installed Edge by default.

## Files changed

| Area | Files |
| --- | --- |
| Model/migrations | [schema](../prisma/schema.prisma), [timezone migration](../prisma/migrations/20261111000000_attendance_timezone/migration.sql), [export index](../prisma/migrations/20261112000000_attendance_export_index/migration.sql) |
| API | [snapshot route](../src/app/api/events/[eventId]/attendance/route.ts), [CSV route](../src/app/api/events/[eventId]/attendance/export/route.ts) |
| Attendance service | [queries/authorization](../src/features/attendance/service.ts), [metrics/time helpers](../src/features/attendance/model.ts), [CSV formatting](../src/features/attendance/csv.ts), [export stream](../src/features/attendance/export.ts) |
| Live UI | [dashboard](../src/features/attendance/dashboard.tsx), [poll lifecycle](../src/features/attendance/polling.ts), [event detail integration](../src/components/dashboard/event-detail.tsx) |
| Event timezone | [validation](../src/features/management/validation.ts), [form](../src/features/events/event-form.tsx), [event selection](../src/features/events/scope.ts), [edit page](../src/app/admin/events/[eventId]/edit/page.tsx) |
| Tests | [unit tests](../tests/attendance.test.ts), [integration/browser](../scripts/test-attendance-e2e.ts), [migration verification](../scripts/test-attendance-migration.ts), [scripts](../package.json) |
| Documentation | This document, [README](../README.md), [PRD](../PRD.md) |

## Limits and follow-up

- Polling is near-live, with a 15-second interval; it does not support offline use.
- The live list shows the latest 20 arrivals. The complete CSV summarizes each
  invitation with first/latest timestamps, rather than exporting every arrival.
- The browser download buffers the completed CSV as a Blob so interrupted streams
  cannot appear successful. Very large reports and exports exceeding the time
  budget need a background export/job workflow; no production load benchmark is claimed.
- There is no PDF export, general audit-log system, or new attendance reversal flow.
  Cancelling an event does not erase previously confirmed attendance.
- Existing overview pages/guest lists retain their current static behavior; the
  event attendance section is the new live source of confirmed-log metrics.
- Physical-device/network pilot testing remains operational follow-up. Automated
  mobile viewport checks are not a claim of testing physical phones.

Suggested commit: `feat(attendance): add scoped live dashboard and CSV reporting`.
No commit, push or merge was performed.
