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

---

## Decision 10: Atomic Lock-Free Conditional Updates for Concurrency-Safe Inventory Allocation

### 1. Problem
During flash sales or high-demand product drops, hundreds of concurrent requests arrive in the exact same millisecond trying to reserve a limited stock (e.g. 10 remaining iPhone units). A race condition could lead to overselling (negative stock), creating customer dissatisfaction and expensive manual order cancellations.

### 2. Naive Solution
Read stock with `findById`, check if `availableStock >= requestedQuantity` in JavaScript, and if true, execute `save()` with updated counts (or use pessimistic row locking `SELECT ... FOR UPDATE` in SQL).

### 3. Limitation of Naive Solution
- The read-check-write sequence in JavaScript is not atomic. Multiple concurrent requests read stock = 10 simultaneously, all conclude there is stock, and all decrement, driving stock negative (overselling).
- Pessimistic locking in SQL/NoSQL serializes transactions at the row level, causing catastrophic thread contention, lock queue timeouts, and deadlock cascades under high throughput.

### 4. Chosen Solution
**Atomic Conditional Decrements via MongoDB Filter Expressions:**
```javascript
const inventory = await Inventory.findOneAndUpdate(
  {
    productId,
    locationId,
    availableStock: { $gte: quantity } // Atomic lock-free condition
  },
  {
    $inc: {
      availableStock: -quantity,
      reservedStock: +quantity
    }
  },
  { new: true, session }
);
```
If `availableStock` is less than `quantity`, MongoDB atomically modifies 0 documents and returns `null`. The operation succeeds or fails purely within the database engine's atomic document lock without any distributed locks or application-level locks.

### 5. Why Chosen Solution is Better
- Guaranteed zero overselling: mathematically impossible for stock to drop below 0.
- Lock-free high throughput: operations on different products and locations execute in complete parallel without blocking.
- Every reservation writes to an append-only `InventoryLedger` with a running snapshot balance.

### 6. Trade-offs
Requests that fail the condition immediately get an `INSUFFICIENT_STOCK` error; they do not queue up waiting for replenishment unless a retry queue is explicitly constructed.

### 7. How to Test
Execute `tests/concurrency/inventory.test.js` where 10 concurrent requests simultaneously race to reserve the last single unit. Exactly 1 request succeeds (201 Created), 9 requests fail (409 Conflict), and final available stock is exactly 0.

---

## Decision 11: Transactional Outbox Pattern to Solve the Dual-Write Problem

### 1. Problem
When a customer completes checkout, the system must save the order in MongoDB and publish an `OrderCreated` event to Apache Kafka. If the database write succeeds but the Kafka publish crashes (network timeout, broker restart), downstream services (payment, fulfillment, notifications) never know the order exists. If the Kafka publish happens first and the database transaction aborts, phantom events trigger processing for non-existent orders. This is the classic **Dual-Write Problem**.

### 2. Naive Solution
Execute `order.save()` and immediately call `kafkaProducer.send()` in the same HTTP request handler.

### 3. Limitation of Naive Solution
Dual-writes across two different distributed systems (MongoDB and Kafka) cannot participate in a single two-phase commit without severe performance bottlenecks and single-point-of-failure vulnerabilities. Network partitions inevitably cause data drift and silent lost updates.

### 4. Chosen Solution
**Transactional Outbox Pattern:**
1. In the same MongoDB replica set transaction (`session.withTransaction`), insert both the `Order` document, `Reservation` records, and an `Outbox` event envelope:
```javascript
await session.withTransaction(async () => {
  await orderRepo.create([orderData], { session });
  await reservationRepo.create([resData], { session });
  await outboxRepo.create([envelope], { session }); // 100% atomic
});
```
2. An asynchronous background Outbox Publisher Worker (`src/workers/outbox.worker.js`) polls `Outbox` events with status `PENDING`, publishes them reliably to Apache Kafka, and marks them `PUBLISHED` upon broker ACK.

### 5. Why Chosen Solution is Better
- Zero dual-write inconsistency: database write and event persistence succeed or abort together as a single atomic unit.
- Non-blocking: API response to the user does not wait for Kafka network latency or partition rebalances.
- Guaranteed at-least-once message delivery to Kafka.

### 6. Trade-offs
Introduces asynchronous eventual consistency (sub-second lag between order creation and Kafka delivery) and requires downstream consumers to be idempotent.

### 7. How to Test
Verify in `tests/integration/orders.test.js` and `tests/integration/kafka.test.js` that order checkout records outbox documents within the active session, and publisher worker dispatches to Kafka partitions.

---

## Decision 12: Idempotent Consumers with Inbox Deduplication Pattern

### 1. Problem
Because Kafka and message networks guarantee **At-Least-Once Delivery**, network retries, consumer rebalances, or producer retries can cause duplicate messages to be delivered to workers. If an `OrderPaid` or `InventoryReserved` event is processed twice, money could be charged twice or double inventory deducted.

### 2. Naive Solution
Rely on Kafka consumer offsets alone and assume each message is received exactly once.

### 3. Limitation of Naive Solution
When a consumer process crashes after executing business logic but before committing offsets back to Kafka, the rebalanced consumer will re-read and re-execute the same message, causing duplicate business actions (duplicate payments, inventory leakage).

### 4. Chosen Solution
**Inbox Deduplication Pattern:**
Every event carries a unique, deterministic `eventId` in its standard envelope (`src/infrastructure/kafka/eventEnvelope.js`). Before processing any incoming message, the consumer checks the `inbox` collection:
```javascript
// Unique compound index on { messageId: 1, consumerGroup: 1 }
const isAlreadyHandled = await inboxService.isProcessed(messageId, consumerGroup);
if (isAlreadyHandled) {
  logger.info({ messageId }, 'Duplicate message detected. Skipping.');
  return;
}
```
Upon successful business execution, the consumer atomically records `{ messageId, consumerGroup, processedAt }` in the Inbox with a 7-day TTL index.

### 5. Why Chosen Solution is Better
- Complete idempotency: duplicate deliveries are safely ignored with zero side-effects.
- Self-cleaning: TTL index automatically prunes old inbox records to keep database footprint lean.

### 6. Trade-offs
One additional fast indexed lookup per incoming event before domain processing.

### 7. How to Test
Tested in `tests/integration/saga.test.js` where duplicate events are supplied with the same `eventId`; the system processes the first and idempotently skips the duplicate.

---

## Decision 13: Distributed Order Saga Orchestrator with Compensating Transactions

### 1. Problem
In an omnichannel retail system, an order spans multiple distinct lifecycle stages: Stock Reservation -> Payment Capture -> Order Allocation -> Fulfillment Routing. If a payment fails or gateway times out, the stock reserved at checkout must be immediately released so other customers can buy it. Distributed 2-Phase Commit (2PC) blocks all participants and degrades availability.

### 2. Naive Solution
Synchronous blocking calls between Order, Payment, and Inventory services; if any HTTP call fails, attempt immediate reverse HTTP calls.

### 3. Limitation of Naive Solution
If the server crashes mid-flight or the network drops during the compensation call, reserved stock is permanently leaked. Synchronous HTTP coupling makes the entire checkout chain as fragile as its weakest link.

### 4. Chosen Solution
**Orchestrated Saga Pattern with Asynchronous Compensations:**
- Orchestrator: `src/modules/sagas/orderSaga.orchestrator.js` listening to Kafka topics (`payment-events`).
- **Happy Path:** When `PaymentCaptured` event is received, verify Inbox, transition Order status from `CONFIRMED` to `ALLOCATED`, and publish `OrderAllocated`.
- **Compensation Path:** When `PaymentFailed` event is received, execute compensating transaction:
  1. Atomically release reserved stock at the designated location (`availableStock: +qty, reservedStock: -qty`).
  2. Mark the `Reservation` record as `CANCELLED`.
  3. Transition Order status to `PAYMENT_FAILED`.
  4. Write audit ledger entry explaining the cancellation reason.

### 5. Why Chosen Solution is Better
- High system availability: each step executes independently without holding database locks across services.
- Resilient recovery: compensating transactions run reliably from the event bus even if payment capture failed minutes after order placement.

### 6. Trade-offs
Requires handling intermediate states (`CONFIRMED`, `ALLOCATED`, `PAYMENT_FAILED`) in the UI and business reporting.

### 7. How to Test
Executed in `tests/integration/saga.test.js`: Subtest 2 verifies positive transition to `ALLOCATED`; Subtest 3 verifies automated compensation releasing stock and marking order `PAYMENT_FAILED` on `PaymentFailed`.

---

## Decision 14: Omnichannel Proximity Routing & BOPIS (Store vs Warehouse)

### 1. Problem
A national retail customer orders items online. Fulfilling every order from a central warehouse introduces high courier costs and multi-day delivery times. Conversely, blindly fulfilling from local stores risks depleting local shelf inventory or routing to stores with zero stock.

### 2. Naive Solution
Fulfill all online orders from a single central warehouse, or pick a random store in the customer's state.

### 3. Limitation of Naive Solution
Sub-optimal unit economics: high shipping freight, slow delivery times, and rampant store stockouts.

### 4. Chosen Solution
**Intelligent Proximity Fulfillment Routing Engine:**
1. Indexed with MongoDB GeoJSON `2dsphere` spatial indexes.
2. Query locations sorted by spherical distance from customer coordinates (`$near`).
3. For each nearby location, verify real-time available stock for all line items.
4. If a local store within 30km has all items in stock, route as `SHIP_FROM_STORE` (same-day / low-cost).
5. If local stores lack sufficient stock, fallback to the nearest `REGIONAL_WAREHOUSE` or `DISTRIBUTION_CENTER`.
6. For Click & Collect / BOPIS orders: verify dedicated store shelf stock and reserve instantly for customer in-store pickup.

### 5. Why Chosen Solution is Better
Minimizes last-mile fulfillment cost, maximizes inventory turns, and provides instant BOPIS eligibility confirmation for local shoppers.

### 6. Trade-offs
Requires keeping location geospatial coordinates updated and querying inventory across candidate locations.

### 7. How to Test
Tested in `tests/integration/fulfillment_analytics.test.js` Subtests 1, 2, and 3 verifying proximity resolution, BOPIS verification, and inter-store stock transfers.

---

## Decision 15: Real-Time Operational Analytics via MongoDB Aggregation Pipelines

### 1. Problem
Retail operations directors need live visibility into store-level Gross Merchandise Value (GMV), network stockouts, and omnichannel channel splits (BOPIS vs Delivery) without overloading operational OLTP transaction tables.

### 2. Naive Solution
Run JavaScript loops in memory: load all orders into Node.js arrays and compute `.reduce()` or `.filter()`.

### 3. Limitation of Naive Solution
Node.js processes run out of memory when querying thousands of orders, block the single-threaded event loop for seconds, and cripple API responsiveness.

### 4. Chosen Solution
**Targeted Multi-Stage MongoDB Aggregation Pipelines (`src/modules/analytics/analytics.service.js`):**
- Utilizes `$match` with selective compound index filters (date ranges, confirmed order statuses).
- Uses `$group` and accumulator operators (`$sum`, `$avg`) executed natively in the C++ MongoDB query engine.
- `$lookup` joins store metadata efficiently on indexed foreign keys.
- Computed metrics: Store GMV, Average Order Value (AOV), total network inventory health, and revenue channel split.

### 5. Why Chosen Solution is Better
Sub-100ms execution on server, minimal network serialization payload, zero memory strain on Node.js application containers.

### 6. Trade-offs
High aggregation complexity requires careful compound indexing on `{ status: 1, createdAt: 1, fulfillmentLocationId: 1 }`.

### 7. How to Test
Tested in `tests/integration/fulfillment_analytics.test.js` Subtests 4, 5, and 6 asserting GMV calculations, inventory health counters, and BOPIS revenue splits.

---

## Decision 16: Autonomous AI Shopping Assistant with Gemini Function Calling & Qdrant RAG

### 1. Problem
Traditional keyword product search fails when customers ask complex natural language questions (e.g. "Do you have any noise-canceling headphones in stock near Dallas, and can I pick them up today?"). Pure LLM chatbots hallucinate prices and do not have access to live inventory databases.

### 2. Naive Solution
Dump database tables into the LLM system prompt on every user query.

### 3. Limitation of Naive Solution
Exceeds context token windows, incurs massive API latency and cost, and still suffers from hallucination because the LLM is not grounded in real-time inventory balances.

### 4. Chosen Solution
**Gemini AI Service with Native Function Calling & Qdrant Vector Search:**
1. **Semantic Search via Qdrant Cloud:** Product embeddings (768-dim) are stored in Qdrant with cosine similarity search to retrieve semantically matching items even with typos or descriptive queries.
2. **Gemini Native Function Calling (`retailTools.js`):**
   - `check_product_stock`: Real-time inventory query across store locations.
   - `find_nearest_store`: Geospatial search for stores within a given radius.
   - `track_order`: Live order status and tracking query.
3. If the user asks a transactional or stock question, Gemini autonomously executes the tool call against the backend service, inspects the verified database JSON response, and generates an accurate, hallucination-free answer.

### 5. Why Chosen Solution is Better
Combines the natural conversational intelligence of Generative AI with the strict mathematical accuracy of live backend database queries. Zero hallucinated inventory or fake order statuses.

### 6. Trade-offs
Requires external API keys (Gemini, Qdrant) and handling network latency from external AI providers.

### 7. How to Test
Unit and integration tests verifying tool schemas, mock responses, and fallback error handling when AI credentials are not configured.

