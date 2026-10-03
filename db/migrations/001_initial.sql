CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  username text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('BUYER', 'SELLER', 'ADMIN')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_lower_unique ON users (lower(email));
CREATE UNIQUE INDEX users_username_lower_unique ON users (lower(username));

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE seller_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  description text NOT NULL DEFAULT '',
  verification_status text NOT NULL DEFAULT 'VERIFIED'
    CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES seller_profiles(id),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL,
  condition text NOT NULL,
  currency char(3) NOT NULL DEFAULT 'USD',
  buy_now_price_minor integer CHECK (buy_now_price_minor IS NULL OR buy_now_price_minor > 0),
  auction_start_price_minor integer CHECK (
    auction_start_price_minor IS NULL OR auction_start_price_minor > 0
  ),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  reserved_quantity integer NOT NULL DEFAULT 0 CHECK (
    reserved_quantity >= 0 AND reserved_quantity <= quantity
  ),
  image_url text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'SOLD', 'ARCHIVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (buy_now_price_minor IS NOT NULL OR auction_start_price_minor IS NOT NULL)
);

CREATE INDEX products_seller_id_idx ON products (seller_id);
CREATE INDEX products_status_category_idx ON products (status, category);

CREATE TABLE shows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES seller_profiles(id),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  scheduled_at timestamptz NOT NULL,
  started_at timestamptz,
  ended_at timestamptz,
  status text NOT NULL DEFAULT 'SCHEDULED'
    CHECK (status IN ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX shows_status_scheduled_at_idx ON shows (status, scheduled_at);
CREATE INDEX shows_seller_id_idx ON shows (seller_id);

CREATE TABLE auctions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL REFERENCES shows(id),
  product_id uuid NOT NULL REFERENCES products(id),
  seller_id uuid NOT NULL REFERENCES seller_profiles(id),
  currency char(3) NOT NULL DEFAULT 'USD',
  start_price_minor integer NOT NULL CHECK (start_price_minor > 0),
  current_price_minor integer NOT NULL CHECK (current_price_minor > 0),
  bid_increment_minor integer NOT NULL DEFAULT 100 CHECK (bid_increment_minor > 0),
  highest_bidder_id uuid REFERENCES users(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  anti_snipe_seconds integer NOT NULL DEFAULT 5 CHECK (anti_snipe_seconds BETWEEN 0 AND 120),
  auction_type text NOT NULL DEFAULT 'STANDARD' CHECK (auction_type IN ('STANDARD', 'SUDDEN_DEATH')),
  status text NOT NULL DEFAULT 'SCHEDULED'
    CHECK (status IN ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELED')),
  sequence integer NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX auctions_status_ends_at_idx ON auctions (status, ends_at);
CREATE INDEX auctions_show_id_idx ON auctions (show_id);
CREATE UNIQUE INDEX auctions_active_product_unique
  ON auctions (product_id)
  WHERE status IN ('SCHEDULED', 'ACTIVE');

CREATE TABLE bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id uuid NOT NULL REFERENCES auctions(id),
  buyer_id uuid NOT NULL REFERENCES users(id),
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  max_bid_minor integer NOT NULL CHECK (max_bid_minor >= amount_minor),
  sequence integer NOT NULL CHECK (sequence > 0),
  idempotency_key text NOT NULL,
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auction_id, sequence),
  UNIQUE (auction_id, buyer_id, idempotency_key)
);

CREATE INDEX bids_auction_created_at_idx ON bids (auction_id, created_at DESC);
CREATE INDEX bids_auction_max_idx ON bids (auction_id, max_bid_minor DESC, created_at ASC);

CREATE TABLE chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chat_messages_show_created_idx ON chat_messages (show_id, created_at DESC);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES users(id),
  seller_id uuid NOT NULL REFERENCES seller_profiles(id),
  auction_id uuid UNIQUE REFERENCES auctions(id),
  currency char(3) NOT NULL DEFAULT 'USD',
  subtotal_minor integer NOT NULL CHECK (subtotal_minor > 0),
  total_minor integer NOT NULL CHECK (total_minor > 0),
  payment_status text NOT NULL DEFAULT 'PENDING'
    CHECK (payment_status IN ('PENDING', 'NOT_REQUIRED', 'PAID', 'FAILED', 'REFUNDED')),
  fulfillment_status text NOT NULL DEFAULT 'UNFULFILLED'
    CHECK (fulfillment_status IN ('UNFULFILLED', 'SHIPPED', 'DELIVERED', 'CANCELED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX orders_buyer_created_idx ON orders (buyer_id, created_at DESC);
CREATE INDEX orders_seller_created_idx ON orders (seller_id, created_at DESC);

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  title_snapshot text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_minor integer NOT NULL CHECK (unit_price_minor > 0)
);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  sequence integer,
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX outbox_pending_idx
  ON outbox_events (available_at, created_at)
  WHERE published_at IS NULL;
