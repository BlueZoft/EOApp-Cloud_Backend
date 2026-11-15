# Inquiry API v1

## Create an inquiry

`POST /api/v1/inquiries`, `Content-Type: application/json`.

Required `Idempotency-Key`: 16–128 ASCII letters, digits, underscores or hyphens. Generate a random value per logical inquiry; retry an uncertain request with exactly the same payload and key. Keys are retained with records, not expired on a timer. Never reuse a key for another person or different details.

```json
{
  "name": "Test Person",
  "age": 30,
  "nic": "199012345678",
  "sex": "female",
  "telephone": "0771234567",
  "address": "Test address",
  "email": "",
  "message": "Please contact me",
  "loanId": "loan-01",
  "branchId": "branch-001",
  "consent": true
}
```

Name: 4–60 characters; age: integer 18–99; NIC: nine digits followed by V/X or twelve digits; sex: `male`/`female`; telephone: ten digits beginning with zero; address: 1–120 characters; optional email: at most 254 characters; optional message: at most 500 characters. Strings are trimmed. The age also accepts an integer decimal string for compatibility. Loan and branch IDs must exist in `data/catalogue.json`; `general` is the general inquiry loan ID. Displaying a scheme does not determine eligibility or approval.

A new record returns 201:

```json
{"inquiry":{"reference":"<MongoDB record ID>","status":"received"}}
```

A matching retry returns the same reference with 200. Receipt means stored, not emailed, assigned, or approved. No personal fields or notification internals are returned. A different payload with the same key returns 409.

Errors have this structure:

```json
{"error":{"code":"VALIDATION_ERROR","message":"Please correct the highlighted fields","fields":{"age":"Must be an integer from 18 to 99"}}}
```

Status codes: 400 malformed JSON/missing or invalid key; 403 unapproved browser origin; 404 unknown route; 409 key conflict; 413 body over 16 KiB; 415 wrong content type; 422 invalid fields; 429 rate limit (`Retry-After` seconds); 503 database not ready; 500 unexpected failure. Internal errors expose neither stack traces nor database errors.

The deprecated `/api/userdata` accepts the original `NIC`, `tel`, `addr`, `inquiry`, `branch` and `askLoan` names. Branch and loan names must match the retained catalogue. Success is 200 with the new minimal receipt and `Deprecation: true`. Legacy consent is not inferred; its stored value is false unless supplied. Remove this adapter after old clients are retired.
