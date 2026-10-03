---
title: LiveBid architecture
description: Current prototype architecture, delivery pipeline, and planned marketplace platform
ms.date: 2026-10-03
ms.topic: concept
keywords:
  - architecture
  - next.js
  - live commerce
  - docker
  - mermaid
estimated_reading_time: 9
---

## Architecture scope

LiveBid currently runs as a single Next.js web application. It demonstrates
buyer and seller journeys with browser-held sample state. The repository does
not yet contain the persistent commerce services described in the product
roadmap.

This guide separates two architectural states:

* The implemented prototype, which can be run and deployed today
* The planned marketplace, which is a target design rather than deployed code

> [!IMPORTANT]
> Bids, chat messages, follows, reminders, cart counts, and other interactions
> are not sent to a backend or saved. Reloading the page resets the experience.

## Current system context

The deployed application has one user-facing process. The browser downloads
the application, React manages the interactive state, and Next.js serves a
health endpoint for deployment probes.

```mermaid
flowchart LR
    User["Buyer or seller"] --> Browser["Desktop or mobile browser"]
    Browser --> App["LiveBid Next.js application"]
    App --> Interface["React interface"]
    App --> Health["GET /api/health"]
    Interface --> State["In-memory React state"]
    Interface --> LocalMedia["Public card image"]
    Interface --> RemoteMedia["Unsplash product images"]
    Probe["Docker or platform probe"] --> Health
```

No authentication provider, database, cache, payment processor, shipping
provider, or streaming service participates in this runtime.

## Current application components

The App Router renders one client application. Navigation changes the visible
view without creating additional URL routes.

```mermaid
flowchart TD
    Request["GET /"] --> Page["src/app/page.tsx"]
    Page --> LiveBidApp["LiveBidApp client component"]
    LiveBidApp --> Shell["Responsive application shell"]
    Shell --> Header["Search, notifications, bag, and menu"]
    Shell --> Navigation["Desktop rail and mobile navigation"]
    Shell --> Views

    subgraph Views["Client-side views"]
        Discover["Discover and live auction"]
        Market["Marketplace"]
        Orders["Order tracking"]
        Studio["Seller studio"]
    end

    LiveBidApp --> DemoState["React useState values"]
    DemoState --> Auction["Timer, bid feed, and private maximum"]
    DemoState --> Social["Chat, follow, and saved shows"]
    DemoState --> Shopping["Bag count and notifications"]
```

The main implementation boundaries are:

| Boundary                    | Responsibility                                                   |
|-----------------------------|------------------------------------------------------------------|
| `src/app/layout.tsx`        | Global metadata, fonts, styles, and document shell               |
| `src/app/page.tsx`          | Root page composition                                            |
| `src/components/livebid-app.tsx` | Views, sample data, interactions, and browser-held state    |
| `src/app/globals.css`       | Responsive visual system and component styling                   |
| `src/app/api/health/route.ts` | Dynamic JSON health response used by deployment probes         |
| `public/`                   | Local static media                                               |

## Prototype bid sequence

Bid acceptance is a local user-interface simulation. It demonstrates feedback
and anti-sniping behavior, but it does not provide concurrency control or
durability.

```mermaid
sequenceDiagram
    actor Buyer
    participant UI as Auction controls
    participant State as React state
    participant Feed as Bid history

    Buyer->>UI: Select an increment
    UI-->>Buyer: Show the next bid amount
    Buyer->>UI: Place bid
    UI->>State: Check the local countdown
    alt Countdown has ended
        State-->>UI: Reject the bid
        UI-->>Buyer: Show auction-ended message
    else Countdown is active
        State->>State: Increase price and bid count
        State->>State: Set buyer as leader
        opt Five seconds or less remain
            State->>State: Reset countdown to five seconds
        end
        State->>Feed: Prepend accepted bid
        UI-->>Buyer: Show confirmation
    end
```

The private maximum form validates that the amount is at least the next bid.
It stores the value locally and does not perform automatic proxy bidding.

## Build and delivery architecture

The same source can run through the Next.js development server, as a
standalone Node.js process, or in the production container.

```mermaid
flowchart LR
    Developer["Developer"] --> GitHub["GitHub repository"]
    GitHub --> Actions["GitHub Actions"]
    Actions --> Validate["Build container image"]
    Validate --> GHCR["GitHub Container Registry"]
    GitHub --> Vercel["Vercel source deployment"]

    GHCR --> Compose["Docker Compose host"]
    GHCR --> Azure["Azure Container Apps"]

    subgraph Image["Multi-stage Docker image"]
        Dependencies["Install locked dependencies"]
        Build["Build standalone Next.js output"]
        Runtime["Run as non-root nextjs user"]
        Dependencies --> Build --> Runtime
    end

    Actions --> Image
    Runtime --> Health["Container health check"]
    Health --> Endpoint["GET /api/health"]
```

Pull requests build the image without publishing it. Pushes to `main` and
version tags publish images to GitHub Container Registry. The runtime image
contains the standalone server, static build assets, and public media.

## Deployment topology

The container listens on port `3000`. Docker Compose maps host port `3001` by
default, while managed platforms can expose the container through their own
HTTPS ingress.

```mermaid
flowchart TD
    Visitor["Internet visitor"] --> TLS["Managed ingress or reverse proxy"]
    TLS --> Port["Container port 3000"]
    Port --> Server["Next.js standalone server"]
    Server --> Home["LiveBid interface"]
    Server --> Health["Health endpoint"]
    Monitor["Container runtime"] --> Health
```

For local development, the browser connects directly to
`http://localhost:3000`. For the default local Compose workflow, it connects
to `http://localhost:3001`.

## Planned marketplace architecture

The product roadmap starts with a modular monolith and server-authoritative
auction processing. Services should be extracted only when scaling or
operational isolation requires it.

```mermaid
flowchart TB
    Clients["Web and mobile clients"] --> Gateway["API and realtime gateway"]
    Clients --> Streaming["Managed streaming provider"]

    Gateway --> Identity["Identity and authorization"]
    Gateway --> Commerce["Commerce and social modules"]
    Gateway --> Auction["Auction engine"]

    Commerce --> Database["PostgreSQL"]
    Auction --> Database
    Auction --> Redis["Redis coordination and cache"]

    Database --> Outbox["Transactional outbox"]
    Outbox --> Workers["Background workers"]
    Workers --> Payments["Payment provider"]
    Workers --> Shipping["Shipping provider"]
    Workers --> Notifications["Push and email notifications"]
    Workers --> Search["Search and analytics"]

    Commerce --> Storage["Object storage"]
    Identity --> Audit["Administrative audit records"]
    Commerce --> Audit
    Auction --> Audit
```

The database remains authoritative for bids, auctions, inventory, orders, and
outbox events. Redis can coordinate realtime work and cache reads, but it
cannot replace a durable transaction for bid acceptance.

## Planned auction transaction boundary

The server must acknowledge a bid only after durable auction state, bid
history, and the event to be published are committed together.

```mermaid
sequenceDiagram
    actor Buyer
    participant Gateway as Realtime gateway
    participant Engine as Auction engine
    participant DB as PostgreSQL
    participant Outbox as Event worker
    participant Viewers as Connected viewers

    Buyer->>Gateway: Submit bid with request ID
    Gateway->>Engine: Authenticate and validate request
    Engine->>DB: Lock auction and inventory state
    Engine->>DB: Validate deadline and bid amount
    Engine->>DB: Commit bid, auction state, and outbox event
    DB-->>Engine: Transaction committed
    Engine-->>Gateway: Bid accepted
    Gateway-->>Buyer: Confirm price and leadership
    Outbox->>DB: Read committed event
    Outbox-->>Viewers: Broadcast authoritative update
```

Idempotency keys, deterministic tie handling, authorization checks, and
server-owned deadlines are required before the auction flow can process real
transactions.

## Evolution path

| Phase                    | Architecture change                                                  |
|--------------------------|----------------------------------------------------------------------|
| Interactive prototype    | Single Next.js process with browser-held state                        |
| Persisted MVP            | Add API modules, identity, PostgreSQL, and server-side authorization  |
| Realtime commerce        | Add auction coordination, WebSockets, Redis, and transactional outbox |
| Transactional marketplace | Integrate payments, inventory reservations, shipping, and audit     |
| Scaled platform          | Extract auction, streaming, and worker services as load requires      |

Keep the phase boundaries explicit. A user-interface demonstration should not
be presented as durable commerce behavior until the required server-side
components and failure handling are implemented and tested.

## Related guides

* Follow the [user guide](user-guide.md) to exercise the implemented journeys
* Follow the [deployment guide](deployment.md) to run or publish the application
* Return to the [repository overview](../README.md) for prerequisites and
  source commands
