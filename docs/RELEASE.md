# Deployment and release checklist

## Upgrade to 1.2.2

Recreate every API/notification-worker instance together: old worker code does not honor the new lease ownership tokens. No new index or destructive data migration is required. Missing account/session revisions remain compatible as zero; the next provisioning/reset/disable increments the account revision and invalidates old sessions even if a login finishes after session deletion. Confirm staff sign-in/reset/revocation and notification recovery after rollout. Delivery remains at least once.

The matching frontend 1.3.2 clears inaccessible inquiry details, handles malformed staff responses, and fixes short-screen search layout. Backend regression validation passed all 32 tests with MongoDB integration enabled.

## Required real-world configuration

Copy `.env.example` to an ignored local `.env`, or use your hosting platform's secure variables. Replace every placeholder. Do not put a password in Git, a Docker build argument, a frontend build or an issue/chat message.

- Private production MongoDB URI and least-privilege application credentials.
- Actual HTTPS frontend origin(s) for `CORS_ORIGINS`.
- SMTP provider host/TLS port, username and **rotated** password/app credential.
- Approved sender address/domain and authorized inquiry-team recipient mailbox.
- Named operational owner, staff access rules and inquiry retention period.

`SMTP_ENABLED=false` is safe for local development but means no email delivery. Placeholder settings are rejected when SMTP is enabled. Previously saved `disabled` notifications are not automatically requeued. A provider administrator must revoke the historical committed password; changing this repository cannot revoke it.

## Rollout

1. Back up MongoDB and confirm the new partial unique submission index can be created. Existing users collection documents remain intact.
2. Configure the API and start it. `/ready` must return 200 before routing production traffic.
3. Deploy the matching frontend catalogue version; set its actual API origin or same-origin reverse proxy. Allow `Content-Type` and `Idempotency-Key` through the ingress.
4. Use an approved test identity/mailbox to submit an inquiry. Record its reference, confirm database storage and mail delivery, then retry with the same payload/key and confirm the same reference.
5. Check pending/processing notification counts and retry attempts. Delivery is at least once; interrupted SMTP acknowledgment may produce a duplicate message with the same reference.
6. Apply gateway/shared rate limits for replicas, access controls for the database, and the agreed retention policy.

The local automated SMTP test uses a disposable server and a generated trusted test certificate. It verifies the Nodemailer/TLS integration without contacting a real provider. It does not establish production SMTP access or DNS/sender reputation.

## Docker behind an intercepting proxy

Ordinary builds use `docker build -t eoapp-api .`. If a trusted corporate proxy requires a custom CA, use BuildKit's temporary secret mount and standard proxy arguments:

```sh
docker build --build-arg HTTPS_PROXY --build-arg HTTP_PROXY \
  --secret id=npm_ca,src=/path/to/approved-ca.pem -t eoapp-api .
```

The CA is used only while installing packages, not copied into the final image. Ensure the proxy hostname resolves inside the build network; configure Docker DNS or an approved `--add-host` mapping if needed. Preserve TLS verification. Supply any runtime trust configuration separately if your production SMTP/database network requires it. Do not embed credentials or a developer's proxy settings in the image.

## Automated checks

`.github/workflows/validate.yml` runs dependency installation, all tests with a MongoDB service, and the production dependency audit on pushes/pull requests. Local execution passing does not establish that GitHub-hosted runs have completed; inspect the Actions result for the pushed commit.

Local evidence: all 32 backend tests passed, including authenticated local TLS delivery, institution isolation, CSRF/version checks, explicit proxy trust, credential-revision races and stale delivery claims. The Docker image built and passed readiness, persistence/replay and non-root runtime checks. Real provider delivery and production ingress routing still require the real-world values above.

## Docker-host release in 1.2.1

The frontend repository contains the matching same-origin HTTPS stack and operator guide in `deploy/`. Deploy both repositories together. The edge terminates TLS, applies request/body limits, overwrites client forwarding headers and exposes `/api/ready`; the API and production database must remain private. Compose sets `TRUST_PROXY_HOPS=1` for that one-hop path. The default is `0` for direct hosting. Adding another ingress requires reviewing the trust chain instead of increasing the hop count blindly.

Use the frontend's `.env.deploy.example` for host/TLS/private-MongoDB/SMTP placeholders. Configure actual institution mappings and named staff before enabling the portal. The disposable HTTPS rehearsal uses generated test identities and its own database; it never establishes real SMTP delivery or validates a public certificate/domain. See the frontend deployment guide for certificate renewal, release identification, rollback and the exact rehearsal command.

Paired local rehearsal passed on 2026-11-16: real browser inquiry submission/replay, staff login with Secure/HttpOnly/Strict cookies, CSRF-protected status change, logout, TLS/redirects, security headers, body/rate limits and private/non-root containers. The runner removed only its disposable synthetic database and test resources.

The frontend's `deploy/synthetic/README.md` now extends this to a retained local demo with a replaceable fictional directory/staff/applicant profile, authenticated STARTTLS capture, backup/restore, marked-record retention and outage/recovery reports. SMTP recipient domains are restricted to `@demo.test` in the capture service and no external email is relayed. A test CA is mounted only by that overlay; production SMTP verification remains unchanged. Policy intervals/owners are synthetic examples, not approved production schedules. Historical SMTP credential revocation still requires the provider administrator.

## Staff rollout in 1.2

Before enabling `STAFF_ENABLED`, supply approved institution mappings/mailboxes and provision a named administrator/officers using [docs/STAFF.md](STAFF.md). Verify HTTPS same-site cookie behavior, staff access isolation, logout and a status update in the intended deployment. Keep Secure cookies enabled in production. Apply the retention/access policy to staff accounts, sessions and the latest 100 inquiry-history events. No existing inquiry is automatically backfilled.
