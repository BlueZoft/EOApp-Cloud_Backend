# Version 1.1 architecture and upgrade

Request → CORS/body limits/rate limit → validation → inquiry service → MongoDB → receipt.

Notification worker → atomically claim pending/expired-lease record → SMTP → mark sent or schedule retry.

`config.js` validates runtime settings. `validation/inquiry.js` normalizes API fields and checks catalogue IDs. `services/inquiries.js` hashes normalized content and handles concurrent duplicate inserts using the unique submission key. `services/notifications.js` uses a two-minute lease and exponential retry delays capped at one hour. Notification state lives in the inquiry document so saving the inquiry and initial pending state is atomic. No extra queue service is required.

The renamed Inquiry model still uses the **users** collection and original persisted field names, exposed through canonical Mongoose aliases. Existing records remain readable. New fields record catalogue version, stable scheme/branch IDs, consent, duplicate protection, and notification state. Startup adds a partial unique index applying only to string submission keys. Existing records lack that field and are unaffected. Back up production data and verify indexes before rollout. Existing records are not automatically emailed or backfilled. Disabled notifications are not automatically queued when SMTP is later enabled; any requeue must be an explicit reviewed operation.

Deploy the backend before the updated frontend. Keep the legacy endpoint until older clients are retired. The frontend and backend contain identical catalogue JSON copies; ship them together and keep IDs stable. Do not renumber IDs when changing display order. The 15 original schemes, their text/rates, and 276 branches have not been modernized.

The API no longer sends the inquiry's full document to clients or logs it. Notification email includes the scheme, reference, contact name/telephone/optional email, preferred branch and message; it omits NIC and full address. Inquiries continue to collect the original identity fields for compatibility. Review whether those fields remain necessary before a later product/privacy redesign.

## Verification and remaining scope

Regression tests cover validation/false success, SMTP retry, duplicate races, legacy compatibility, CORS, malformed/large requests and readiness/rate limiting. Real SMTP delivery requires configured credentials and an approved test mailbox; it is not exercised by automated tests.

Deferred: public tracking, current catalogue verification, multilingual translations and suitability recommendations. Institution routing and an officer inbox are implemented in version 1.2; see docs/STAFF.md. This release establishes the service boundaries and catalogue IDs needed for those features without adding them. A data retention policy, credential rotation and production sender/recipient configuration are deployment responsibilities.

## Staff workflow in 1.2

RoutingRule pairs resolve new submissions to active Institution records. No mappings or accounts are bundled. Staff/StaffSession collections store salted password hashes and hashed, expiring cookie sessions. The optional staff router enforces active institution membership and CSRF checks. Inquiry workflow versions and recent history are updated atomically to prevent lost updates. Operational provisioning is a separate database-connected CLI; no public account creation is exposed.
