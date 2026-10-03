import { z } from "zod";

const email = z.string().trim().toLowerCase().email().max(254);
const username = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
const password = z
  .string()
  .min(12)
  .max(128)
  .regex(/[a-z]/, "Password must contain a lowercase letter.")
  .regex(/[A-Z]/, "Password must contain an uppercase letter.")
  .regex(/[0-9]/, "Password must contain a number.");

export const registerSchema = z.object({
  email,
  username,
  password,
  role: z.enum(["BUYER", "SELLER"]).default("BUYER"),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});

export const productSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().max(5_000).default(""),
    category: z.string().trim().min(2).max(80),
    condition: z.string().trim().min(2).max(80),
    currency: z.string().length(3).transform((value) => value.toUpperCase()).default("USD"),
    buyNowPriceMinor: z.number().int().positive().nullable().default(null),
    auctionStartPriceMinor: z.number().int().positive().nullable().default(null),
    quantity: z.number().int().min(1).max(10_000).default(1),
    imageUrl: z.string().url().or(z.string().startsWith("/")).nullable().default(null),
  })
  .refine(
    (value) => value.buyNowPriceMinor !== null || value.auctionStartPriceMinor !== null,
    "A buy-now or auction start price is required.",
  );

export const showSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(5_000).default(""),
  scheduledAt: z.string().datetime(),
});

export const showStatusSchema = z.object({
  status: z.enum(["LIVE", "ENDED", "CANCELED"]),
});

export const auctionSchema = z.object({
  showId: z.string().uuid(),
  productId: z.string().uuid(),
  startPriceMinor: z.number().int().positive(),
  bidIncrementMinor: z.number().int().positive().max(1_000_000).default(100),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  antiSnipeSeconds: z.number().int().min(0).max(120).default(5),
  auctionType: z.enum(["STANDARD", "SUDDEN_DEATH"]).default("STANDARD"),
});

export const bidSchema = z
  .object({
    amountMinor: z.number().int().positive().optional(),
    maxBidMinor: z.number().int().positive().optional(),
    currency: z.string().length(3).transform((value) => value.toUpperCase()).default("USD"),
  })
  .refine(
    (value) => (value.amountMinor === undefined) !== (value.maxBidMinor === undefined),
    "Submit exactly one of amountMinor or maxBidMinor.",
  );

export const chatMessageSchema = z.object({
  body: z.string().trim().min(1).max(500),
});

export const orderSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(100).default(1),
});
