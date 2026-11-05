# OmniRetail — Omnichannel Commerce & Inventory Management System

![Node.js](https://img.shields.io/badge/Node.js-v22.13-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-v4.21-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas_Replica_Set-47A248?logo=mongodb&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-Upstash_TLS-DC382D?logo=redis&logoColor=white)
![Apache Kafka](https://img.shields.io/badge/Apache_Kafka-v4.4.0-231F20?logo=apachekafka&logoColor=white)
![Tests](https://img.shields.io/badge/Automated_Tests-100%25_Passing_(80/80)-brightgreen)

OmniRetail is an enterprise-grade, Walmart-inspired omnichannel retail platform engineered for high-concurrency inventory allocation, transactional outbox event streaming with Apache Kafka, memory-hard Argon2id authentication, and Generative AI shopping operations with native function calling.

---

## Monorepo Structure

```
omni-retail/
├── backend/                  # Production-grade Node.js / Express backend service
│   ├── src/                  # Core application source code (Modular Monolith)
│   ├── tests/                # 21 test suites (Unit, Integration, Concurrency, Resilience)
│   ├── docs/                 # Architecture & 16 Staff/Senior Engineer design decisions
│   ├── package.json          # Backend dependencies & test scripts
│   └── README.md             # Deep-dive backend documentation & API specifications
│
└── frontend/                 # Omnichannel Storefront & Admin Portal (Next.js / React)
    └── README.md             # Frontend roadmap & specifications
```

---

## Quick Navigation

- **[Backend Architecture & System Design](./backend/README.md)**: Full architecture diagrams, concurrency management, transactional outbox pattern, and 80+ automated tests.
- **[Staff / Senior Engineer Interview Explanations](./backend/docs/interview-explanations.md)**: 16 in-depth architectural trade-offs in 7-part format for tier-1 tech interviews.
- **[Frontend Architecture](./frontend/README.md)**: Storefront, BOPIS manager portal, and analytics dashboard.

---

## Quickstart (Backend)

```bash
cd backend
npm install
npm run seed      # Seed MongoDB Atlas with products, inventory, stores, and users
npm test          # Run all 21 test suites (80 tests, 100% passing)
npm run dev       # Start API Gateway on http://localhost:5000
npm run worker    # Start Background Worker runtime (Outbox, Sweeper, Saga Orchestrator)
```

For hosting on Render, refer to the [Render Deployment Guide](./backend/README.md#local-setup--step-by-step-run-guide).
