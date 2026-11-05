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
Slightly higher memory overhead per request during parsing, mitigated by strict 2MB payload size limits.

### 7. How to Test
Verify in payment integration tests that HMAC signatures generated from the raw buffer match Razorpay's test signatures.

---

## Decision 4: Argon2id vs Bcrypt for Password Hashing

### 1. Problem
Retail platforms with millions of user accounts face credential stuffing and offline dictionary attacks if password databases are ever compromised.

### 2. Naive Solution
Use legacy MD5/SHA256, or traditional Bcrypt with standard work factors ($10\text{--}12$).

### 3. Limitation of Naive Solution
Bcrypt is CPU-bound but uses negligible memory ($4\text{ KB}$). Modern threat actors utilize massively parallel GPU farms (thousands of cores) and custom ASIC clusters to compute millions of candidate Bcrypt hashes per second.

### 4. Chosen Solution
**Argon2id** (winner of the Password Hashing Competition) configured with memory-hard parameters:
- `memoryCost`: $65536\text{ KB}$ ($64\text{ MB}$ RAM required per computation)
- `timeCost`: $3$ iterations
- `parallelism`: $4$ threads

### 5. Why Chosen Solution is Better
Because each password verification requires 64MB of physical memory, parallelizing attacks on GPUs or ASICs is economically infeasible — memory bandwidth becomes the insurmountable bottleneck. Argon2id hybrid mode also protects against side-channel cache attacks.

### 6. Trade-offs
Slightly higher server RAM and CPU consumption during login. Mitigated by distributed rate limiting on auth endpoints to prevent denial-of-service attempts.

### 7. How to Test
Unit tests in `tests/unit/crypto.test.js` validating Argon2id hash prefix `$argon2id$`, timing parity, and verification of valid vs invalid passwords.

---

## Decision 5: Hybrid JWT Access Token + Database-Backed Refresh Token Rotation with Token Family Reuse Detection

### 1. Problem
Stateless JWTs cannot be revoked immediately if a user logs out, changes passwords, or reports a stolen device. Conversely, pure database session lookups on every single API request ($100\text{k}+ \text{req/s}$) overwhelm database read pools.

### 2. Naive Solution
Issue long-lived stateless JWTs ($30\text{ days}$) stored in localStorage with no server revocation tracking.

### 3. Limitation of Naive Solution
- If a token is stolen via XSS or network eavesdropping, the attacker retains full access for 30 days.
- The server has no technical capability to revoke the token upon user logout.

### 4. Chosen Solution
A **Hybrid Dual-Token Architecture with Token Family Rotation (RFC 6819)**:
1. Short-lived JWT Access Token ($15\text{ minutes}$) carrying identity claims (`userId`, `role`, `sessionId`).
2. Long-lived opaque Refresh Token ($7\text{ days}$) stored in MongoDB as a cryptographic SHA-256 hash.
3. Every time `/auth/refresh` is called, the refresh token is **rotated**: the old token hash is archived into `previousHashedTokens` and a fresh refresh token is issued.
4. **Token Family Reuse Detection:** If an incoming refresh token matches ANY token in `previousHashedTokens`, the system flags token reuse! An attacker has intercepted or replayed an already-consumed token. The system immediately **revokes the entire session family** (`revokeAllUserSessions`) and locks out the attacker.

### 5. Why Chosen Solution is Better
- Eliminates database reads on 95%+ of API requests (access tokens verified cryptographically in memory).
- Revocation capability preserved: active sessions can be revoked on demand.
- Immediate detection and neutralisation of token theft.

### 6. Trade-offs
Requires storing session records and managing session cleanup.

### 7. How to Test
Integration test in `tests/integration/auth.test.js` Subtest 6 (token rotation) and Subtest 7 (replaying rotated token triggers `TOKEN_REUSE_DETECTED` and revokes all sessions).

---

## Decision 6: HttpOnly Cookies + CSRF Defense vs LocalStorage Tokens

### 1. Problem
Web single-page applications (React/Next.js/Vue) frequently store auth tokens in `localStorage`.

### 2. Naive Solution
Return tokens in the JSON response body and have JavaScript save them to `localStorage.setItem('accessToken', ...)`.

### 3. Limitation of Naive Solution
Any Cross-Site Scripting (XSS) vulnerability anywhere in third-party npm libraries or user-generated content allows malicious JavaScript to execute `localStorage.getItem('token')` and silently exfiltrate user credentials to an attacker-controlled server.

### 4. Chosen Solution
Store both access and refresh tokens exclusively in **HttpOnly, Secure, SameSite=Lax/Strict** cookies. JavaScript running in the browser cannot read or exfiltrate HttpOnly cookies (`document.cookie` returns empty).
To protect against Cross-Site Request Forgery (CSRF) caused by ambient cookie sending, implement:
1. Strict CORS whitelist (`env.FRONTEND_URL`).
2. Custom request header validation (`X-Requested-With` or `X-CSRF-Token`) for all state-changing methods (`POST`, `PUT`, `PATCH`, `DELETE`).

### 5. Why Chosen Solution is Better
Immune to token theft via XSS. Cross-origin HTML forms cannot forge custom headers because browsers enforce CORS preflight options checks.

### 6. Trade-offs
Requires careful cookie configuration (path, domain, sameSite) across development and production environments.

### 7. How to Test
Integration test in `tests/integration/auth.test.js` Subtests 8 and 9 asserting that state-changing requests without the CSRF header are rejected with 403 Forbidden.

---

## Decision 7: Redis-Backed Keyed HMAC OTP with Rate and Cooldown Limiting

### 1. Problem
SMS and email verification codes (6 digits) have an inherently small keyspace ($10^6 = 1,000,000$ combinations), making them vulnerable to brute-force guessing and SMS/email toll-fraud attacks if not aggressively rate-limited.

### 2. Naive Solution
Store the 6-digit number in plaintext in MongoDB with a TTL index and check client guesses in a loop.

### 3. Limitation of Naive Solution
- Plaintext OTPs in databases risk internal employee exfiltration.
- MongoDB TTL background threads run only every 60 seconds, leaving windows of vulnerability.
- Without attempt limits, an automated script can guess $1,000,000$ combinations in minutes.

### 4. Chosen Solution
- Cryptographically secure generation (`crypto.randomInt(100000, 1000000)`).
- **Keyed HMAC-SHA256:** Plaintext OTP is hashed with `env.OTP_HMAC_SECRET` before being stored in Redis with an exact 300-second TTL.
- **Timing-Safe Comparison:** `crypto.timingSafeEqual` prevents timing-leak attacks.
- **Maximum 5 Attempts:** Stored counter tracks failed attempts. If 5 attempts are exceeded, the OTP is deleted immediately.
- **60-Second Cooldown:** Dedicated Redis cooldown key (`otp:cooldown:...`) prevents spamming resend buttons.

### 5. Why Chosen Solution is Better
Sub-millisecond validation in Redis memory, zero plaintext credential storage, atomic attempt tracking, and complete protection against brute force and resend abuse.

### 6. Trade-offs
Requires an active Redis instance.

### 7. How to Test
Unit tests in `tests/unit/crypto.test.js` and integration tests in `tests/integration/auth.test.js` Subtest 3 validating verification and attempt decrementing.

---

## Decision 8: Server-Side Authoritative Pricing vs Client-Supplied Prices

### 1. Problem
Untrusted client applications (browsers, mobile apps) can easily be manipulated using developer tools, proxy interceptors (Burp Suite), or modified HTTP payloads to alter product prices (e.g. changing \$999 to \$1 before submitting an order).

### 2. Naive Solution
Accept `price` or `total` fields from the client request payload and record them into the order document.

### 3. Limitation of Naive Solution
Catastrophic financial loss: users can purchase luxury goods for pennies. Client input can never be trusted for financial computations.

### 4. Chosen Solution
**Authoritative Server-Side Pricing Engine:**
The client only submits `{ productId, quantity, couponCode }`.
The server:
1. Fetches current product documents from MongoDB.
2. Resolves effective unit prices (`salePrice ?? regularPrice`).
3. Computes line totals (`unitPrice * quantity`).
4. Validates coupon rules (validity dates, min order amounts, max discount caps).
5. Computes authoritative subtotal, discount, and grand total.

### 5. Why Chosen Solution is Better
Complete mathematical and financial integrity. Client tampering has zero impact on final billing.

### 6. Trade-offs
Requires fetching products during cart calculation and order placement.

### 7. How to Test
Unit tests in `tests/unit/pricing.test.js` asserting server-side computation, discount caps, and rejection of invalid coupons.

---

## Decision 9: Redis Cache-Aside Pattern with Automated Cache Invalidation for Product Catalogs

### 1. Problem
Product detail endpoints (`/products/:id`) receive heavy traffic (e.g. 90%+ of total requests during high-traffic sales). Directly hitting MongoDB on every product view creates database query pool contention and increases p99 latency.

### 2. Naive Solution
Query MongoDB directly on every request or use in-memory Node.js caches (e.g. `Map`).

### 3. Limitation of Naive Solution
- MongoDB query pool exhaustion under peak load.
- In-memory Node caches are local to each process: updating a product on one container leaves stale data in other containers.

### 4. Chosen Solution
**Distributed Redis Cache-Aside Strategy (`product:<id>`):**
1. On read: check Redis cache first. If found, parse and return immediately ($< 2\text{ms}$).
2. On miss: fetch from MongoDB, populate Redis with a 1-hour TTL, and return.
3. On write (create, update, delete): immediately invalidate `product:<id>` and catalog pattern caches (`products:*`).
4. **Resilience:** If Redis fails or has a network partition, the service logs a warning and falls back to MongoDB transparently without crashing.

### 5. Why Chosen Solution is Better
Sub-millisecond read latency, high throughput, zero stale data upon product edits, and complete failure tolerance.

### 6. Trade-offs
Adds Redis operational dependency.

### 7. How to Test
Integration test in `tests/integration/catalog.test.js` Subtests 5 and 6 asserting cache population and cache invalidation upon product update.
