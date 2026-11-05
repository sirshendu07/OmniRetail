# OmniRetail — Architecture & System Design Documentation

## 1. System Overview
OmniRetail is an enterprise-grade omnichannel retail backend platform modeled on Walmart's multi-store and warehouse fulfillment topology. It is engineered to tackle real-world distributed systems challenges: concurrent inventory reservations without overselling, dual-token cryptographic authentication with session revocation, transactional outbox event publishing to Apache Kafka, and resilient payment workflows.

```
                          ┌───────────────────────────┐
                          │   Client / Frontend SPA   │
                          └─────────────┬─────────────┘
                                        │ HTTPS / HttpOnly Cookies / CSRF
                                        ▼
                          ┌───────────────────────────┐
                          │    Express API Gateway    │
                          │ (Security, CORS, Tracing) │
                          └─────────────┬─────────────┘
                                        │
             ┌──────────────────────────┴──────────────────────────┐
             ▼                                                     ▼
┌──────────────────────────┐                             ┌───────────────────┐
│     Domain Services      │                             │   Redis Cluster   │
│ (Catalog, Orders, etc.)  │                             │ (Session cache,   │
└────────────┬─────────────┘                             │  rate limiting)   │
             │                                           └───────────────────┘
             │ Multi-document ACID Transactions
             ▼
┌────────────────────────────────────────────────────────┐
│               MongoDB Atlas (Replica Set)              │
│  - Core aggregates (Users, Orders, Inventory, Ledger)  │
│  - Transactional Outbox Collection                     │
│  - Idempotency & ProcessedEvents Registry              │
└────────────┬───────────────────────────────────────────┘
             │
             │ Asynchronous Polling / Change Stream
             ▼
┌──────────────────────────┐
│ Outbox Publisher Service │
└────────────┬─────────────┘
             │ At-least-once Delivery
             ▼
┌────────────────────────────────────────────────────────┐
│                  Apache Kafka Event Bus                │
│  Topics: order-events, inventory-events, etc.          │
└────────────┬───────────────────────────┬───────────────┘
             │                           │
             ▼                           ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│ Inventory Worker Service │  │  Notification Service    │
└──────────────────────────┘  └──────────────────────────┘
```

## 2. Core Architectural Principles
1. **Modular Monolith with Isolated Workers:**
   Single deployable codebase with strict domain module boundaries (`src/modules/*`), decoupling synchronous HTTP request handling from asynchronous Kafka event consumers and background reconciliation workers.
2. **Layered Domain Separation:**
   - **Routes:** Route definitions, URL parameters, and middleware attachment.
   - **Validators:** Zod schemas executed before controllers to reject invalid payloads early.
   - **Controllers:** HTTP protocol handling only (extract input, delegate to services, invoke `responseHandler`).
   - **Services:** Pure business logic, domain invariant enforcement, and multi-model coordination.
   - **Repositories:** Direct Mongoose interactions and atomic queries.
3. **Strict Function Length:**
   Every function is strictly $\le 40$ physical lines of code (targeting 10–25 lines) with single-responsibility design.
4. **Resilient Failover:**
   External caching layers (Redis) degrade gracefully without breaking primary transactional flows. MongoDB Atlas replica-set ACID transactions serve as the single source of truth for all financial and inventory data.
