import { Prisma } from "@prisma/client";
import { prisma } from "./client";
import { IAuctionTransaction, IBidTransactionRepository, LotBidUpdate, NewAuditEvent, NewBid, NewWalletTransaction, WalletAdjustment } from "../../../../core/ports/repositories";
import { Bid, Lot, Wallet } from "../../../../core/domain/entities";
import { recordAudit } from "./PrismaAuditWriter";

function mapPersistedLotToDomain(persistedLot: {
  id: string; sellerId: string; title: string; imagePath: string; startingBid: number;
  minimumIncrement: number; currentBid: number | null; endsAt: Date; status: "OPEN" | "CLOSED" | "CANCELLED";
}): Lot {
  return {
    id: persistedLot.id, sellerId: persistedLot.sellerId, title: persistedLot.title, imagePath: persistedLot.imagePath,
    startingBid: persistedLot.startingBid, minimumIncrement: persistedLot.minimumIncrement,
    currentBid: persistedLot.currentBid, endsAt: persistedLot.endsAt, status: persistedLot.status
  };
}

function mapPersistedWalletToDomain(walletRecord: { userId: string; balance: number; committed: number }): Wallet {
  return {
    userId: walletRecord.userId,
    balance: walletRecord.balance,
    committed: walletRecord.committed,
    available: walletRecord.balance - walletRecord.committed
  };
}

class PrismaAuctionTransaction implements IAuctionTransaction {
  constructor(private readonly prismaTransactionClient: Prisma.TransactionClient) {}

  async lockLot(lotId: string): Promise<void> {
    await this.prismaTransactionClient.$queryRaw`SELECT "id" FROM "Lot" WHERE "id" = ${lotId} FOR UPDATE`;
  }

  async findLot(lotId: string): Promise<Lot | null> {
    const persistedLot = await this.prismaTransactionClient.lot.findUnique({ where: { id: lotId } });
    return persistedLot ? mapPersistedLotToDomain(persistedLot) : null;
  }

  async findLatestBid(lotId: string): Promise<Bid | null> {
    return this.prismaTransactionClient.bid.findFirst({ where: { lotId }, orderBy: { sequence: "desc" } });
  }

  async lockWallets(walletUserIds: string[]): Promise<void> {
    for (const walletUserId of [...new Set(walletUserIds)].sort()) {
      await this.prismaTransactionClient.$queryRaw`SELECT "id" FROM "Wallet" WHERE "userId" = ${walletUserId} FOR UPDATE`;
    }
  }

  async findWallet(userId: string): Promise<Wallet | null> {
    const persistedWallet = await this.prismaTransactionClient.wallet.findUnique({ where: { userId } });
    return persistedWallet ? mapPersistedWalletToDomain(persistedWallet) : null;
  }

  async adjustWallet(userId: string, walletBalanceAdjustment: WalletAdjustment): Promise<Wallet> {
    const updatedWallet = await this.prismaTransactionClient.wallet.update({
      where: { userId },
      data: {
        ...(walletBalanceAdjustment.balanceDelta === undefined ? {} : { balance: { increment: walletBalanceAdjustment.balanceDelta } }),
        ...(walletBalanceAdjustment.committedDelta === undefined ? {} : { committed: { increment: walletBalanceAdjustment.committedDelta } })
      }
    });
    return mapPersistedWalletToDomain(updatedWallet);
  }

  async recordWalletTransaction(walletTransaction: NewWalletTransaction): Promise<void> {
    await this.prismaTransactionClient.walletTransaction.create({ data: walletTransaction });
  }

  recordAudit(event: NewAuditEvent): Promise<void> {
    return recordAudit(this.prismaTransactionClient, event);
  }

  async addBid(bid: NewBid): Promise<Bid> {
    return this.prismaTransactionClient.bid.create({ data: bid });
  }

  async updateLotBid(lotId: string, lotBidUpdate: LotBidUpdate): Promise<Lot> {
    const updatedLot = await this.prismaTransactionClient.lot.update({ where: { id: lotId }, data: lotBidUpdate });
    return mapPersistedLotToDomain(updatedLot);
  }
}

export class PrismaAuctionTransactionRepository implements IBidTransactionRepository {
  transaction<T>(operation: (auctionTransaction: IAuctionTransaction) => Promise<T>): Promise<T> {
    return prisma.$transaction((prismaTransactionClient) => operation(new PrismaAuctionTransaction(prismaTransactionClient)), {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted
    });
  }
}
