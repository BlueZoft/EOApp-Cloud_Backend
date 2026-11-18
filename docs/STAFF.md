# Institution routing and officer inbox — 1.2

This release adds an internal staff workflow. It does not add credit approval, public inquiry tracking, institution self-registration or a new loan catalogue. Staff access is **off by default** and there are no built-in accounts.

For local rehearsal, the frontend's `deploy/synthetic/profile.json` and `deploy/synthetic/README.md` provide labeled fictional institutions, two officers and an administrator. The runner imports them into its private synthetic database and generates fresh passwords; these are not backend defaults. Replace them for production using the approved directory and provisioning procedure below, never by importing the demo database.

## Configure real institutions

The tracked `config/institutions.example.json` is intentionally empty. Copy it to ignored `config/institutions.json`. Fill it with approved institution names, notification mailboxes, and mappings. This is the format; the uppercase values below are documentation placeholders and must be replaced:

```json
{
  "institutions": [
    {
      "code": "institution-code",
      "name": "REPLACE_WITH_APPROVED_INSTITUTION_NAME",
      "notificationEmail": "REPLACE_WITH_APPROVED_MAILBOX",
      "active": true
    }
  ],
  "rules": [
    {
      "loanId": "loan-01",
      "branchId": "branch-001",
      "institutionCode": "institution-code"
    }
  ]
}
```

Use the IDs in `data/catalogue.json`. `general` identifies general inquiries, and `*` is an explicit wildcard. Rule priority is exact scheme+branch → branch-only → scheme-only → explicit `*`/`*` default. Each pair has one destination. Inactive institutions are skipped. No match leaves the inquiry unassigned; no relationships have been guessed from branch names or loan descriptions.

With a configured private `MONGO_URI`:

```sh
npm run staff -- import-directory --file config/institutions.json
npm run staff -- list
npm run staff -- remove-rule --loan loan-01 --branch '*'
```

Import validates the whole file before writing, then idempotently upserts the supplied institutions/rules. It is additive: omitted rules/institutions remain. Include every referenced institution in the file. Rerun after an interrupted database operation; multi-document imports are not a transaction. Disable an institution by importing it with `active: false`. Protect the filled configuration and database access as operational data.

New inquiries store an institution and a notification-recipient snapshot. Configured mappings affect future submissions only; retries of an existing submission keep their original routing. Assigned notifications go to the configured institution mailbox; unmatched inquiries use the approved general `SMTP_TO`. SMTP must still be configured/enabled separately. Changing a destination mailbox does not silently rewrite queued historical emails: pause/inspect pending notifications before retiring an old mailbox.

## Provision staff without committing credentials

Provision the first administrator through an operator shell connected to the intended database:

```sh
npm run staff -- provision --email REPLACE_WITH_ADMIN_EMAIL --name "REPLACE_WITH_ADMIN_NAME" --role admin
```

The command asks for a hidden password. Use a unique 12–128 character password supplied through that prompt, never a command-line argument or a tracked file. With noninteractive execution, stdin is supported; retrieve it securely from your secret manager without logging it. No password values belong in this documentation.

Provision an officer only after importing their active institution:

```sh
npm run staff -- provision --email REPLACE_WITH_OFFICER_EMAIL --name "REPLACE_WITH_OFFICER_NAME" --role officer --institution institution-code
npm run staff -- disable --email REPLACE_WITH_OFFICER_EMAIL
```

Provisioning an existing email replaces its role, institution and password, re-enables it, clears login lockout and revokes its sessions. Disabling also revokes sessions. This operator command is the password-reset/account-management path for this initial release; there is no public registration/reset endpoint. Passwords are salted scrypt hashes, never plaintext.

In 1.2.2, those operations atomically increment the account's credential revision. Every session must match the current revision, including sessions saved by a login finishing after reset/disable. Old records without a revision use zero until the next operator change; no destructive migration is required.

## Enable and deploy

Set `STAFF_ENABLED=true`. Production defaults to Secure, HttpOnly, SameSite=Strict cookies. Keep `STAFF_COOKIE_SECURE=true` and serve over HTTPS. Prefer the frontend and API on the same origin behind a reverse proxy. Different ports/subdomains must remain same-site; cross-site cookies are intentionally unsupported. Exact CORS origins and credentials support are configured in the API. Do not weaken SameSite to make unrelated domains work.

Local HTTP development only:

```dotenv
NODE_ENV=development
STAFF_ENABLED=true
STAFF_COOKIE_SECURE=false
CORS_ORIGINS=http://localhost:8080
```

Use `localhost` consistently for frontend and API, rather than mixing it with `127.0.0.1`. An insecure staff cookie is rejected outside development. The officer UI is a web portal accessed through the welcome screen's **Officer inbox** button; native mobile staff sessions are not implemented.

Sessions last eight hours. Only hashed session tokens are stored, expiry is checked on every request (not just TTL cleanup), and CSRF tokens protect authenticated mutations. Roles, active accounts and institution membership are rechecked per request. Login uses generic failures, a per-process IP limit and a persistent 15-minute account lock after ten failed attempts. Apply a trusted gateway/shared limiter for multiple replicas. Do not log passwords, cookies, CSRF tokens or inquiry payloads.

## Workflow and access

- Officers list/read/update only inquiries assigned to their active institution.
- Administrators can also review unassigned and legacy inquiries and change institutions.
- The list supports status, exact reference and cursor pagination. Staff responses omit NIC, address, age, gender, hashes and notification internals.
- Statuses: `new → assigned → contacted → closed`. New/assigned cases can be closed; assigned cases can be returned to new; contacted/closed cases can be returned to assigned for follow-up. Assigned status records the acting staff ID. Institution team members can collaborate on the same institution's cases; individual ownership is not an access boundary.
- Institution reassignment resets status to new and clears the assigned officer. Pending notification recipients change with it. Already-sent email is not resent; reassignment changes inbox access, not a promise of email delivery.
- Reassignment is blocked while notification delivery holds a processing claim, preventing the old recipient from being used concurrently. Let the worker complete/recover its lease before retrying.
- Updates require the current workflow version. Concurrent/stale changes return 409; refresh and review before retrying. A network timeout may mean an update succeeded; refresh before another change.
- Each update atomically records who changed the status/institution and when. Only the latest 100 events are retained in the inquiry; this is recent operational history, not an immutable compliance audit archive.

Existing records remain in `users`, appear as new/unassigned, and are not automatically routed or emailed. No backfill or destructive migration runs at startup. Institution mappings, staff membership, approved email destinations, retention/access policies and production identities remain real-world inputs to supply before rollout.

## Staff API

All paths below are under `/api/v1/staff`. Disabled staff access returns 503. Successful login/session responses contain `{staff, csrfToken}`; the session token stays in an HttpOnly cookie.

| Method/path | Purpose |
| --- | --- |
| `POST /login` | JSON email/password; rotates an existing cookie session after successful login |
| `GET /session` | Restore the current staff identity and CSRF token |
| `POST /logout` | Revoke the current session; requires `X-CSRF-Token` |
| `GET /institutions` | Active institutions visible to the role |
| `GET /inquiries` | Scoped list; `status`, admin-only `institutionId` (`unassigned` supported), exact `reference`, `before`, `limit` (1–50) |
| `GET /inquiries/:id` | Scoped contact details and recent history |
| `PATCH /inquiries/:id` | `{version, status}` or admin-only `{version, institutionId}`; requires `X-CSRF-Token` |

Cross-institution record access returns 404. Unsupported transitions/inputs return 422; forbidden administration/CSRF failures 403; stale updates/busy notification claims 409. Public receipt responses remain minimal and do not expose workflow state or staff data.

All supplied list filters apply together. An exact reference equal to or newer than a `before` cursor returns no match; providing a reference does not override pagination.
