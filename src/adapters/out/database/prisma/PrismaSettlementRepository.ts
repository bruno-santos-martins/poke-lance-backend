import { Bid as PersistedBid, Lot as PersistedLot, Prisma } from "@prisma/client";
import {
  ISettlementRepository,
  SettlementResult,
  SettlementWallet
} from "../../../../core/ports/repositories";
import { prisma } from "./client";
import { recordAudit } from "./PrismaAuditWriter";

const MAX_LOTS_PER_SETTLEMENT_BATCH = 100;

type SettledWinnerWallets = {
  winnerWallet: SettlementWallet;
  sellerWallet: SettlementWallet;
};

export class PrismaSettlementRepository implements ISettlementRepository {
  async settleExpired(): Promise<SettlementResult[]> {
    const settlementCutoff = new Date();
    const expiredLots = await prisma.lot.findMany({
      where: { status: "OPEN", endsAt: { lte: settlementCutoff } },
      select: { id: true },
      take: MAX_LOTS_PER_SETTLEMENT_BATCH
    });

    const settlementResults: SettlementResult[] = [];
    for (const { id: lotId } of expiredLots) {
      const settlementResult = await this.settleExpiredLot(lotId);
      if (settlementResult) settlementResults.push(settlementResult);
    }

    return settlementResults;
  }

  private settleExpiredLot(lotId: string): Promise<SettlementResult | null> {
    return prisma.$transaction(
      (transactionClient) => this.settleExpiredLotInTransaction(transactionClient, lotId),
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
    );
  }

  private async settleExpiredLotInTransaction(
    transactionClient: Prisma.TransactionClient,
    lotId: string
  ): Promise<SettlementResult | null> {
    await this.lockLotForSettlement(transactionClient, lotId);

    const lot = await this.findLotIfStillExpired(transactionClient, lotId);
    if (!lot) return null;

    const winningBid = await this.findWinningBid(transactionClient, lotId);
    const settledWallets = winningBid
      ? await this.settleWinningBid(transactionClient, lot, winningBid)
      : null;
    const settlementTime = new Date();

    const settledLot = await transactionClient.lot.update({
      where: { id: lotId },
      data: {
        status: "CLOSED",
        winnerId: winningBid?.bidderId ?? null,
        settledAt: settlementTime
      }
    });
    await recordAudit(transactionClient, {
      actorId: null,
      actorRole: "SYSTEM",
      action: "LOT_SETTLED",
      entityType: "LOT",
      entityId: lotId,
      lotId,
      details: {
        title: lot.title,
        winnerId: winningBid?.bidderId ?? null,
        amount: winningBid?.amount ?? 0
      }
    });

    return this.createSettlementResult(settledLot, winningBid, settledWallets);
  }

  private async lockLotForSettlement(
    transactionClient: Prisma.TransactionClient,
    lotId: string
  ): Promise<void> {
    await transactionClient.$queryRaw`
      SELECT "id" FROM "Lot" WHERE "id" = ${lotId} FOR UPDATE
    `;
  }

  async settleLotNow(lotId: string, sellerId: string): Promise<SettlementResult> {
    return prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Lot" WHERE "id" = ${lotId} FOR UPDATE`;
        const lot = await tx.lot.findUnique({ where: { id: lotId } });
        if (!lot) throw new Error("Lote não encontrado.");
        if (lot.status !== "OPEN") throw new Error("O lote já foi encerrado.");
        if (lot.sellerId !== sellerId) throw new Error("Não tens permissão para finalizar este lote.");

        const winningBid = await this.findWinningBid(tx, lotId);
        const settledWallets = winningBid
          ? await this.settleWinningBid(tx, lot, winningBid)
          : null;
        const settlementTime = new Date();

        const settledLot = await tx.lot.update({
          where: { id: lotId },
          data: { status: "CLOSED", winnerId: winningBid?.bidderId ?? null, settledAt: settlementTime }
        });
        await recordAudit(tx, {
          actorId: sellerId,
          actorRole: "AUCTIONEER",
          action: "LOT_SETTLED",
          entityType: "LOT",
          entityId: lotId,
          lotId,
          details: { title: lot.title, winnerId: winningBid?.bidderId ?? null, amount: winningBid?.amount ?? 0 }
        });

        return this.createSettlementResult(settledLot, winningBid, settledWallets);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
    );
  }

  private async findLotIfStillExpired(
    transactionClient: Prisma.TransactionClient,
    lotId: string
  ): Promise<PersistedLot | null> {
    const lot = await transactionClient.lot.findUnique({ where: { id: lotId } });
    const currentTime = new Date();

    if (!lot || lot.status !== "OPEN" || lot.endsAt > currentTime) return null;
    return lot;
  }

  private findWinningBid(
    transactionClient: Prisma.TransactionClient,
    lotId: string
  ): Promise<PersistedBid | null> {
    return transactionClient.bid.findFirst({
      where: { lotId },
      orderBy: { sequence: "desc" }
    });
  }

  private async settleWinningBid(
    transactionClient: Prisma.TransactionClient,
    lot: PersistedLot,
    winningBid: PersistedBid
  ): Promise<SettledWinnerWallets> {
    await this.lockSettlementWallets(transactionClient, winningBid.bidderId, lot.sellerId);

    const updatedWinnerWallet = await this.debitWinningBidder(
      transactionClient,
      winningBid.bidderId,
      winningBid.amount
    );
    const updatedSellerWallet = await this.creditAuctioneer(
      transactionClient,
      lot.sellerId,
      winningBid.amount
    );

    await this.recordSettlementTransactions(transactionClient, lot, winningBid);

    return {
      winnerWallet: this.toSettlementWallet(updatedWinnerWallet),
      sellerWallet: this.toSettlementWallet(updatedSellerWallet)
    };
  }

  private async lockSettlementWallets(
    transactionClient: Prisma.TransactionClient,
    bidderId: string,
    auctioneerId: string
  ): Promise<void> {
    await transactionClient.$queryRaw`
      SELECT "id" FROM "Wallet"
      WHERE "userId" IN (${bidderId}, ${auctioneerId})
      ORDER BY "userId" FOR UPDATE
    `;
  }

  private debitWinningBidder(
    transactionClient: Prisma.TransactionClient,
    bidderId: string,
    winningAmount: number
  ) {
    return transactionClient.wallet.update({
      where: { userId: bidderId },
      data: {
        balance: { decrement: winningAmount },
        committed: { decrement: winningAmount }
      }
    });
  }

  private creditAuctioneer(
    transactionClient: Prisma.TransactionClient,
    auctioneerId: string,
    winningAmount: number
  ) {
    return transactionClient.wallet.upsert({
      where: { userId: auctioneerId },
      update: { balance: { increment: winningAmount } },
      create: { userId: auctioneerId, balance: winningAmount }
    });
  }

  private recordSettlementTransactions(
    transactionClient: Prisma.TransactionClient,
    lot: PersistedLot,
    winningBid: PersistedBid
  ): Promise<Prisma.BatchPayload> {
    return transactionClient.walletTransaction.createMany({
      data: [
        {
          walletUserId: winningBid.bidderId,
          type: "AUCTION_DEBIT",
          amount: winningBid.amount,
          lotId: lot.id,
          lotTitle: lot.title,
          description: `Pagamento do arremate de ${lot.title}`
        },
        {
          walletUserId: lot.sellerId,
          type: "AUCTION_CREDIT",
          amount: winningBid.amount,
          lotId: lot.id,
          lotTitle: lot.title,
          description: `Recebimento do lote ${lot.title}`
        }
      ]
    });
  }

  private toSettlementWallet(wallet: {
    userId: string;
    balance: number;
    committed: number;
  }): SettlementWallet {
    return {
      userId: wallet.userId,
      balance: wallet.balance,
      committed: wallet.committed
    };
  }

  private createSettlementResult(
    settledLot: PersistedLot,
    winningBid: PersistedBid | null,
    settledWallets: SettledWinnerWallets | null
  ): SettlementResult {
    return {
      id: settledLot.id,
      sellerId: settledLot.sellerId,
      settledAt: settledLot.settledAt,
      winnerId: winningBid?.bidderId ?? null,
      winnerWallet: settledWallets?.winnerWallet ?? null,
      sellerWallet: settledWallets?.sellerWallet ?? null
    };
  }
}
