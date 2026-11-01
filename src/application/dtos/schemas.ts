import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  role: z.enum(["AUCTIONEER", "BIDDER"])
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1)
});

const MAX_CENTAVOS = 9_999_999_999;

export const createLotSchema = z.object({
  pokemon: z.string().trim().min(1).max(64),
  startingBid: z.number().int().positive().max(MAX_CENTAVOS),
  minimumIncrement: z.number().int().positive().max(MAX_CENTAVOS).default(100),
  durationMinutes: z.number().int().min(1).max(10080).default(60)
});

export const pokemonSearchSchema = z.object({
  q: z.string().trim().min(1).max(64)
});

export const bidSchema = z.object({
  amount: z.number().int().positive().max(MAX_CENTAVOS)
});

export const depositSchema = z.object({
  amount: z.number().int().min(1).max(MAX_CENTAVOS)
});
