# OmniRetail — Staff / SDE Interview Deep-Dive Guide

This document captures architectural and engineering decisions in the 7-part format expected in Staff / Principal / SDE interview loops at tier-1 tech firms (Walmart, Amazon, Flipkart, Google).

---

## Decision 1: Modular Monolith vs Premature Microservices

### 1. Problem
Retail platforms have high domain complexity (Catalog, Pricing, Inventory, Orders, Fulfillment, Payments, Notifications). Deploying 8–10 independent microservices from day one introduces distributed transaction challenges, network latency, high infrastructure costs, and deployment overhead.

### 2. Naive Solution
Prematurely partition each module into an independently deployed Node.js microservice communicating via HTTP/REST or gRPC.

### 3. Limitation of Naive Solution
- Introduces the **Dual-Write Problem** across distributed databases.
- Requires complex distributed 2-Phase Commit (2PC) or distributed sagas before core business models are stable.
- Network serialization and IPC overhead increase p99 latency for checkout.
- Makes local developer onboarding and testing extraordinarily friction-heavy.

### 4. Chosen Solution
A **Modular Monolith** with strict domain directory boundaries (`src/modules/*`), repository-level encapsulation, and independently runnable worker runtimes (`server.js` for API traffic, `worker.js` for Kafka consumers and background timers).

### 5. Why Chosen Solution is Better
- Retains local ACID transaction capability in MongoDB replica sets across aggregates when necessary.
- Code-level domain boundaries enforce strict encapsulation, making future extraction into microservices a zero-refactor mechanical extraction if organizational scaling requires it.
- Single codebase, unified CI/CD, fast automated test runs.

### 6. Trade-offs
- Teams must exercise discipline: internal module dependencies must only interact via published service methods, never by directly requiring another module's internal Mongoose models.

### 7. How to Test
Execute isolated unit tests per module; test end-to-end flows with synthetic concurrency across the API and worker processes.

---

## Decision 2: Centralized Operational Error Handling

### 1. Problem
Unexpected exceptions or unhandled promise rejections can leak database connection strings, collection names, or memory dumps to clients, while failing to provide structured error payloads for client apps.

### 2. Naive Solution
Wrap every controller endpoint in individual try/catch blocks and send ad-hoc `res.status(500).json({ error: err.message })`.

### 3. Limitation of Naive Solution
- Code duplication across hundreds of routes.
- Inconsistent JSON structures (`{ error: ... }` vs `{ message: ... }` vs `{ err: ... }`).
- Risk of exposing internal server details or stack traces to end users in production.

### 4. Chosen Solution
`asyncHandler` route wrapper coupled with a normalized `errorHandler` middleware and a typed `AppError` class. Errors are classified as **operational** (expected business failures like `INSUFFICIENT_STOCK`) vs **fatal** (unexpected crashes like `TypeError`).

### 5. Why Chosen Solution is Better
- Single unified JSON envelope across all endpoints:
  ```json
  {
    "success": false,
    "message": "Human-readable error description",
    "code": "ERROR_CODE_ENUM",
    "errors": []
  }
  ```
- Automatically sanitizes stack traces in production (`process.env.NODE_ENV === 'production'`).
- Mongoose `MongoServerError` 11000 duplicate keys and Zod validation errors are mapped to clean 409 Conflict and 400 Bad Request responses automatically.

### 6. Trade-offs
Developers must remember to throw `AppError` rather than raw errors to preserve custom HTTP status codes and error code enums.

### 7. How to Test
Unit tests in `tests/unit/errors.test.js` validating status code mapping, operational flags, and error array structures; integration tests asserting 404 responses return standardized envelopes.

---

## Decision 3: Raw Body Preservation for Webhook Signature Verification

### 1. Problem
Payment providers like Razorpay and Stripe sign webhooks with an HMAC-SHA256 signature calculated over the exact, unparsed request byte stream.

### 2. Naive Solution
Use `express.json()` globally and re-stringify `JSON.stringify(req.body)` to verify the signature.

### 3. Limitation of Naive Solution
`JSON.stringify` does not guarantee key ordering, whitespace, or Unicode escape sequence parity with the original HTTP payload sent by the payment provider. As a result, webhook signature validation intermittently fails, causing rejected legitimate payment notifications.

### 4. Chosen Solution
Mount `express.json()` with a `verify` hook that captures the untouched raw buffer `buf` onto `req.rawBody` before JSON parsing occurs:
```javascript
express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
});
```

### 5. Why Chosen Solution is Better
Allows the Razorpay webhook verification service to calculate HMAC against the authentic raw buffer without needing a separate pre-body-parser route architecture.

### 6. Trade-offs
Slightly higher memory overhead per request during parsing, mitigated by strict 10MB payload size limits.

### 7. How to Test
Verify in payment integration tests that HMAC signatures generated from the raw buffer match Razorpay's test signatures.
