# WedFlow UI/UX — Sprint 2

Branch: `redesign/guest-experience`. Scope: operational UI and the guest journey.

## Audit before implementation

The working tree was clean. README, PRD, Sprint 1 documentation, the installed
Next.js 16.4.3 server/client and loading guides, route files, role guards, event
scoping, guest service/validation, QR/print contracts, check-in verification and
retry UI, public ticket flows, and unit/browser/integration harnesses were reviewed.

Sprint 1 was already present: forest/ivory/champagne root tokens, Geist and
Cormorant typography, responsive dashboard shell, Base UI dialogs and tabs,
44 px shared controls, reduced motion and semantic status colors. No second
theme or dependency was needed.

| Experience | Existing friction | Implementation plan |
| --- | --- | --- |
| Guests | Seven columns, private codes and seven actions compete with names; one empty message serves both empty and filtered lists | Keep search/filter/sort/pagination; prioritize name/quota/attendance; group actions; distinguish empty states |
| Event detail | Staff assignment appears before reception; workflows are stacked without section navigation | Add role-aware section links, reception first, a bounded guest preview and a settings section |
| Invitation QR | Repeated download/print controls crowd rows; QR codes compete with private token text; print copy incorrectly claims one check-in only | Compact preview entry point, contextual actions in the dialog, collapsed fallback code, accurate print instructions |
| Public pre-check-in | Uses separate hardcoded colors and a dashboard-like card; ticket handoff is understated | Use shared ivory/editorial styling, two-step guidance, explicit verification requirement and expiry status |
| Staff & queue | Success and errors look alike; quota is not prominent; cancellation is inline | Strong server-confirmed feedback, quota/count controls, recoverable errors and a cancellation dialog |

## Actual routes and access

| Route | Access and capabilities |
| --- | --- |
| `/admin/events/[eventId]` | Super Admin: overview, check-in/queue when active, guest preview, public QR when event/client active, edit and staff assignment |
| `/admin/events/[eventId]/guests` | Super Admin: existing CRUD, search, attendance filters, sorting, 20-row pagination, CSV preview/confirmation, invitation QR |
| `/admin/events/[eventId]/guests/[guestId]` | Super Admin: invitation details and actions |
| `/client/events/[eventId]` | Client: existing scoped, read-only event and guest information |
| `/staff/events/[eventId]` | Assigned Staff: event context, check-in/queue when active, existing guest preview |
| `/e/[eventSlug]/checkin` | Public: generic ticket request and receipt, without invitation search or match disclosure |

Navigation uses existing routes and native in-page anchors. QR invitations are
managed through the guest route; check-in and queue remain in event detail.
No separate reports, settings, or check-in routes were invented. All existing
server authorization and event scopes remain unchanged.

## Implementation and reused components

- [Guest pages](../src/features/guests/guest-pages.tsx): contextual event/count
  header, primary Add Guest, secondary CSV import, full-width mobile filters,
  a five-column desktop table, labeled stacked rows below 768 px, stable record
  references to distinguish duplicate names, and separate empty/search states.
  Guest codes remain searchable; details and QR provide their authorized views.
- [Guest actions](../src/features/guests/guest-actions.tsx): edit/delete remain
  real API mutations. Delete has an explicit destructive confirmation and an
  inline failure message. Checked-in invitations explain why removal is disabled.
- [CSV import](../src/features/guests/import-dialog.tsx): two visible stages,
  validation counts, an explicit unsaved-preview notice, duplicate-name consent,
  and the existing all-or-nothing confirmation and success feedback.
- [Event detail](../src/components/dashboard/event-detail.tsx): metadata and
  status header, native section navigation, compact attendance totals, operational
  check-in, public QR actions, a scrollable guest preview and existing settings.
  Client and Staff controls still follow their original capabilities.
- [QR actions](../src/features/invitations/qr-actions.tsx): reusable `compact`
  variant for lists, loading placeholder, retry, event/guest preview, collapsed
  backup code, download and print instructions, and focus return to the opener.
  [Print template](../src/features/invitations/print.ts) retains QR generation,
  private response headers, CSP, escaping, decoding-before-print and A4 sizing.
- [Public page](../src/app/e/[eventSlug]/checkin/page.tsx) and
  [form](../src/features/precheckins/public-form.tsx): editorial welcome,
  large form controls, focused ticket heading, queue code, device-local expiry,
  handoff instructions and “Tiket ini bukan bukti kehadiran. Verifikasi petugas
  tetap diperlukan.” The existing backup token remains in a disclosure, never
  in the URL. The [error page](../src/app/e/[eventSlug]/checkin/error.tsx) uses
  the same design tokens.
- [Check-in](../src/features/checkins/checkin-form.tsx): visible remaining quota,
  suggested arrival counts, integer input and validation guidance, existing
  explicit identity confirmation, success/error differentiation and search retry.
  Success only follows a successful server response. Uncertain transactions keep
  their original payload and lock count/identity until the same transaction retries.
- [Queue](../src/features/precheckins/queue.tsx): existing queue-code/token lookup,
  text statuses, candidate selection and identity reminder, plus separate close
  and cancel actions and a modal destructive confirmation with inline errors.

Reused: `PageHeading`, `EmptyState`, `Pagination`, `StatusBadge`, `AttendanceBadge`,
`Button`, `Input`, `Label`, `Table`, Base UI `Dialog`/`Tabs`, `FormField`,
`ConfirmDialog`, `InvitationQrActions`, `StaffAssignmentForm`, and Sonner feedback.
`ConfirmDialog` gained optional destructive styling, confirm text and inline error
props, while retaining defaults for its other callers. New CSS is limited to
event section links and mobile guest-table layout in the existing token sheet.
No additional production component library or dependencies were introduced.

## Accessibility and responsive QA

- Native section links and disclosures, visible focus, and inherited reduced-motion rules.
- The responsive guest table retains explicit table/row/cell roles and column headers.
  Long unbroken names wrap inside their own cells; names are not truncated.
- Dialogs keep Base UI focus containment, Escape behavior and viewport scrolling.
  Destructive dialogs initially focus Cancel for keyboard/pointer use.
- Form labels and associated descriptions, invalid count state, alert feedback,
  live success/expiry status and focus transfer to the public receipt heading.
- Existing 44 px controls; reception and arrival buttons are at least 48 px,
  public name input is 56 px. Status always has visible text.
- The guest preview is a labeled, keyboard-focusable scroll area. Section links
  respect the existing header scroll offset.
- Viewport matrix: 320, 390, 768, 1024 and 1440 px, covering guests, event detail,
  QR dialog, public welcome/ticket, staff and queue. Dialog bounds, cell overflow,
  role-specific actions, duplicate identities, empty results and pagination are tested.

## Visual evidence

Screenshots use disposable test accounts/events; no production mock data is added.
Generate with `$env:GUEST_SCREENSHOTS='1'; npm run test:ui` on the local test server.
The original Sprint 1 screenshots are preserved. There is no new before-image set;
the audit table above records the source-based before/after comparison.

| Experience | Previews |
| --- | --- |
| Guests | [390 px](./guest-experience/guests-390.png), [1440 px](./guest-experience/guests-1440.png) |
| Event | [390 px](./guest-experience/event-390.png), [1440 px](./guest-experience/event-1440.png) |
| QR preview | [390 px](./guest-experience/qr-390.png), [1440 px](./guest-experience/qr-1440.png) |
| Public | [Welcome](./guest-experience/welcome-390.png), [Ticket](./guest-experience/ticket-390.png) |
| Staff | [Check-in](./guest-experience/staff-390.png), [Queue](./guest-experience/queue-390.png) |

## Verification

The aggregate `npm run test` script now runs the six existing unit test files.
The new [Sprint 2 browser checks](../scripts/test-guest-experience-ui.ts) run within
the existing [UI harness](../scripts/test-ui-redesign.ts), sharing its UUID-scoped
fixtures and cleanup. All application mutations in the new checks use existing
HTTP APIs. Network failures are simulated only in the browser test harness.

| Command / check | Actual outcome |
| --- | --- |
| `npm run typecheck` | Passed, exit 0 |
| `npm run lint` | Passed, exit 0 |
| `npm run build` | Passed; all 38 pages generated |
| `npm run test` — run 1 | 42 passed, 0 failed, exit 0 |
| `npm run test` — run 2 | 42 passed, 0 failed, exit 0 |
| `npm run test` — run 3 | 42 passed, 0 failed, exit 0 |
| `npm run test` — run 4 | 42 passed, 0 failed, exit 0 |
| `GUEST_SCREENSHOTS=1 npm run test:ui` | Passed; 185 baseline assertions plus Playwright expectations and the new Sprint 2 interaction/viewport checks |
| `QR_BROWSER_TESTS=1 npm run test:guests:e2e` | 138 assertions passed; QR preview, refresh, PNG decode/download, print button and one-page PDF passed |
| `npm run test:checkins:e2e` | 105 HTTP assertions passed |
| `CHECKIN_BROWSER_ONLY=1 npm run test:checkins:e2e` | Passed: camera denial/manual fallback, explicit consent, lost-response retry, camera switching/cleanup, real QR decoding and fuzzy search |
| `npm run test:precheckins:e2e` | 139 integration assertions plus guest/staff browser flow passed |
| `QR_BROWSER_TESTS=1 npm run test:auth:e2e` | 141 auth/management assertions plus QR HTTP/browser checks passed |
| `git diff --check` | Passed; only repository LF/CRLF conversion notices |

Browser/integration checks ran against the local production server at
`http://localhost:3100`, launched with the existing test-server task and
`AUTH_URL=http://localhost:3100`. Shell environment assignments above use POSIX
notation for brevity; in PowerShell set `$env:NAME='value'` before the command.
The harness cleans up its temporary accounts, events, invitations and tickets.
Final screenshots were visually reviewed for all five target experiences.

During QA, screenshot review found unbroken guest names overlapping adjacent
columns despite no page overflow. The wrapping was corrected and a cell-level
assertion added. The public error test was scoped to the form to exclude Next's
route announcer. Existing QR assertions/selectors were updated for the preview
workflow and the existing localized dialog close label; download/print/decoding
assertions remain in place. The empty-state fixture setup was also corrected to
send the existing required Origin header after the server correctly rejected it.
All final reruns passed.

## Preserved boundaries and limitations

No schema, migration, authentication, RBAC, API handler/contract, server validation,
event scoping, QR encoding, transaction, public lifecycle or rate limiter changed.
No optimistic attendance, automatic candidate selection or public autocomplete.

Bulk actions remain a future enhancement because the backend has no supporting
bulk endpoint. Filters retain the existing present/absent API; partial attendance
is displayed when the returned count is below quota. Event preview retains its
existing 100-record maximum; admin guest management retains server pagination.
Queue/history freshness and public receipt retention retain existing behavior.
Public receipts remain in component memory and are lost on reload; users are
advised to save the code and meet staff. No offline/realtime feature was added.

Browser QA uses desktop Chromium/Edge emulation. Physical iOS/Android cameras,
paper scan tests, a manual screen-reader audit and production load tests remain
outside this verification. Keyboard/contrast tests support accessibility review;
they are not a claim of full WCAG certification.

Suggested commit: `feat(ui): refine guest operations and pre-check-in journey`

No commit, push or merge was performed.
