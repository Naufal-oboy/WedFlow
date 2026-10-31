# WedFlow UI/UX — Sprint 1

Branch: `redesign/ui-ux`. Scope: presentation, navigation, and accessibility.

## Audit and direction

Reviewed README/PRD, App Router layouts for all three roles, dashboard queries,
event detail, guest management, forms, shared shadcn/Base UI controls, Tailwind v4
CSS, loading/error states, check-in, scanner, and pre-check-in UI.

The original shell used a full-width dark navigation block on mobile. Cards,
hardcoded emerald/stone colors, and repeated management labels gave most pages
the same hierarchy. Controls varied between 28–48 px. Theme variables were scoped
to a container, so portaled dialogs and root-level toasts could use a different
palette. The sans font token referred to itself. Statuses and loading states
existed, but shared focus, spacing, and touch targets needed consistency.

[Studio Admin](https://github.com/arhamkhnz/next-shadcn-admin-dashboard) was used
only as a structural reference for a shared navigation shell and reusable UI.
No template, branding, assets, or dashboard content was copied.

Implementation sequence: tokens and typography → shell → role-specific overviews
→ shared controls and check-in presentation → responsive/browser regression.

## Design tokens

Tokens are defined at the root in [globals.css](../src/app/globals.css) and exposed
through Tailwind `@theme inline`, including portals and toasts.

| Token | Value | Purpose |
| --- | --- | --- |
| primary / sidebar | `#183C35` | Forest green, primary actions and navigation |
| background | `#F7F5F0` | Warm ivory workspace |
| champagne | `#D7C5A0` | Small brand and active navigation accents |
| card / popover | `#FFFFFF` | Content and overlays |
| foreground | `#242824` | Charcoal text |
| muted-foreground | `#62665E` | Secondary text |
| border | `#DEDFD6` | Thin structural separators |
| input | `#8B9187` | Visible control boundaries |
| ring | `#376F60` | Keyboard focus |
| success / success-soft | `#22563D` / `#EAF2EC` | Active status |
| warning / warning-soft | `#735218` / `#F8F1E3` | Draft and verification notices |
| destructive | `#B3342B` | Destructive actions and errors |

Geist is the interface typeface. Cormorant Garamond is loaded with `next/font`
only for selected editorial overview headings and the sidebar signature.
Staff check-in, forms, tables, dialogs, and metrics use sans-serif. Fonts are
self-hosted by Next at build time; the browser makes no Google Fonts request.

Spacing uses the Tailwind 4 px scale; primary page gutters are 16/32/40 px.
Default surface radius is 8 px and controls use 6 px. Separators provide
hierarchy; shadows are limited to overlays and selected tabs. Champagne is not
used for small text on white. No charts or invented progress percentages were
added to imply unavailable analytics.

## Dashboard shell and role views

- Desktop: 232 px forest sidebar, contextual breadcrumb, account popover,
  sticky white header, and a constrained content width.
- Below 1024 px: compact header with a Base UI modal navigation drawer.
  Escape closes it and returns focus to its trigger.
- Skip link targets the main content. Links and controls have visible focus.
- Staff/Client “Acara” still targets the existing overview section; it is not a
  new route. Same-page anchors use native hash navigation so active state and
  browser history stay synchronized. Other routes retain Next Link navigation.
- Breadcrumbs use safe generic “Detail” for record IDs, without extra data APIs.
- Account popover retains the existing logout server action.
- Admin: editorial greeting, compact KPI strip, nearest upcoming events,
  recent-event table, and contextual preparation actions.
- Client: editorial greeting, invitation/attendance totals, dated event rows,
  and access to the existing read-only event detail.
- Staff: operational heading, assigned-event rows, clear check-in action,
  compact attendance summary and large controls.

The admin agenda adds a read-only presentation query (four nearest future draft
or active events belonging to active clients). Existing counters, authorization,
API contracts, transactions, and data mutations are unchanged.

## Shared components and accessibility

Implementation map:

- [Root fonts](../src/app/layout.tsx) and [tokens](../src/app/globals.css).
- [Authorized shell](../src/components/layout/dashboard-shell.tsx),
  [navigation](../src/components/layout/dashboard-nav.tsx), and
  [mobile/account/breadcrumb chrome](../src/components/layout/workspace-chrome.tsx).
- [Admin overview](../src/components/dashboard/admin-overview.tsx),
  [Client/Staff overview](../src/components/dashboard/overview.tsx), and
  [event detail](../src/components/dashboard/event-detail.tsx).
- [Shared controls](../src/components/ui/),
  [management primitives](../src/components/dashboard/management-ui.tsx),
  [loading](../src/components/dashboard/dashboard-page.tsx), and
  [recoverable error](../src/components/dashboard/dashboard-error.tsx).
- [Check-in UI](../src/features/checkins/checkin-form.tsx),
  [queue UI](../src/features/precheckins/queue.tsx), and
  [UI regression harness](../scripts/test-ui-redesign.ts).

Buttons and inputs default to at least 44 px; check-in controls remain 48 px.
Native selects retain their platform interaction and now use consistent sizing
and boundaries. Tables remain tables, with a focusable horizontal scroll region
when columns exceed the viewport. Status badges always have text, not color alone.

The check-in method selector uses Base UI Tabs, including arrow-key navigation,
selected state, and associated panels. Changing methods still stops the camera.
The temporary ticket queue retains its existing matching and verification flow.
Confirmation remains mandatory, count validation remains intact, and a pending
network retry retains its transaction identity.

Dialogs use Base UI focus management, labelled titles/descriptions, a 44 px close
control, viewport-bounded scrolling, and an opaque dimmed backdrop. Loading
skeletons respect reduced motion. Shared recoverable error UI is available to
Admin, Client, and Staff. Toasts inherit the root palette and radius through the
existing Sonner integration.

## Before / after

| Area | Before | After |
| --- | --- | --- |
| Mobile navigation | Expanded dark header and wrapped links | Compact header and modal drawer |
| Overview hierarchy | Similar rounded KPI cards across roles | Metric strip and role-specific priorities |
| Typography | Mostly uniform headings; circular font token | Geist interface and selective editorial serif |
| Acara selection | Large rounded cards | Dated rows with explicit status/action |
| Admin agenda | Recent records only | Separate nearest upcoming schedule |
| Check-in selector | Buttons without tab semantics | Keyboard-operable Base UI tabs |
| Theme | Local theme plus repeated hex values | Shared semantic tokens including portals |
| Touch/focus | Mixed control sizes and focus styles | Consistent targets and focus outlines |
| Event attendance | Large dark summary block | Compact counters above the workflow |

Optional after screenshots are generated by `UI_SCREENSHOTS=1 npm run test:ui`
in [ui-redesign](./ui-redesign/). They use temporary example accounts and events;
the Admin view may also include existing local records. Do not publish those
screenshots without reviewing the displayed data. No baseline screenshot was
captured before edits; the comparison above is based on the audited source.

## Verification

Start the existing production test server on port 3100 after building:

```powershell
npm run typecheck
npm run lint
npm run build
$env:AUTH_URL='http://localhost:3100'
npm run start -- --port 3100
```

In a separate terminal:

```powershell
npm run test:ui
node --conditions=react-server --import tsx --test tests/*.test.ts
npm run test:checkins:e2e
$env:CHECKIN_BROWSER_ONLY='1'
npm run test:checkins:e2e
npm run test:precheckins:e2e
npm run test:guests:e2e
```

The UI harness uses a local server, temporary UUID-scoped accounts/events and
cleans them up in `finally`. It checks 1440, 768, 390 and 320 px layouts, mobile
drawer focus restoration, keyboard tabs, dialog focus containment, required
fields, count bounds, no attendance before confirmation, account menu, anchor
active state, skip-link focus, token contrast, and empty state.

Verification results:

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run build` | Passed; 38 generated pages |
| Unit suite | 42 passed |
| UI browser suite | 185 assertions plus Playwright expectations passed |
| Check-in HTTP | 105 assertions passed |
| Scanner browser | Passed: manual fallback, camera stop/switch, real QR decode, fuzzy name search, confirmation, lost-response retry |
| Public pre-check-in | 139 assertions plus mobile guest/staff browser flow passed |
| Guest management | 138 assertions passed |
| Auth/management | 141 assertions; QR HTTP checks also passed |

Tested text contrast ratios: forest/white 12.09:1, charcoal/ivory 13.73:1,
secondary text/ivory 5.38:1, success text/surface 7.46:1, warning text/surface
6.34:1. The harness reads the actual compiled CSS tokens, including minified hex.

After previews:

- [Admin, 1440 px](./ui-redesign/admin-desktop.png)
- [Client, 1440 px](./ui-redesign/client-desktop.png)
- [Staff, 390 px](./ui-redesign/staff-mobile.png)
- [Check-in, 390 px](./ui-redesign/checkin-mobile.png)

## Boundaries

No Prisma schema/migration, auth action, RBAC rule, API handler, check-in service,
QR generation logic, or public ticket verification changed. No new dependencies.
This sprint is a light-theme dashboard redesign; marketing/login composition and
print templates are not redesigned. Shared controls still apply there.
Client capabilities remain read-only. Queue/attendance freshness follows the
existing refresh behavior; no realtime transport or offline support was added.
Browser viewport checks do not replace physical iOS/Android testing or a manual
screen-reader audit. Dark mode and device-specific camera behavior are not
certified by this sprint.
