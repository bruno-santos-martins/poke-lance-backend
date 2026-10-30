import { prisma } from "./client";
import { ILotRepository, NewLot, SettlementWallet } from "../../../../core/ports/repositories";
import { Lot } from "../../../../core/domain/entities";
import { AppError } from "../../../../core/domain/errors";
import { recordAudit } from "./PrismaAuditWriter";

function toLot(row: {
  id: string; sellerId: string; title: string; imagePath: string; startingBid: number;
  minimumIncrement: number; currentBid: number | null; endsAt: Date; status: "OPEN" | "CLOSED" | "CANCELLED";
}): Lot {
  return {
    id: row.id, sellerId: row.sellerId, title: row.title, imagePath: row.imagePath,
    startingBid: row.startingBid, minimumIncrement: row.minimumIncrement,
    currentBid: row.currentBid, endsAt: row.endsAt, status: row.status
  };
}

export class PrismaLotRepository implements ILotRepository {
  async findById(id: string): Promise<Lot | null> {
    const lot = await prisma.lot.findUnique({ where: { id } });
    return lot ? toLot(lot) : null;
  }

  async listOpen(): Promise<Lot[]> {
    const lots = await prisma.lot.findMany({ where: { status: "OPEN" }, orderBy: { endsAt: "asc" } });
    return lots.map(toLot);
  }

  async createWithSellerWallet(input: NewLot): Promise<Lot> {
    return prisma.$transaction(async (tx) => {
      await tx.wallet.upsert({ where: { userId: input.sellerId }, update: {}, create: { userId: input.sellerId } });
      const row = await tx.lot.create({ data: { ...input, types: input.types, stats: input.stats } });
      await recordAudit(tx, {
        actorId: input.sellerId,
        actorRole: "AUCTIONEER",
        action: "LOT_CREATED",
        entityType: "LOT",
        entityId: row.id,
        lotId: row.id,
        details: { title: row.title, startingBid: row.startingBid }
      });
      return toLot(row);
    });
  }

  async cancelOpenLot(lotId: string, sellerId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Lot" WHERE "id" = ${lotId} FOR UPDATE`;
      const lot = await tx.lot.findUnique({ where: { id: lotId } });
      if (!lot) throw new AppError("Lote não encontrado.", 404);
      if (lot.sellerId !== sellerId) throw new AppError("Só pode cancelar os seus próprios lotes.", 403);
      if (lot.status !== "OPEN") throw new AppError("Este lote não está aberto.", 409);
      if (lot.endsAt <= new Date()) throw new AppError("O prazo do lote terminou e ele aguarda liquidação.", 409);

      const latestBid = await tx.bid.findFirst({ where: { lotId }, orderBy: { sequence: "desc" } });
      let refundedWallet: SettlementWallet | null = null;
      if (latestBid) {
        await tx.$queryRaw`SELECT "id" FROM "Wallet" WHERE "userId" = ${latestBid.bidderId} FOR UPDATE`;
        const wallet = await tx.wallet.findUnique({ where: { userId: latestBid.bidderId } });
        if (!wallet || wallet.committed < latestBid.amount) {
          throw new AppError("Não foi possível estornar o saldo comprometido do lance.", 500);
        }
        const updatedWallet = await tx.wallet.update({
          where: { userId: latestBid.bidderId },
          data: { committed: { decrement: latestBid.amount } }
        });
        refundedWallet = {
          userId: updatedWallet.userId,
          balance: updatedWallet.balance,
          committed: updatedWallet.committed
        };
        await tx.walletTransaction.create({
          data: {
            walletUserId: latestBid.bidderId,
            type: "BID_REFUNDED",
            amount: latestBid.amount,
            lotId,
            lotTitle: lot.title,
            description: `Estorno do lance em lote cancelado: ${lot.title}`
          }
        });
      }

      const cancelledLot = await tx.lot.update({ where: { id: lotId }, data: { status: "CANCELLED" } });
      await recordAudit(tx, {
        actorId: sellerId,
        actorRole: "AUCTIONEER",
        action: "LOT_CANCELLED",
        entityType: "LOT",
        entityId: lotId,
        lotId,
        details: {
          title: lot.title,
          refundedBidderId: latestBid?.bidderId ?? null,
          refundedAmount: latestBid?.amount ?? 0
        }
      });
      return {
        lot: toLot(cancelledLot),
        refundedBidderId: latestBid?.bidderId ?? null,
        refundedAmount: latestBid?.amount ?? 0,
        refundedWallet
      };
    });
  }
}
