---
title: LiveBid Docker quickstart
description: Run, explore, update, and troubleshoot the complete LiveBid stack with Docker Compose
ms.date: 2026-10-03
ms.topic: tutorial
keywords:
  - docker compose
  - next.js
  - postgresql
  - redis
estimated_reading_time: 8
---

## What you will run

Docker Compose starts the complete local LiveBid stack:

| Service | Purpose | Host access |
|---------|---------|-------------|
| `livebid` | Next.js marketplace, administrator portal, and API | Port `3001` |
| `worker` | Auction lifecycle, cleanup, and outbox processing | Internal only |
| `postgres` | Authoritative marketplace data | Port `5432` |
| `redis` | Rate limiting and event publication | Port `6379` |

PostgreSQL and Redis data persist in named Docker volumes when the containers
stop or restart.

## Prerequisites

Install:

* [Git](https://git-scm.com/)
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) on Windows
  or macOS
* Docker Engine with the Compose plugin on Linux

Confirm Docker is ready:

```bash
docker version
docker compose version
```

Both commands must return successfully before continuing.

## Start LiveBid

1. Clone the repository:

   ```bash
   git clone https://github.com/KrishnaDistributedcomputing/livebid.git
   cd livebid
   ```

2. Build and start every service:

   ```bash
   docker compose up --detach --build --wait
   ```

3. Confirm all services are running:

   ```bash
   docker compose ps
   ```

   PostgreSQL, Redis, and LiveBid should report `healthy`. The worker should
   report `running`.

4. Verify the application and its dependencies:

   ```bash
   curl --fail http://localhost:3001/api/health
   ```

5. Open the marketplace:

   <http://localhost:3001>

## Load the demonstration marketplace

The seed operation is idempotent. Running it again updates the known
demonstration records instead of creating duplicate accounts.

```bash
docker compose exec \
  -e SEED_PASSWORD=LiveBidDemoPassword123 \
  livebid node scripts/seed.mjs
```

The data set includes:

* One administrator
* Ten sellers
* Twenty buyers
* Thirty-three products
* Live and scheduled shows
* An active auction
* Sample chat messages

Open <http://localhost:3001/admin> and sign in:

```text
Email: admin@livebid.local
Password: LiveBidDemoPassword123
```

See the [administrator guide](admin-guide.md) for account controls and
operational views. See the [end-user guide](user-guide.md) for marketplace
features.

> [!WARNING]
> Use the seed only for local development and disposable test environments.
> Never run it in production.

## Check logs

View recent logs:

```bash
docker compose logs --tail 100 livebid worker
```

Follow logs while reproducing a problem:

```bash
docker compose logs --follow livebid worker
```

Press `Ctrl+C` to stop following logs. The containers continue running.

## Stop and restart

Stop the containers while preserving PostgreSQL and Redis data:

```bash
docker compose down
```

Start them again:

```bash
docker compose up --detach --wait
```

Restart one service:

```bash
docker compose restart livebid
```

## Update the local solution

Pull source changes and rebuild the application image:

```bash
git pull --ff-only
docker compose up --detach --build --wait
docker compose ps
curl --fail http://localhost:3001/api/health
```

Migrations run automatically before the web and worker processes start.

## Use another port

If port `3001` is already in use, set another port before starting Compose.

PowerShell:

```powershell
$env:LIVEBID_PORT = "8080"
docker compose up --detach --build --wait
```

Bash:

```bash
LIVEBID_PORT=8080 docker compose up --detach --build --wait
```

Open <http://localhost:8080>.

## Reset all local data

Stop the stack and permanently remove the PostgreSQL and Redis volumes:

```bash
docker compose down --volumes
```

Start again and rerun the seed command to create a clean demonstration
environment.

> [!CAUTION]
> Removing volumes cannot be undone. Export any data you need before running
> this command.

## Move to production

The local Compose file uses development-friendly defaults and exposes database
ports. Do not publish it directly to the internet.

Production uses `compose.production.yaml` and requires a host-only `.env` file:

```bash
cp .env.production.example .env
chmod 600 .env
docker compose --env-file .env -f compose.production.yaml config --quiet
```

Replace every placeholder, use separate random PostgreSQL and Redis secrets,
set `APP_ORIGIN` to the public HTTPS URL, and pin `LIVEBID_IMAGE` to an
immutable release tag.

Continue with the [production deployment guide](deployment.md) or use the
[GitHub Copilot deployment specification](copilot-deployment-spec.md).

## Troubleshooting

### Docker is unavailable

Start Docker Desktop or the Docker Engine service, then rerun:

```bash
docker version
docker compose version
```

### A port is already allocated

Check which services failed:

```bash
docker compose ps
docker compose logs --tail 100
```

Set `LIVEBID_PORT`, `POSTGRES_PORT`, or `REDIS_PORT` to an unused host port.

### A container is unhealthy

Inspect its status and logs:

```bash
docker compose ps
docker compose logs --tail 200 livebid postgres redis
```

The application health check depends on both PostgreSQL and Redis.

### A source change does not appear

Rebuild and recreate the application and worker:

```bash
docker compose up --detach --build --force-recreate --wait
```

### Administrator sign-in fails

Confirm the seed completed successfully:

```bash
docker compose exec \
  -e SEED_PASSWORD=LiveBidDemoPassword123 \
  livebid node scripts/seed.mjs
```

Use the same password passed through `SEED_PASSWORD`.

### Review the resolved configuration

```bash
docker compose config
```

Do not share production output if it contains resolved secrets.
