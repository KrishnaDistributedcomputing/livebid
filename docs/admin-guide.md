---
title: LiveBid administrator guide
description: Operational guide for the LiveBid administrator portal
ms.date: 2026-10-03
ms.topic: how-to
keywords:
  - administrator
  - operations
  - user management
  - audit
estimated_reading_time: 14
---

## Administrator responsibilities

The LiveBid administrator portal provides operational visibility and account
controls for the marketplace. Administrators can:

* Monitor account, catalog, show, auction, order, and event totals
* Search and filter buyer, seller, and administrator accounts
* Suspend or reactivate accounts with a required reason
* Review seller inventory, scheduled shows, auctions, and orders
* Inspect immutable administrative audit events

The portal is available at `/admin`. For the default local Docker deployment,
open <http://localhost:3001/admin>.

> [!IMPORTANT]
> Administrator access is privileged. Use a unique administrator account,
> protect its password, use HTTPS outside local development, and never share
> session cookies.

## Sign in

Open the administrator URL. The sign-in screen accepts only an account with
the `ADMIN` role.

![LiveBid administrator sign-in](images/admin-login.png)

For local seeded data:

| Field    | Value                       |
|----------|-----------------------------|
| Email    | `admin@livebid.local`       |
| Password | The configured seed password |

The seed password is supplied through `SEED_PASSWORD` when `npm run db:seed`
runs. The local validation environment uses `LiveBidDemoPassword123`.

1. Enter the administrator email.
2. Enter the seed password or the account's assigned password.
3. Select **Sign in securely**.
4. Confirm that the operations overview loads.

If a buyer or seller account signs in, the portal immediately signs it out and
reports that administrator access is required.

## Review the operations overview

The overview presents current marketplace totals and system state.

![LiveBid administrator operations overview](images/admin-overview.png)

| Metric             | Meaning                                                    |
|--------------------|------------------------------------------------------------|
| Accounts           | All buyer, seller, and administrator records               |
| Sellers            | Seller profiles associated with seller accounts            |
| Products           | All active, sold, archived, and draft products             |
| Live shows         | Shows currently in the `LIVE` state                        |
| Active auctions    | Auctions currently accepting bids                          |
| Orders             | Fixed-price and auction-winner orders                      |
| Order value        | Sum of order totals in the current database                |
| Pending events     | Transactional outbox events waiting for worker publication |

The **Systems operational** indicator identifies that the portal reached the
application. Use `/api/health` to verify PostgreSQL and Redis dependency
health directly.

> [!NOTE]
> Metrics reflect the current database and are operational counters. They are
> not financial settlement or payout reports.

## Navigate operational sections

Use the left navigation on desktop or the compact top navigation on mobile.

| Section  | Available information                                      |
|----------|------------------------------------------------------------|
| Users    | Identity, role, status, seller name, products, and orders  |
| Products | Seller, category, condition, status, price, and quantity   |
| Shows    | Seller, show status, schedule, start, and end times        |
| Auctions | Product, seller, status, current price, sequence, deadline |
| Orders   | Buyer, seller, total, payment, fulfillment, and creation   |
| Audit    | Administrative action, actor, target, reason, and time     |

Select **Refresh** to reload the current section from the backend.

## Search and filter users

The Users section loads up to 200 recent accounts.

![Administrator user management table](images/admin-users.png)

1. Enter an email, username, or seller display name in the search field.
2. Optionally select a role:
   * Buyers
   * Sellers
   * Administrators
3. Optionally select an account status:
   * Active
   * Suspended
4. Select **Apply filters**.

Clear the fields and apply filters again to restore all accounts.

Each user row includes:

* Marketplace identity and email
* Assigned role
* Current account status
* Number of seller products
* Number of buyer or seller orders
* Account creation date
* Available status action

## Suspend an account

Suspension prevents new authenticated activity and revokes the user's current
sessions.

1. Find the account in **Users**.
2. Select **Suspend**.
3. Enter a specific operational reason in the confirmation prompt.
4. Confirm the prompt.
5. Verify that the account status changes to `SUSPENDED`.
6. Open **Audit** and confirm that a `USER SUSPENDED` event exists.

The same transaction:

* Changes the user status
* Revokes all active sessions
* Marks an associated seller profile as suspended
* Writes an immutable audit event

Administrators cannot suspend their own active account. This prevents an
operator from removing the session needed to recover access.

> [!CAUTION]
> Suspension immediately invalidates the user's server-side sessions. Record a
> clear reason that another administrator can understand during review.

## Reactivate an account

1. Filter Users by the **Suspended** status.
2. Select **Activate** for the intended account.
3. Enter the reason for restoring access.
4. Confirm the prompt.
5. Verify that the account status changes to `ACTIVE`.
6. Review the new `USER ACTIVATED` audit event.

If the account has a seller profile suspended by account enforcement, the
profile returns to verified status. A seller profile rejected for another
reason is not automatically approved.

## Review products

Open **Products** to inspect up to 200 recently created products.

![Administrator product inventory table](images/admin-products.png)

Review:

* Product title and seller
* Category and condition
* Product lifecycle status
* Buy-now price
* Remaining quantity

The operational MVP provides read-only product inspection. Product editing,
removal, counterfeit decisions, and category enforcement require a later
moderation workflow.

## Review shows and auctions

Open **Shows** to inspect schedules and lifecycle state. A show can be
scheduled, live, ended, or canceled.

![Administrator show schedule and lifecycle state](images/admin-shows.png)

Open **Auctions** to inspect:

* Product and seller
* Auction lifecycle state
* Current public price
* Accepted bid sequence
* Authoritative deadline

The displayed sequence helps diagnose realtime gaps. Private maximum bids are
never exposed through administrator resource responses.

![Administrator auction monitoring table](images/admin-auctions.png)

## Review orders

Open **Orders** to inspect fixed-price and auction-winner orders.

![Administrator order operations table](images/admin-orders.png)

The table includes buyer, seller, total, payment status, fulfillment status,
and creation time. The current MVP uses `NOT_REQUIRED` for payment because a
payment provider is not integrated.

> [!WARNING]
> Do not interpret `NOT_REQUIRED` as a completed external payment. LiveBid does
> not capture real payments in this release.

## Review audit events

Open **Audit** to review recent privileged actions.

![Administrator audit history](images/admin-audit.png)

Each event records:

* Action name
* Administrator username
* Target type and identifier
* Required reason
* Event timestamp

Audit events are append-only through the admin API. The portal does not expose
an edit or delete action.

## Sign out

Select **Sign out** at the bottom of the desktop navigation. The server deletes
the current session and the portal returns to the sign-in screen.

Close shared browsers after signing out. Do not leave administrator sessions
active on unattended devices.

## Seed administrator and marketplace data

Run migrations and the idempotent seed in a local or disposable environment:

```powershell
$env:DATABASE_URL = "postgresql://livebid:livebid-local-password@localhost:5432/livebid"
$env:SEED_PASSWORD = "ReplaceWithDemoPassword123"
npm run db:migrate
npm run db:seed
```

The expanded seed creates:

* One administrator
* Ten sellers
* Twenty buyers
* Thirty-three products
* Scheduled and live shows
* An active auction
* Sample chat

Running the seed again updates known demonstration accounts and avoids
duplicate products and shows.

> [!WARNING]
> Never run the demonstration seed in production.

## Troubleshoot the portal

### Sign-in succeeds but the portal rejects access

Confirm the user has the `ADMIN` role. Buyer and seller accounts cannot use
admin APIs.

### Dashboard data does not load

Check the health endpoint:

```powershell
Invoke-RestMethod http://localhost:3001/api/health
```

Both `database` and `redis` checks should return `true`.

### A status update is rejected

Confirm:

* The target user still exists
* The requested status differs from the current status
* The reason contains at least five characters
* The administrator is not trying to suspend their own account

### The worker backlog increases

Review worker status and logs:

```powershell
docker compose ps
docker compose logs --tail 100 worker
```

### Seeded data does not appear

Run migrations before the seed, verify `DATABASE_URL`, and restart the
application after rebuilding its container.

## Security checklist

* Use HTTPS for every non-local environment
* Replace demonstration passwords
* Restrict administrator accounts to operational staff
* Review audit events regularly
* Back up PostgreSQL before releases and migrations
* Keep PostgreSQL and Redis ports private in production
* Use immutable container tags for deployment and rollback
* Never place credentials or cookies in tickets or shared logs

## Related guides

* Use the [end-user guide](user-guide.md) for buyer and seller journeys
* Review the [technical design](technical-design.md) for authorization and
  audit contracts
* Follow the [Copilot deployment specification](copilot-deployment-spec.md) to
  deploy and verify the stack
* Follow the [deployment guide](deployment.md) for shorter operator procedures
