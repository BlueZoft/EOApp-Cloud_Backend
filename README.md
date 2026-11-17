# Hetarata / Entrepreneur Outreach API — 1.2.1

The paired frontend's `docs/PROTOTYPE.md` is the prototype demonstration and release handoff. It covers the synthetic customer/staff walkthrough, captured TLS email, backup/restore and outage/recovery evidence, and replacement of demo inputs with approved deployment configuration.

Express and MongoDB API for the Sinhala credit catalogue's inquiry flow. This release makes receipt reliable, validates requests, and separates email delivery from submission. The opt-in staff inbox adds institution routing and follow-up statuses. Existing catalogue text and rates are retained unchanged; their current availability has not been verified.

## Run locally

Requires Node 22–24, npm, and MongoDB 7 (Docker is optional).

```sh
npm ci
cp .env.example .env
# If MongoDB is not already running:
docker run -d --name eoapp-mongo -p 127.0.0.1:27017:27017 mongo:7.0
npm start
```

If the container already exists, use `docker start eoapp-mongo`. Never remove an existing database/container as part of routine setup. `npm run server` provides Node's built-in watch-mode development restarts.

`MONGO_URI` is required. Startup waits for MongoDB and the unique submission index before accepting requests. The default port is 5000. `GET /health` checks process health; `GET /ready` returns 503 when MongoDB is disconnected.

Email is **disabled by default** for local development. In that mode inquiries are retained with notification status `disabled`. To enable delivery, configure all SMTP fields in `.env.example` securely and set `SMTP_ENABLED=true`. Use port 465 for implicit TLS or port 587 for required STARTTLS. Certificate verification remains enabled. A running API process polls pending notifications every five seconds.

Set `CORS_ORIGINS` to an exact comma-separated list of frontend origins (scheme, host, port; no trailing slash). Default: `http://localhost:8080`. CORS is not authentication. Keep MongoDB private and restrict database credentials to this application.

## API and operations

See [API contract](docs/API.md) and [architecture and upgrade notes](docs/ARCHITECTURE.md).

- `POST /api/v1/inquiries`: validated request, required `Idempotency-Key`, minimal receipt.
- `POST /api/userdata`: deprecated compatibility adapter for the original frontend's field names. New clients must use v1. Legacy clients without a submission key do not receive duplicate protection.
- No public inquiry lookup, listing, or management endpoints are exposed. Authenticated internal staff routes are documented separately.

The API runs as a persistent container/service. `index.js` starts the HTTP server and notification worker; `app.js` exports the Express factory without opening a port. The previous Lambda export was removed: simply wrapping this API in Lambda will not run the persistent notification worker. A serverless deployment needs a separate scheduled worker and connection lifecycle design.

## Test

```sh
npm test
TEST_MONGO_URI=mongodb://127.0.0.1:27017 npm test
```

The first command runs unit checks and explicitly skips database integration checks. The second runs all tests against newly named, isolated test databases and drops only those databases afterward. OpenSSL is required to generate the disposable SMTP test certificate. It exercises real persistence, concurrent duplicate requests, CORS, error responses, database readiness, and simulated SMTP failure/retry. One integration test delivers to an authenticated local TLS SMTP server with a generated trusted certificate. Tests never send external email.

```sh
docker build -t eoapp-api .
docker run --env-file .env -p 5000:5000 eoapp-api
```

The container's `MONGO_URI` must point to MongoDB reachable from the container; `127.0.0.1` means the API container itself. Do not bake `.env` into images.

## Deployment requirements

Rotate the previously committed SMTP password outside Git before enabling production mail. Removing it from the current source does not revoke it or remove it from history. Configure an approved sender and recipient; the application no longer contains a personal recipient address. Use HTTPS at the ingress, set production origins, and apply a shared/gateway rate limit for multiple replicas. The built-in 10 submissions/minute limiter is per process and sees the socket peer; forwarded IP headers are deliberately not trusted by default.

For the selected Docker-host target, follow the frontend repository's `deploy/README.md` and `deploy/compose.yaml`. That stack keeps the API private behind a header-overwriting HTTPS edge and sets `TRUST_PROXY_HOPS=1`. Direct API hosting retains `0`; an extra CDN/load balancer needs a reviewed trust configuration. The Docker base image is pinned by digest. No production database or credentials are created by Compose.

Delivery is at least once: a crash after SMTP accepts a message but before MongoDB records `sent` can cause a duplicate email. The stable inquiry reference/message ID helps operators recognize duplicates. Monitor pending/processing records and notification attempts. Do not log full records, NICs, addresses, credentials, or SMTP error objects. Set a retention/access policy before collecting production inquiries.

## Real-world values still required

The tracked `.env.example` contains intentionally unusable placeholders. Copy it to ignored `.env` locally or bind values securely in your deployment platform. Never commit the filled file.

| Setting/action | Supply before production |
| --- | --- |
| `MONGO_URI` | Private database connection and credentials; the example is local-only |
| `CORS_ORIGINS` | Actual HTTPS frontend origin(s) |
| `TRUST_PROXY_HOPS` | Default `0`; `1` only behind the private, header-overwriting Docker edge |
| `SMTP_HOST`, `SMTP_PORT` | Mail provider hostname and TLS port |
| `SMTP_USER`, `SMTP_PASSWORD` | Provider username and a newly rotated password/app credential |
| `SMTP_FROM`, `SMTP_TO` | Approved sender identity and authorized inquiry-team mailbox |
| `SMTP_ENABLED` | Set true only after replacing placeholders and testing with an approved mailbox |
| Access/retention policy | Owner, authorized staff, and retention period for personal inquiry data |

Changing the committed placeholder does not rotate the historical password. Revoke it through the mail provider. Real SMTP validation remains pending until these values and an approved test recipient are available.

See [deployment checklist](docs/RELEASE.md) for required real-world values, rollout checks, CI and proxy-aware Docker builds.

## Institution routing and staff inbox

See [staff provisioning, routing and API guide](docs/STAFF.md). `STAFF_ENABLED=false` by default; there are no initial accounts or assumed institution mappings. Copy the empty directory template and supply actual approved institutions/mailboxes, then provision staff using the hidden-password operator command. The backend enforces institution isolation, CSRF protection and versioned status changes. Old records remain unassigned until an administrator reviews them.

Frontend 1.3 adds local search/comparison and customer interface languages without changing backend routes, catalogue content or database records. Guided inquiry preparation does not make an eligibility decision; verified institution criteria and approved catalogue translations remain external inputs.

For an end-to-end synthetic deployment, use the frontend repository's `deploy/synthetic/README.md`. Its replaceable profile supplies fictional institution mappings and staff, a private authenticated STARTTLS capture service, backup/restore and synthetic retention checks. It uses the existing API/operator commands without adding default accounts, a public mail service or production seed data. Production directory and SMTP configuration remain explicit operator inputs.
