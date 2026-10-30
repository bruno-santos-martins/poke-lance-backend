import { randomUUID } from "node:crypto";
import { AppError } from "../../../core/domain/errors";
import { availableBalance, isAntiSnipingWindow, minimumBid } from "../../../core/domain/AuctionRules";
import { IAuctionNotifier, IHashService } from "../../../core/ports/services";
import { IBidTransactionRepository } from "../../../core/ports/repositories";

export class PlaceBidUseCase {
  constructor(
    private readonly hashService: IHashService,
    private readonly notifier: IAuctionNotifier,
    private readonly transactions: IBidTransactionRepository
  ) {}

  async execute(lotId: string, bidderId: string, amount: number) {
    const result = await this.transactions.transaction(async (tx) => {
      await tx.lockLot(lotId);
      const lot = await tx.findLot(lotId);
      if (!lot) throw new AppError("Lote não encontrado.", 404);
      if (lot.status !== "OPEN" || lot.endsAt <= new Date()) throw new AppError("Este lote já não está aberto.", 409);

      const latestBid = await tx.findLatestBid(lotId);
      if (latestBid?.bidderId === bidderId) throw new AppError("O líder atual não pode cobrir o próprio lance.", 409);
      const minimum = minimumBid(latestBid?.amount ?? null, lot.startingBid, lot.minimumIncrement);
      if (amount < minimum) throw new AppError(`O lance mínimo para este lote é ${minimum}.`, 422);

      await tx.lockWallets([bidderId, ...(latestBid ? [latestBid.bidderId] : [])]);
      const bidderWallet = await tx.findWallet(bidderId);
      if (!bidderWallet || availableBalance(bidderWallet.balance, bidderWallet.committed) < amount) {
        throw new AppError("Saldo disponível insuficiente para este lance.", 422);
      }

      const releasedWallet = latestBid
        ? await tx.adjustWallet(latestBid.bidderId, { committedDelta: -latestBid.amount })
        : null;
      const updatedBidderWallet = await tx.adjustWallet(bidderId, { committedDelta: amount });

      const createdAt = new Date();
      const id = randomUUID();
      const previousHash = latestBid?.hash ?? null;
      const hash = this.hashService.sha256(`${id}${lotId}${bidderId}${amount}${createdAt.toISOString()}${previousHash ?? ""}`);
      const bid = await tx.addBid({ id, lotId, bidderId, sequence: (latestBid?.sequence ?? 0) + 1, amount, createdAt, previousHash, hash });
      if (latestBid) await tx.recordWalletTransaction({
        walletUserId: latestBid.bidderId,
        type: "BID_RELEASED",
        amount: latestBid.amount,
        lotId,
        lotTitle: lot.title,
        description: `Lance superado em ${lot.title}`,
        createdAt
      });
      await tx.recordWalletTransaction({
        walletUserId: bidderId,
        type: "BID_COMMITTED",
        amount,
        lotId,
        lotTitle: lot.title,
        description: `Lance comprometido em ${lot.title}`,
        createdAt
      });
      await tx.recordAudit({
        actorId: bidderId,
        actorRole: "BIDDER",
        action: "BID_PLACED",
        entityType: "LOT",
        entityId: lotId,
        lotId,
        details: {
          title: lot.title,
          amount,
          releasedBidderId: latestBid?.bidderId ?? null,
          releasedAmount: latestBid?.amount ?? 0
        }
      });

      const endsAt = isAntiSnipingWindow(lot.endsAt, createdAt)
        ? new Date(lot.endsAt.getTime() + 120_000)
        : lot.endsAt;
      const updatedLot = await tx.updateLotBid(lotId, { currentBid: amount, endsAt });
      return { bid, lot: updatedLot, updatedBidderWallet, releasedWallet, releasedUserId: latestBid?.bidderId };
    });

    this.notifier.bidPlaced(lotId, { id: result.bid.id, amount: result.bid.amount, createdAt: result.bid.createdAt, endsAt: result.lot.endsAt });
    this.notifier.lotUpdated(lotId, { currentBid: result.lot.currentBid, endsAt: result.lot.endsAt });
    const walletData = (wallet: typeof result.updatedBidderWallet) => ({
      balance: wallet.balance, committed: wallet.committed, available: wallet.balance - wallet.committed
    });
    this.notifier.walletUpdated(bidderId, walletData(result.updatedBidderWallet));
    if (result.releasedWallet && result.releasedUserId) this.notifier.walletUpdated(result.releasedUserId, walletData(result.releasedWallet));
    return result;
  }
}
