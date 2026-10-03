---
title: LiveBid GitHub Copilot deployment specification
description: Copy-ready specification for deploying and validating the LiveBid backend stack
ms.date: 2026-10-03
ms.topic: how-to
keywords:
  - github copilot
  - deployment
  - docker compose
  - postgresql
  - redis
estimated_reading_time: 20
---

## Purpose

Use this specification with GitHub Copilot in VS Code or Copilot CLI to deploy
LiveBid to a Linux host. It defines the expected architecture, inputs,
commands, validation, rollback, and completion report.

The deployment contains:

* One Next.js application container for the visual interface and HTTP API
* One worker container for auction lifecycle and outbox processing
* PostgreSQL 17 for authoritative data
* Redis 7.4 for rate limits and event publication
* Persistent Docker volumes for PostgreSQL and Redis
* An external HTTPS reverse proxy supplied by the operator

> [!IMPORTANT]
> The existing visual interface is not connected to the persistent API. The
> backend is API-first. Payment capture, shipping labels, and live video are
> not implemented and must not be represented as available.

## Completion contract

Copilot must not report success until:

* The repository is on the intended immutable commit or image tag
* `.env` exists only on the deployment host with mode `600`
* Docker Compose configuration validation passes
* PostgreSQL and Redis become healthy
* Database migrations complete
* The application and worker remain running
* `/api/health` returns HTTP 200 with both dependency checks set to `true`
* Account registration and login work over HTTPS
* An administrator can sign in at `/admin` and load operational metrics
* A seller can create a product, show, and auction through the API
* A buyer can bid, chat, and create a fixed-price order
* Logs contain no unhandled startup or migration errors
* A backup and rollback procedure is recorded for the operator

Do not run `npm run db:seed` during production deployment. The seed is limited
to local development and disposable validation environments.

The administrator portal is available at `/admin`. Production administrators
must be provisioned through an approved operational process rather than the
demonstration seed.

## Required operator inputs

Collect these values before issuing commands:

| Input                    | Example                                                   |
|--------------------------|-----------------------------------------------------------|
| Repository URL           | `https://github.com/KrishnaDistributedcomputing/livebid`  |
| Git reference            | Immutable commit SHA or version tag                       |
| Public hostname          | `livebid.example.com`                                     |
| Installation directory   | `/opt/livebid`                                            |
| PostgreSQL database      | `livebid`                                                 |
| PostgreSQL user          | `livebid`                                                 |
| PostgreSQL password      | Unique random alphanumeric secret of at least 32 characters |
| Redis password           | Different random alphanumeric secret of at least 32 characters |
| Image reference          | `ghcr.io/krishnadistributedcomputing/livebid:sha-<commit>` |
| Backup directory         | `/var/backups/livebid`                                    |

Use alphanumeric secrets in connection URLs, or URL-encode reserved
characters. Never paste production secrets into chat, issue comments, commits,
terminal transcripts intended for sharing, or deployment reports.

## GitHub Copilot master prompt

Copy this prompt into GitHub Copilot from the repository root. Replace every
value in angle brackets before use.

```text
Deploy LiveBid from <repository-url> at immutable ref <git-ref> to this Linux
host under /opt/livebid using compose.production.yaml.

Public origin: https://<hostname>
Image: <immutable-image-reference>
PostgreSQL database: <database-name>
PostgreSQL user: <database-user>
Backup directory: /var/backups/livebid

Follow docs/copilot-deployment-spec.md exactly.

Guardrails:
1. Do not print, commit, or transmit secrets.
2. Generate separate PostgreSQL and Redis secrets with at least 32
   alphanumeric characters.
3. Do not expose PostgreSQL or Redis ports publicly.
4. Do not use the latest image tag when an immutable SHA tag is available.
5. Validate Docker Compose before starting services.
6. Stop on migration, health-check, authentication, or API smoke-test failure.
7. Do not delete Docker volumes during update or rollback.
8. Configure HTTPS before testing cookie-based authentication.
9. Record commands and redacted outcomes in the final report.
10. Ask before changing firewall, DNS, or existing reverse-proxy configuration.

Execute these phases:
1. Inspect host prerequisites and existing services.
2. Clone or update the repository without discarding local operator files.
3. Create the host-only .env file from .env.production.example.
4. Validate and pull the immutable image.
5. Start PostgreSQL and Redis, then the application and worker.
6. Verify migrations, health, logs, and API workflows.
7. Configure or verify TLS reverse proxy routing to 127.0.0.1:3001.
8. Create and test a database backup.
9. Produce a redacted completion report with rollback commands.

Do not claim that payments, shipping, streaming, or frontend API integration
are complete.
```

## Phase 1: inspect the host

Copilot should run read-only checks first:

```bash
uname -a
cat /etc/os-release
docker version
docker compose version
git --version
df -h
free -h
ss -lnt
```

Minimum recommendations:

* Two CPU cores
* Four GB of memory
* Twenty GB of free persistent storage
* Docker Engine with the Compose plugin
* Git and curl
* An HTTPS reverse proxy or managed load balancer
* Outbound access to GitHub and GitHub Container Registry

Stop if Docker is unavailable, storage is critically low, or port `3001` is
already owned by an unrelated service.

## Phase 2: prepare the repository

For a new installation:

```bash
sudo install -d -m 0755 -o "$USER" -g "$USER" /opt/livebid
git clone https://github.com/KrishnaDistributedcomputing/livebid.git /opt/livebid
cd /opt/livebid
git fetch --tags --prune
git checkout --detach <git-ref>
git status --short
```

For an existing installation, preserve `.env` and operator-owned files:

```bash
cd /opt/livebid
git status --short
git fetch origin --tags --prune
git checkout --detach <git-ref>
```

Stop if tracked files contain unexpected local changes. Do not reset or delete
them automatically.

## Phase 3: configure secrets

Create the host-only environment file:

```bash
cd /opt/livebid
cp .env.production.example .env
chmod 600 .env
```

Generate secrets without echoing them into shared logs:

```bash
POSTGRES_SECRET="$(openssl rand -hex 24)"
REDIS_SECRET="$(openssl rand -hex 24)"
```

Set these values in `.env`:

```dotenv
POSTGRES_DB=livebid
POSTGRES_USER=livebid
POSTGRES_PASSWORD=<postgres-secret>
REDIS_PASSWORD=<redis-secret>
DATABASE_URL=postgresql://livebid:<postgres-secret>@postgres:5432/livebid
REDIS_URL=redis://:<redis-secret>@redis:6379
APP_ORIGIN=https://<hostname>
LIVEBID_PORT=3001
SESSION_COOKIE_NAME=livebid_session
SESSION_TTL_HOURS=168
LIVEBID_IMAGE=<immutable-image-reference>
```

Confirm file permissions without printing contents:

```bash
stat -c '%a %U %G %n' .env
```

Expected mode is `600`. PostgreSQL and Redis passwords must differ.

## Phase 4: validate configuration

Resolve the Compose model before pulling or starting containers:

```bash
docker compose \
  --env-file .env \
  -f compose.production.yaml \
  config --quiet
```

Confirm that only the application port is published:

```bash
docker compose \
  --env-file .env \
  -f compose.production.yaml \
  config | grep -A 5 'ports:'
```

PostgreSQL and Redis must not have host port mappings in the production file.

## Phase 5: start the stack

Pull the exact image and start the dependency services:

```bash
docker compose \
  --env-file .env \
  -f compose.production.yaml \
  pull

docker compose \
  --env-file .env \
  -f compose.production.yaml \
  up --detach postgres redis
```

Wait for healthy dependencies:

```bash
docker compose \
  --env-file .env \
  -f compose.production.yaml \
  ps
```

Start the application and worker:

```bash
docker compose \
  --env-file .env \
  -f compose.production.yaml \
  up --detach --wait livebid worker
```

Both application and worker run the migration command before their main
process. PostgreSQL advisory locking ensures only one migration process applies
a version.

## Phase 6: verify runtime health

Inspect service status and recent logs:

```bash
docker compose \
  --env-file .env \
  -f compose.production.yaml \
  ps

docker compose \
  --env-file .env \
  -f compose.production.yaml \
  logs --tail 100 livebid worker postgres redis
```

Test the private application port from the host:

```bash
curl --fail --silent --show-error \
  http://127.0.0.1:3001/api/health | jq
```

Expected response:

```json
{
  "status": "ok",
  "service": "livebid-web",
  "checks": {
    "database": true,
    "redis": true
  }
}
```

The response also includes a timestamp. Treat HTTP 503 or a `false` dependency
check as deployment failure.

## Phase 7: configure HTTPS

Cookie authentication uses the `Secure`, `HttpOnly`, and `SameSite=Strict`
attributes in production. Authentication testing must use the public HTTPS
origin.

Configure the existing reverse proxy to:

* Terminate TLS for the configured hostname
* Redirect HTTP to HTTPS
* Forward requests to `http://127.0.0.1:3001`
* Preserve `Host`, `X-Forwarded-For`, and `X-Forwarded-Proto`
* Allow API request bodies required for product descriptions
* Apply reasonable request and connection timeouts

Do not alter DNS, firewall, or proxy configuration without operator approval.
After configuration, verify:

```bash
curl --fail --silent --show-error \
  https://<hostname>/api/health | jq
```

The public origin must exactly match `APP_ORIGIN`, including scheme and port.

## Phase 8: API smoke test

Run the smoke test against HTTPS with a temporary cookie jar. Use unique test
addresses and remove test records later according to the environment policy.

### Register a seller

```bash
curl --fail --silent --show-error \
  --cookie-jar /tmp/livebid-seller.cookies \
  --header 'Content-Type: application/json' \
  --header 'Origin: https://<hostname>' \
  --data '{
    "email":"seller-smoke@example.com",
    "username":"seller-smoke",
    "password":"ReplaceSmokePassword123",
    "role":"SELLER"
  }' \
  https://<hostname>/api/auth/register | jq
```

### Create a product

```bash
PRODUCT_ID="$(
  curl --fail --silent --show-error \
    --cookie /tmp/livebid-seller.cookies \
    --header 'Content-Type: application/json' \
    --header 'Origin: https://<hostname>' \
    --data '{
      "title":"Deployment smoke-test product",
      "description":"Temporary product created by deployment validation.",
      "category":"Test",
      "condition":"New",
      "currency":"USD",
      "buyNowPriceMinor":2500,
      "auctionStartPriceMinor":1000,
      "quantity":2,
      "imageUrl":"/livebid-cards.jpg"
    }' \
    https://<hostname>/api/products | jq -r '.product.id'
)"
test -n "$PRODUCT_ID"
```

### Create and start a show

```bash
SHOW_ID="$(
  curl --fail --silent --show-error \
    --cookie /tmp/livebid-seller.cookies \
    --header 'Content-Type: application/json' \
    --header 'Origin: https://<hostname>' \
    --data "{
      \"title\":\"Deployment smoke-test show\",
      \"description\":\"Temporary validation show.\",
      \"scheduledAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
    }" \
    https://<hostname>/api/shows | jq -r '.show.id'
)"

curl --fail --silent --show-error \
  --request PATCH \
  --cookie /tmp/livebid-seller.cookies \
  --header 'Content-Type: application/json' \
  --header 'Origin: https://<hostname>' \
  --data '{"status":"LIVE"}' \
  "https://<hostname>/api/shows/$SHOW_ID" | jq
```

### Create an auction

```bash
START_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
END_AT="$(date -u -d '+10 minutes' +%Y-%m-%dT%H:%M:%SZ)"

AUCTION_ID="$(
  curl --fail --silent --show-error \
    --cookie /tmp/livebid-seller.cookies \
    --header 'Content-Type: application/json' \
    --header 'Origin: https://<hostname>' \
    --data "{
      \"showId\":\"$SHOW_ID\",
      \"productId\":\"$PRODUCT_ID\",
      \"startPriceMinor\":1000,
      \"bidIncrementMinor\":100,
      \"startsAt\":\"$START_AT\",
      \"endsAt\":\"$END_AT\",
      \"antiSnipeSeconds\":5,
      \"auctionType\":\"STANDARD\"
    }" \
    https://<hostname>/api/auctions | jq -r '.auction.id'
)"
test -n "$AUCTION_ID"
```

### Register a buyer and bid

```bash
curl --fail --silent --show-error \
  --cookie-jar /tmp/livebid-buyer.cookies \
  --header 'Content-Type: application/json' \
  --header 'Origin: https://<hostname>' \
  --data '{
    "email":"buyer-smoke@example.com",
    "username":"buyer-smoke",
    "password":"ReplaceBuyerPassword123",
    "role":"BUYER"
  }' \
  https://<hostname>/api/auth/register | jq

IDEMPOTENCY_KEY="$(cat /proc/sys/kernel/random/uuid)"
curl --fail --silent --show-error \
  --cookie /tmp/livebid-buyer.cookies \
  --header 'Content-Type: application/json' \
  --header 'Origin: https://<hostname>' \
  --header "Idempotency-Key: $IDEMPOTENCY_KEY" \
  --data '{"maxBidMinor":2500,"currency":"USD"}' \
  "https://<hostname>/api/auctions/$AUCTION_ID/bids" | jq
```

Repeat the same bid request with the same key. The response must contain
`"idempotent": true` and must not add another bid sequence.

### Send chat and create an order

```bash
curl --fail --silent --show-error \
  --cookie /tmp/livebid-buyer.cookies \
  --header 'Content-Type: application/json' \
  --header 'Origin: https://<hostname>' \
  --data '{"body":"Deployment smoke test"}' \
  "https://<hostname>/api/shows/$SHOW_ID/chat" | jq

curl --fail --silent --show-error \
  --cookie /tmp/livebid-buyer.cookies \
  --header 'Content-Type: application/json' \
  --header 'Origin: https://<hostname>' \
  --data "{\"productId\":\"$PRODUCT_ID\",\"quantity\":1}" \
  https://<hostname>/api/orders | jq
```

Remove temporary cookie files:

```bash
rm -f /tmp/livebid-seller.cookies /tmp/livebid-buyer.cookies
```

## Phase 9: verify persistence and worker behavior

Restart the application and confirm data remains:

```bash
docker compose \
  --env-file .env \
  -f compose.production.yaml \
  restart livebid worker

curl --fail --silent --show-error \
  https://<hostname>/api/products | jq
```

Check worker activity:

```bash
docker compose \
  --env-file .env \
  -f compose.production.yaml \
  logs --tail 100 worker
```

The worker starts scheduled auctions, finalizes expired auctions, creates one
winning order, removes expired sessions, and publishes pending outbox events.

## Verify administrator access

In a disposable seeded environment, open:

```text
https://<hostname>/admin
```

Sign in with `admin@livebid.local` and the configured `SEED_PASSWORD`. Confirm:

* The overview metrics load
* Users, products, shows, auctions, and orders display
* User role and status filters work
* Suspending a disposable user revokes access
* Reactivating that user restores account status
* Both changes appear in the audit table

Do not run the seed or use demonstration administrator credentials in
production.

## Phase 10: backup and restore readiness

Create a restricted backup directory:

```bash
sudo install -d -m 0700 /var/backups/livebid
```

Create a compressed PostgreSQL backup:

```bash
set -a
. /opt/livebid/.env
set +a

docker compose \
  --env-file .env \
  -f compose.production.yaml \
  exec -T postgres \
  pg_dump --format=custom --no-owner \
    --username "$POSTGRES_USER" "$POSTGRES_DB" \
  > "/var/backups/livebid/livebid-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Confirm the file is non-empty and run `pg_restore --list` against it. Perform a
full restore exercise in an isolated environment before launch. Do not test
restore by overwriting the production database.

Redis contains recoverable coordination and event-delivery state. PostgreSQL
is authoritative for accepted bids, auctions, products, and orders.

## Update procedure

1. Create a PostgreSQL backup.
2. Fetch the intended Git ref.
3. Set `LIVEBID_IMAGE` to an immutable image tag.
4. Validate the Compose model.
5. Pull the image.
6. Recreate the application and worker.
7. Verify health, logs, migrations, and API reads.

```bash
docker compose --env-file .env -f compose.production.yaml pull livebid worker
docker compose --env-file .env -f compose.production.yaml up \
  --detach --wait --no-deps livebid worker
```

Migrations are forward-only. Review every migration before deployment and
confirm backward compatibility with the previous image.

## Rollback procedure

Set `LIVEBID_IMAGE` to the previous immutable SHA tag and recreate only the
application and worker:

```bash
docker compose --env-file .env -f compose.production.yaml up \
  --detach --wait --no-deps livebid worker
```

Do not remove PostgreSQL or Redis volumes. If a migration is not backward
compatible, stop and follow the migration-specific recovery plan rather than
starting the old application against a newer schema.

## Troubleshooting

### Application is unhealthy

```bash
docker compose --env-file .env -f compose.production.yaml ps
docker compose --env-file .env -f compose.production.yaml logs --tail 200 livebid
```

Check that `DATABASE_URL`, `REDIS_URL`, and `APP_ORIGIN` contain no unresolved
placeholders.

### Migration failed

Inspect application and worker logs. The migration runner rolls back the
failing SQL file. Correct the root cause, then restart the affected containers.
Never mark a failed migration as applied manually.

### Authentication cookie is missing

Confirm the request uses HTTPS, the hostname matches `APP_ORIGIN`, and the
reverse proxy preserves the original host and scheme.

### API returns `INVALID_ORIGIN`

Set `APP_ORIGIN` to the exact browser origin. Do not weaken origin validation
to work around a proxy configuration error.

### Worker is not finalizing auctions

Check worker logs and PostgreSQL connectivity. Confirm the auction is `ACTIVE`
and its `ends_at` value is earlier than the database clock.

## Required completion report

Copilot should provide a redacted report containing:

* Host and operating-system summary
* Repository commit and immutable image tag
* Compose services and health states
* Migration versions applied
* Public health endpoint result
* API smoke-test results without credentials or cookies
* Backup filename, size, and validation result
* Reverse-proxy and TLS status
* Remaining limitations
* Exact rollback image and command

The report must state that frontend API integration, payments, shipping, and
streaming remain unavailable.

## Related documents

* Review the [technical design](technical-design.md) for consistency and
  security contracts
* Review the [architecture guide](architecture.md) for system boundaries
* Use the [deployment guide](deployment.md) for shorter operator instructions
* Use the [user guide](user-guide.md) for the current visual demonstration
