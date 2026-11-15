# Changelog

## Documentation update — frontend 1.3 (2026-11-15)

Updated discovery/language scope and remaining verified-data inputs. No backend API, runtime dependency, catalogue or database changes are required for local search/comparison and customer interface languages.

## 1.2.0 — 2026-11-15

- Added explicit scheme/branch routing to approved institutions, with deterministic precedence and unassigned fallback. No institution associations or mailboxes are invented.
- Added an opt-in staff API with administrator/officer roles, salted scrypt passwords, expiring HttpOnly sessions, CSRF checks, login throttling/lockout and institution-scoped access.
- Added versioned inquiry status updates, administrator reassignment and recent actor history. Staff responses omit NIC/address/age/gender.
- Added operator commands for directory imports, staff provisioning/reset/disable and rule removal. No default accounts or public registration are supplied.
- Added recipient snapshots and safe pending-recipient updates; reassignment is blocked during notification processing and does not resend delivered mail.
- Documented real-world placeholders, HTTPS/same-site requirements, account operations and legacy-record behavior in `docs/STAFF.md`.

Validation: all 25 backend tests pass, including routing, tenant isolation, CSRF, concurrent edits, session expiry/revocation and notification delivery. Full npm audit reports zero known vulnerabilities. Browser sign-in, scoped inbox/detail reads and logout were verified against a local API with synthetic institutions/accounts. No production account or real provider configuration was created.

## 1.1.0 — 2026-11-15

- Added validated v1 inquiries, minimal receipts and persistent duplicate protection.
- Corrected status codes, CORS ordering, request limits and readiness behavior.
- Added durable notification state, worker leases and SMTP retries; restored TLS verification.
- Removed committed SMTP configuration and personal recipient; configure delivery securely.
- Renamed the application model while retaining the users collection and legacy POST adapter.
- Extracted the unchanged scheme/branch catalogue with stable IDs.
- Updated runtime dependencies, removed unused packages and replaced nodemon with Node watch mode.
- Added API, deployment and upgrade documentation and regression tests.

Validation: 12 tests passed against MongoDB 7, including concurrent duplicates and simulated SMTP failure/recovery. npm audit reported zero known vulnerabilities across installed dependencies. The persistent server's health and readiness endpoints responded successfully. External SMTP delivery was not tested.

Deployment action: rotate the historical SMTP password and configure approved sender/recipient credentials before enabling delivery. Institution routing, catalogue modernization and public tracking remain deferred.

### Follow-up validation and release preparation

- Added an authenticated TLS SMTP integration test covering HTTP receipt, real local transport, persistence and duplicate replay. All 13 backend tests pass; real provider delivery still requires approved configuration.
- Added GitHub Actions for MongoDB-backed tests and dependency audit. Hosted run completion must be checked independently.
- Added startup rejection for SMTP placeholders and invalid enable flags.
- Documented production values and rollout steps; added an optional BuildKit CA secret for trusted proxy builds.
- Fixed Docker source ownership for the non-root runtime user. Container readiness, inquiry persistence/replay, runtime UID and absence of the build-time CA secret were verified. Temporary test containers, volumes and networks were removed.
