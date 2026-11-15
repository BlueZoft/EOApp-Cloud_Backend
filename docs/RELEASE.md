# Deployment and release checklist

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

Local evidence: all 13 backend tests passed, including authenticated local TLS delivery; the Docker image built and passed readiness, persistence/replay, non-root UID and absent-CA-secret runtime checks. Real provider delivery and production ingress routing still require the real-world values above.
