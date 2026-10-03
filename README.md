---
title: LiveBid
description: Live-commerce marketplace with a persistent API and production Docker stack
ms.date: 2026-10-03
ms.topic: overview
---

## Overview

LiveBid is an original, mobile-first live-commerce prototype inspired by the
product requirements in `WhatNot_spec.md`. It demonstrates the primary buyer
journey in a responsive Next.js application:

* Browse live shows and marketplace products
* Watch a timed auction and place deliberate incremental bids
* Enter a private maximum bid
* Follow a seller and participate in live chat
* Add marketplace items to a cart
* Review purchases and fulfillment status
* Navigate a seller studio preview

The repository includes a PostgreSQL and Redis backend, authenticated API
routes, an auction worker, a multi-stage Docker build, a non-root production
runtime, health checks, and Docker Compose configurations.

> [!IMPORTANT]
> The visual interface remains a browser-held demonstration and is not yet
> connected to the backend API. The API persists accounts, catalog data, shows,
> auctions, chat, and orders. Real payments, shipping, and streaming providers
> are not included, so do not use this release for financial transactions.

## Documentation

| Guide                                      | Purpose                                                        |
|--------------------------------------------|----------------------------------------------------------------|
| [User guide](docs/user-guide.md)           | Walk through discovery, bidding, shopping, orders, and studio   |
| [Administrator guide](docs/admin-guide.md) | Operate users, products, shows, auctions, orders, and audit     |
| [Architecture](docs/architecture.md)       | Review the current prototype and planned platform architecture  |
| [Technical design](docs/technical-design.md) | Implement modules, data, APIs, reliability, and security      |
| [Copilot deployment specification](docs/copilot-deployment-spec.md) | Deploy and operate the backend stack with GitHub Copilot |
| [Deployment guide](docs/deployment.md)     | Run and publish LiveBid with Vercel, Docker, GHCR, or Azure      |

## Architecture at a glance

The current release combines the existing client-side demonstration with a
persistent API and worker deployment.

```mermaid
flowchart LR
    User["Buyer or seller"] --> Browser["Web browser"]
    Browser --> Next["Next.js application"]
    Next --> UI["React LiveBid interface"]
    Next --> API["Authenticated API routes"]
    API --> PostgreSQL["PostgreSQL"]
    API --> Redis["Redis"]
    PostgreSQL --> Worker["Auction and outbox worker"]
    Next --> Health["GET /api/health"]
    UI --> Memory["In-memory demo state"]
    Next --> Media["Local and remote images"]
```

The planned marketplace adds server-authoritative auctions, persistent data,
realtime delivery, streaming, payments, and shipping. See the
[architecture guide](docs/architecture.md) for the current component model,
interaction sequence, delivery pipeline, and target platform boundary. The
[technical design](docs/technical-design.md) defines the proposed
implementation contracts and quality requirements.

## Technology

| Layer            | Implementation                         |
|------------------|----------------------------------------|
| Application      | Next.js 15 App Router                  |
| User interface   | React 19.1, TypeScript, Tailwind CSS 4 |
| Database         | PostgreSQL 17                          |
| Cache and events | Redis 7.4                              |
| Authentication   | Password hashing and HTTP-only sessions |
| Icons            | Lucide React                           |
| Package manager  | pnpm 10.18.3                           |
| Container        | Node.js 24 Alpine, standalone Next.js  |
| Health check     | `GET /api/health`                      |

## Repository layout

```text
livebid/
|-- .github/workflows/       Container build and GHCR publishing
|-- db/migrations/           Versioned PostgreSQL schema
|-- docs/                    Architecture, user, design, and deployment guides
|-- public/                  Static product media
|-- scripts/                 Migration, seed, and worker processes
|-- src/
|   |-- app/                 Next.js pages and backend API routes
|   |-- components/          Interactive LiveBid application
|   `-- lib/                 Database, Redis, auth, validation, and auctions
|-- compose.yaml             Local container orchestration
|-- compose.production.yaml  Published-image deployment
|-- Dockerfile               Multi-stage production image
|-- next.config.ts           Standalone production output
|-- package.json             Scripts and dependencies
`-- pnpm-lock.yaml           Reproducible dependency versions
```

## Prerequisites

Install the following tools before running the project:

* [Node.js 20 or newer](https://nodejs.org/)
* [pnpm 10.18.3](https://pnpm.io/installation)
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) for the
  container workflow
* [Git](https://git-scm.com/) for cloning the repository

Verify the tools:

```powershell
node --version
pnpm --version
docker --version
docker compose version
git --version
```

If `pnpm` is unavailable, install the project version:

```powershell
npm install --global pnpm@10.18.3
```

On Windows without administrator access, install it in your user profile for
the current PowerShell session:

```powershell
npm install --global pnpm@10.18.3 --prefix "$env:LOCALAPPDATA\pnpm"
$env:Path = "$env:LOCALAPPDATA\pnpm;$env:Path"
pnpm --version
```

## Run from source

1. Clone the repository and enter the project directory:

   ```powershell
   git clone https://github.com/KrishnaDistributedcomputing/livebid.git
   Set-Location livebid
   ```

2. Install the locked dependencies:

   ```powershell
   pnpm install --frozen-lockfile
   ```

3. Start the development server:

   ```powershell
   pnpm dev
   ```

4. Open <http://localhost:3000>.

5. Confirm the health endpoint in another terminal:

   ```powershell
   Invoke-RestMethod http://localhost:3000/api/health
   ```

6. Stop the development server with `Ctrl+C`.

## Load demonstration data

The idempotent seed command creates one administrator, ten sellers, twenty
buyers, thirty-three products, shows, an active auction, and sample chat. Set
one temporary password for all demonstration accounts:

```powershell
$env:DATABASE_URL = "postgresql://livebid:livebid-local-password@localhost:5432/livebid"
$env:SEED_PASSWORD = "ReplaceWithDemoPassword123"
npm run db:migrate
npm run db:seed
```

| Role          | Example accounts                                                                |
|---------------|---------------------------------------------------------------------------------|
| Administrator | `admin@livebid.local`                                                           |
| Seller        | `seller`, `sole-room`, `grain-house`, `panel-house`, and `trail-cache`          |
| Buyer         | `demo-buyer`, `collector77`, `patchcollector`, and `market-buyer-01` through `15` |

All account emails use the `@livebid.local` suffix. For example, the SOLE ROOM
seller signs in as `sole-room@livebid.local`.

> [!WARNING]
> Seed data is intended for local development and disposable test
> environments. Do not run the seed command in production.

## Validate the source build

Run the same checks used before publishing changes:

```powershell
pnpm lint
pnpm build
```

Run the optimized application without Docker:

```powershell
pnpm start
```

The optimized server listens on <http://localhost:3000> by default.

## Run with Docker Compose

Docker Compose builds the image and starts PostgreSQL, Redis, the application,
and the auction worker. The default host port is `3001`, which avoids conflicts
with a local Next.js development server on port `3000`.

1. Start Docker Desktop.

2. Build and start LiveBid from the repository root:

   ```powershell
   docker compose up --detach --build --wait
   ```

3. Confirm the container state:

   ```powershell
   docker compose ps
   ```

4. Open <http://localhost:3001>.

5. Test the container health endpoint:

   ```powershell
   Invoke-RestMethod http://localhost:3001/api/health
   ```

6. Follow application logs when troubleshooting:

   ```powershell
   docker compose logs --follow livebid
   ```

7. Stop and remove the container:

   ```powershell
   docker compose down
   ```

Override the host port when `3001` is unavailable:

```powershell
$env:LIVEBID_PORT = "8080"
docker compose up --detach --build --wait
```

Open <http://localhost:8080> after the container becomes healthy.

## Run with Docker CLI

Use these commands when Compose is not available:

1. Build the image:

   ```powershell
   docker build --tag livebid-web:local .
   ```

2. Start a named container:

   ```powershell
   docker run --detach `
     --name livebid `
     --publish 3001:3000 `
     --restart unless-stopped `
     livebid-web:local
   ```

3. Verify its health and response:

   ```powershell
   docker ps --filter "name=livebid"
   Invoke-RestMethod http://localhost:3001/api/health
   ```

4. Stop and remove it:

   ```powershell
   docker stop livebid
   docker rm livebid
   ```

## Deploy

The repository supports two production paths:

* Connect the GitHub repository to Vercel to deploy the Next.js source
* Publish the Docker image to GitHub Container Registry and run it on a
  container platform

Pushes to `main` automatically publish these image tags:

```text
ghcr.io/krishnadistributedcomputing/livebid:latest
ghcr.io/krishnadistributedcomputing/livebid:main
ghcr.io/krishnadistributedcomputing/livebid:sha-<commit>
```

See the [deployment guide](docs/deployment.md) for GitHub Container Registry,
Vercel, Linux Docker hosts, and Azure Container Apps instructions.

## Container design

The Dockerfile uses separate dependency, build, and runtime stages. The final
image contains only the Next.js standalone server, static assets, and public
assets. It runs as the unprivileged `nextjs` user and exposes port `3000`.

The image health check calls `http://127.0.0.1:3000/api/health` every 30
seconds. A healthy response has this shape:

```json
{
  "status": "ok",
  "service": "livebid-web"
}
```

## Troubleshooting

### Port is already allocated

Choose another host port:

```powershell
$env:LIVEBID_PORT = "8080"
docker compose up --detach
```

### Container does not become healthy

Inspect the state and recent logs:

```powershell
docker compose ps
docker compose logs --tail 100 livebid
```

### Rebuild after a dependency or source change

Force a clean application container recreation:

```powershell
docker compose up --detach --build --force-recreate --wait
```

### Remove local build artifacts

```powershell
docker compose down
docker image rm livebid-web:local
Remove-Item -Recurse -Force .next
```

## Product roadmap

The source specification describes the planned modular marketplace: durable
auctions, authentication, PostgreSQL, Redis, realtime events, streaming,
payments, shipping, moderation, analytics, and administrative workflows. Those
services remain future implementation work.
