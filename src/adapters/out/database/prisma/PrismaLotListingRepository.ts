import { LotSummary, ILotListingRepository } from "../../../../core/ports/repositories";
import { Prisma } from "@prisma/client";
import { prisma } from "./client";

function readTypes(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error("O lote contém dados de tipo inválidos.");
  }
  return value.map((entry) => {
    if (typeof entry !== "string") throw new Error("O lote contém dados de tipo inválidos.");
    return entry;
  });
}

function readStats(value: Prisma.JsonValue): Record<string, number> {
  if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("O lote contém estatísticas inválidas.");
  const entries = Object.entries(value);
  if (entries.some(([, stat]) => typeof stat !== "number" || !Number.isFinite(stat))) {
    throw new Error("O lote contém estatísticas inválidas.");
  }
  return Object.fromEntries(entries.map(([name, stat]) => [name, Number(stat)]));
}

function pseudonym(userId: string) {
  return `Licitante #${userId.replaceAll("-", "").slice(0, 4).toUpperCase()}`;
}

export class PrismaLotListingRepository implements ILotListingRepository {
  async list(status?: "OPEN" | "CLOSED" | "CANCELLED"): Promise<LotSummary[]> {
    const lots = await prisma.lot.findMany({
      where: status ? { status } : {},
      include: {
        seller: { select: { name: true } },
        bids: { orderBy: { sequence: "desc" }, take: 1, select: { bidderId: true } }
      },
      orderBy: [{ status: "asc" }, { endsAt: "asc" }]
    });
    return lots.map((lot) => ({
      id: lot.id,
      sellerId: lot.sellerId,
      pokemonId: lot.pokemonId,
      title: lot.title,
      imagePath: lot.imagePath,
      types: readTypes(lot.types),
      height: lot.height,
      weight: lot.weight,
      stats: readStats(lot.stats),
      startingBid: lot.startingBid,
      minimumIncrement: lot.minimumIncrement,
      currentBid: lot.currentBid,
      endsAt: lot.endsAt,
      status: lot.status,
      seller: lot.seller.name,
      latestBidder: lot.bids[0] ? pseudonym(lot.bids[0].bidderId) : null
    }));
  }
}
