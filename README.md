# OmniRetail — Intelligent Omnichannel Commerce & Inventory Management System

![Node.js](https://img.shields.io/badge/Node.js-v22.13-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-v4.21-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-Upstash-DC382D?logo=redis&logoColor=white)
![Apache Kafka](https://img.shields.io/badge/Apache_Kafka-Event--Driven-231F20?logo=apachekafka&logoColor=white)
![Security](https://img.shields.io/badge/Argon2id-Memory--Hard-4A90E2)
![Tests](https://img.shields.io/badge/Automated_Tests-100%25_Passing-brightgreen)

> An enterprise-grade, Walmart-inspired omnichannel retail backend engineered to demonstrate high-concurrency inventory allocation, distributed transaction management, transactional outbox event streaming with Apache Kafka, memory-hard Argon2id authentication with refresh token family rotation, and Generative AI retail operations.

---

## Architecture Overview

OmniRetail is architected as a **Modular Monolith** with decoupled asynchronous worker runtimes (`server.js` for API traffic and `worker.js` for Kafka consumers and background timers):

```
                     ┌────────────────────────────────────────┐
                     │          Clients / Frontend           │
                     └───────────────────┬────────────────────┘
                                         │ HTTPS / Cookie Auth / CSRF
                                         ▼
                     ┌────────────────────────────────────────┐
                     │        API Gateway / Express App       │
                     │  (Security, Auth, Rate Limiter, Docs)  │
                     └───────┬────────────────────────┬───────┘
                             │                        │
               Synchronous   │                        │ Synchronous
               Read / Write  ▼                        ▼ Fast Cache / Lock
┌──────────────────────────────────────┐    ┌───────────────────────────────────┐
│     Domain Services & Repositories   │    │            Redis Cluster          │
│   (Catalog, Orders, Inventory, etc.) │    │ (Session store, cache, rate-limit,│
└──────────────────┬───────────────────┘    │  short-lived coordination)        │
                   │                        └───────────────────────────────────┘
                   │ Atomic Transactions (MongoDB Atlas)
                   ▼
┌────────────────────────────────────────────────────────┐
│               MongoDB Atlas (Replica Set)              │
│  - Business Aggregate Collections                      │
│  - Inventory Ledger & Reservation Engine               │
│  - Transactional Outbox (Events to be dispatched)      │
│  - Inbox / Idempotency Collection (Deduplication)      │
└──────────────────┬─────────────────────────────────────┘
                   │ Polling / Change Stream
                   ▼
┌────────────────────────────────────────────────────────┐
│               Transactional Outbox Publisher           │
└──────────────────┬─────────────────────────────────────┘
                   │ At-Least-Once Delivery
                   ▼
┌────────────────────────────────────────────────────────┐
│                  Apache Kafka Event Bus                │
│  - order-events             - inventory-events         │
│  - payment-events           - fulfillment-events       │
│  - shipment-events          - notification-events      │
└─────────┬───────────────────────┬──────────────────────┘
          │                       │
          ▼                       ▼
┌──────────────────┐    ┌──────────────────┐    ┌───────────────────────────┐
│ Inventory Worker │    │  Payment / Saga  │    │    Notification Worker    │
│ (Stock updates,  │    │    Worker        │    │ (Nodemailer, Order alerts,│
│  reconcile)      │    │ (Compensations)  │    │  Email OTP)               │
└──────────────────┘    └──────────────────┘    └───────────────────────────┘
```

---

## Key Engineering Pillars

1. **Strict Clean Code Constraints:**
   - Every function is strictly $\le 40$ physical lines of code (aiming for $10\text{--}25$ lines).
   - Zero business logic in controllers; controllers only handle HTTP mapping and delegates to services.
   - Database operations encapsulated in repositories.
   - Strict validation separation via [Zod](https://zod.dev).
2. **Advanced Authentication & Session Management:**
   - Passwords hashed with **Argon2id** (memory-hard, resistant to GPU/ASIC parallel brute force).
   - Dual-token architecture: Short-lived JWT Access Tokens ($15\text{ min}$) + Opaque Refresh Tokens ($7\text{ days}$).
   - **Token Family Rotation (RFC 6819):** Replaying an already-rotated refresh token immediately detects token theft and automatically revokes the entire user session family across all devices.
   - Exclusively `HttpOnly`, `Secure`, `SameSite=Lax/Strict` cookies (immune to XSS token exfiltration).
   - Multi-layer CSRF defense (Origin whitelist + custom header requirement).
   - Cryptographically secure 6-digit OTPs stored as keyed HMAC in Redis with 5-minute TTL, 60-second cooldown, and 5-attempt limits.
3. **Resilient Distributed Systems:**
   - Transactional Outbox Pattern to eliminate the Dual-Write Problem between MongoDB and Kafka.
   - Redis failover: degrades gracefully to MongoDB read replicas without silent data corruption.
   - Preserved raw request buffers (`req.rawBody`) before JSON parsing for byte-perfect Razorpay webhook HMAC verification.

---

## Project Structure

```
omni-retail-backend/
├── .env.example
├── .gitignore
├── docker-compose.yml
├── package.json
├── README.md
├── docs/
│   ├── architecture.md
│   └── interview-explanations.md
├── src/
│   ├── app.js
│   ├── server.js
│   ├── worker.js
│   ├── config/
│   │   ├── env.config.js
│   │   ├── database.config.js
│   │   ├── redis.config.js
│   │   └── kafka.config.js
│   ├── database/
│   │   └── connection.js
│   ├── infrastructure/
│   │   ├── redis/
│   │   │   └── redis.client.js
│   │   ├── kafka/
│   │   │   ├── kafka.client.js
│   │   │   ├── producer.js
│   │   │   └── topics.js
│   │   ├── email/
│   │   │   ├── mailer.js
│   │   │   └── emailTemplates/
│   │   └── shutdown.js
│   ├── common/
│   │   ├── constants/
│   │   │   ├── roles.js
│   │   │   └── accountStatus.js
│   │   ├── errors/
│   │   │   ├── AppError.js
│   │   │   └── errorCodes.js
│   │   ├── middleware/
│   │   │   ├── authenticate.js
│   │   │   ├── authorize.js
│   │   │   ├── csrfProtection.js
│   │   │   ├── errorHandler.js
│   │   │   ├── rateLimiter.js
│   │   │   ├── requestLogger.js
│   │   │   └── validateRequest.js
│   │   └── utils/
│   │       ├── asyncHandler.js
│   │       ├── cookieOptions.js
│   │       ├── crypto.utils.js
│   │       ├── jwt.utils.js
│   │       ├── logger.js
│   │       └── responseHandler.js
│   └── modules/
│       ├── auth/
│       │   ├── auth.controller.js
│       │   ├── auth.routes.js
│       │   ├── auth.service.js
│       │   ├── auth.validator.js
│       │   ├── otp.service.js
│       │   ├── session.model.js
│       │   └── session.repository.js
│       └── users/
│           ├── user.controller.js
│           ├── user.model.js
│           ├── user.repository.js
│           └── user.routes.js
└── tests/
    ├── unit/
    │   ├── AppError.test.js
    │   ├── authorize.test.js
    │   ├── crypto.test.js
    │   ├── errorHandler.test.js
    │   ├── jwt.test.js
    │   ├── responseHandler.test.js
    │   └── validateRequest.test.js
    └── integration/
        ├── auth.test.js
        ├── connection.test.js
        └── health.test.js
```

---

## Local Setup & Quickstart

### 1. Prerequisites
- Node.js `v20.0.0+` (developed on `v22.13.1`)
- Docker & Docker Compose (optional for local Kafka/Redis; cloud credentials supported)

### 2. Environment Configuration
Copy `.env.example` to `.env` and fill in the values:
```bash
cp .env.example .env
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Run Automated Tests
```bash
npm test
```

### 5. Start Development Server
```bash
npm run dev
```

---

## Milestone Progress

- [x] **Milestone 1 — Backend Foundation** (Express, Zod env validation, MongoDB Atlas, Redis, Kafka client, structured logging, health probes, centralized errors)
- [x] **Milestone 2 — Advanced Authentication** (Argon2id, dual-token JWT, refresh token rotation with reuse detection, HttpOnly cookies, CSRF, Redis OTP, RBAC)
- [x] **Milestone 3 — Product Catalogue & Pricing** (Hierarchical categories, SKU uniqueness, weighted text search, Cloudinary uploads, Redis cache-aside, server-side pricing engine)
- [ ] **Milestone 4 — Concurrency-Safe Inventory Engine**
- [ ] **Milestone 5 — Cart & Order Management (Outbox Pattern)**
- [ ] **Milestone 6 — Razorpay Payment Gateway & Webhook Signature Verification**
- [ ] **Milestone 7 — Distributed Systems & Order Saga Orchestration**
- [ ] **Milestone 8 — Omnichannel Fulfillment & Sales Analytics**
- [ ] **Milestone 9 — Gemini GenAI Assistant & Qdrant RAG Pipeline**
- [ ] **Milestone 10 — Production Quality & Concurrency Benchmarking**

---

## License
MIT License. Developed for Staff/Senior Backend Software Engineering demonstration.
