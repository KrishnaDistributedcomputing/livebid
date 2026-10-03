import bcrypt from "bcryptjs";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
const seedPassword = process.env.SEED_PASSWORD;
if (!databaseUrl || !seedPassword || seedPassword.length < 12) {
  throw new Error("DATABASE_URL and a SEED_PASSWORD of at least 12 characters are required");
}

const pool = new pg.Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  await client.query("BEGIN");
  const passwordHash = await bcrypt.hash(seedPassword, 12);

  const seller = await client.query(
    `INSERT INTO users (email, username, password_hash, role)
     VALUES ('seller@livebid.local', 'mayacollects', $1, 'SELLER')
     ON CONFLICT ((lower(email))) DO UPDATE SET username = EXCLUDED.username
     RETURNING id`,
    [passwordHash],
  );
  const buyer = await client.query(
    `INSERT INTO users (email, username, password_hash, role)
     VALUES ('buyer@livebid.local', 'demo-buyer', $1, 'BUYER')
     ON CONFLICT ((lower(email))) DO UPDATE SET username = EXCLUDED.username
     RETURNING id`,
    [passwordHash],
  );
  const sellerProfile = await client.query(
    `INSERT INTO seller_profiles (user_id, display_name, description)
     VALUES ($1, 'Maya Collects', 'Vintage cards and live breaks')
     ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name
     RETURNING id`,
    [seller.rows[0].id],
  );
  const product = await client.query(
    `INSERT INTO products (
       seller_id, title, description, category, condition, buy_now_price_minor,
       auction_start_price_minor, quantity, image_url
     )
     SELECT $1, '1980 Sounders archive trio', 'Three-card original set',
       'Cards', 'Excellent', 12500, 8300, 1, '/livebid-cards.jpg'
     WHERE NOT EXISTS (
       SELECT 1 FROM products WHERE seller_id = $1 AND title = '1980 Sounders archive trio'
     )
     RETURNING id`,
    [sellerProfile.rows[0].id],
  );

  let productId = product.rows[0]?.id;
  if (!productId) {
    const existing = await client.query(
      "SELECT id FROM products WHERE seller_id = $1 AND title = '1980 Sounders archive trio'",
      [sellerProfile.rows[0].id],
    );
    productId = existing.rows[0].id;
  }

  const show = await client.query(
    `INSERT INTO shows (seller_id, title, description, scheduled_at, started_at, status)
     SELECT $1, 'Friday night archive rush', 'Fresh slabs, low starts, and no reserves.',
       now(), now(), 'LIVE'
     WHERE NOT EXISTS (
       SELECT 1 FROM shows WHERE seller_id = $1 AND status = 'LIVE'
     )
     RETURNING id`,
    [sellerProfile.rows[0].id],
  );
  let showId = show.rows[0]?.id;
  if (!showId) {
    const existing = await client.query(
      "SELECT id FROM shows WHERE seller_id = $1 AND status = 'LIVE' LIMIT 1",
      [sellerProfile.rows[0].id],
    );
    showId = existing.rows[0].id;
  }

  await client.query(
    `INSERT INTO auctions (
       show_id, product_id, seller_id, start_price_minor, current_price_minor,
       bid_increment_minor, starts_at, ends_at, status
     )
     SELECT $1, $2, $3, 8300, 8300, 100, now(), now() + interval '24 hours', 'ACTIVE'
     WHERE NOT EXISTS (
       SELECT 1 FROM auctions WHERE product_id = $2 AND status IN ('SCHEDULED', 'ACTIVE')
     )`,
    [showId, productId, sellerProfile.rows[0].id],
  );

  const demoSellers = [
    {
      email: "sole-room@livebid.local",
      username: "sole-room",
      displayName: "SOLE ROOM",
      description: "Archive sneakers, streetwear, and collectible footwear",
      products: [
        ["Air Max 1 '86 OG", "Original colorway with box", "Sneakers", "New", 16500, 12000, 2, "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85"],
        ["Jordan 4 Retro", "Clean pair with light shelf wear", "Sneakers", "Very good", 24000, 18000, 1, "https://images.unsplash.com/photo-1552346154-21d32810aba3?auto=format&fit=crop&w=900&q=85"],
        ["Classic canvas high-top", "Everyday canvas high-top", "Sneakers", "New", 7800, null, 4, "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?auto=format&fit=crop&w=900&q=85"],
      ],
    },
    {
      email: "grain-house@livebid.local",
      username: "grain-house",
      displayName: "Grain House",
      description: "Tested analog cameras and practical film kits",
      products: [
        ["Olympus OM-1 + 50mm", "Meter tested with clean optics", "Cameras", "Excellent", 21900, 16000, 1, "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=85"],
        ["Canon AE-1 Program", "Serviced body with standard lens", "Cameras", "Very good", 18900, 14000, 2, "https://images.unsplash.com/photo-1606986628253-71d6b8067f68?auto=format&fit=crop&w=900&q=85"],
        ["35mm film starter kit", "Film, batteries, and protective case", "Cameras", "New", 4200, null, 8, "https://images.unsplash.com/photo-1495121553079-4c61bcce1894?auto=format&fit=crop&w=900&q=85"],
      ],
    },
    {
      email: "second-hand@livebid.local",
      username: "second-hand",
      displayName: "Second Hand",
      description: "Mechanical watches with transparent condition notes",
      products: [
        ["Minimal steel automatic", "Automatic movement on steel bracelet", "Watches", "Very good", 28500, 22000, 1, "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=85"],
        ["Field watch 38mm", "High-legibility dial with canvas strap", "Watches", "Excellent", 17500, 13000, 2, "https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&w=900&q=85"],
        ["Vintage dress watch", "Hand-wound gold-tone dress watch", "Watches", "Good", 14200, 9500, 1, "https://images.unsplash.com/photo-1509048191080-d2984bad6ae5?auto=format&fit=crop&w=900&q=85"],
      ],
    },
    {
      email: "the-edit@livebid.local",
      username: "the-edit",
      displayName: "The Edit",
      description: "Small-run accessories and considered wardrobe pieces",
      products: [
        ["Structured leather tote", "Full-grain leather with interior pocket", "Accessories", "New", 14800, null, 3, "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=85"],
        ["Silk studio scarf", "Printed silk square with hand-rolled edge", "Accessories", "New", 6800, null, 5, "https://images.unsplash.com/photo-1601924994987-69e26d50dc26?auto=format&fit=crop&w=900&q=85"],
        ["Weekend duffel", "Waxed canvas and leather travel bag", "Accessories", "Excellent", 12600, 9000, 2, "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=85"],
      ],
    },
  ];

  for (const sellerData of demoSellers) {
    const sellerUser = await client.query(
      `INSERT INTO users (email, username, password_hash, role)
       VALUES ($1, $2, $3, 'SELLER')
       ON CONFLICT ((lower(email))) DO UPDATE SET username = EXCLUDED.username
       RETURNING id`,
      [sellerData.email, sellerData.username, passwordHash],
    );
    const profile = await client.query(
      `INSERT INTO seller_profiles (user_id, display_name, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
       SET display_name = EXCLUDED.display_name, description = EXCLUDED.description
       RETURNING id`,
      [sellerUser.rows[0].id, sellerData.displayName, sellerData.description],
    );

    for (const productData of sellerData.products) {
      await client.query(
        `INSERT INTO products (
           seller_id, title, description, category, condition,
           buy_now_price_minor, auction_start_price_minor, quantity, image_url
         )
         SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9
         WHERE NOT EXISTS (
           SELECT 1 FROM products WHERE seller_id = $1 AND title = $2
         )`,
        [profile.rows[0].id, ...productData],
      );
    }

    await client.query(
      `INSERT INTO shows (seller_id, title, description, scheduled_at, status)
       SELECT $1, $2, $3, now() + interval '1 day', 'SCHEDULED'
       WHERE NOT EXISTS (
         SELECT 1 FROM shows WHERE seller_id = $1 AND status = 'SCHEDULED'
       )`,
      [
        profile.rows[0].id,
        `${sellerData.displayName} live showcase`,
        `New arrivals and featured picks from ${sellerData.displayName}.`,
      ],
    );
  }

  const demoBuyers = [
    ["collector77@livebid.local", "collector77"],
    ["patchcollector@livebid.local", "patchcollector"],
    ["rookiecardz@livebid.local", "rookiecardz"],
    ["mintcondition@livebid.local", "mintcondition"],
  ];
  for (const [email, username] of demoBuyers) {
    await client.query(
      `INSERT INTO users (email, username, password_hash, role)
       VALUES ($1, $2, $3, 'BUYER')
       ON CONFLICT ((lower(email))) DO UPDATE SET username = EXCLUDED.username`,
      [email, username, passwordHash],
    );
  }

  await client.query(
    `INSERT INTO chat_messages (show_id, user_id, body)
     SELECT $1, u.id, message.body
     FROM (
       VALUES
         ('patchcollector', 'Centering looks clean from here.'),
         ('rookiecardz', 'Can we see the back before the next lot?'),
         ('mintcondition', 'That surface is sharp.')
     ) AS message(username, body)
     JOIN users u ON u.username = message.username
     WHERE NOT EXISTS (
       SELECT 1
       FROM chat_messages existing
       WHERE existing.show_id = $1 AND existing.user_id = u.id
     )`,
    [showId],
  );

  await client.query("COMMIT");
  console.log("Seeded 5 sellers, 5 buyers, 13 products, shows, and sample chat");
  console.log(`Demo buyer ID: ${buyer.rows[0].id}`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
