import { ISettlementRepository } from "../../../core/ports/repositories";
import { IAuctionNotifier } from "../../../core/ports/services";

export class FinalizeLotUseCase {
  constructor(
    private readonly settlements: ISettlementRepository,
    private readonly notifier: IAuctionNotifier
  ) {}

  async execute(lotId: string, sellerId: string) {
    const result = await this.settlements.settleLotNow(lotId, sellerId);

    this.notifier.lotUpdated(result.id, { status: "CLOSED", settledAt: result.settledAt });

    if (result.winnerWallet && result.winnerId) {
      this.notifier.walletUpdated(result.winnerId, {
        balance: result.winnerWallet.balance,
        committed: result.winnerWallet.committed,
        available: result.winnerWallet.balance - result.winnerWallet.committed
      });
    }
    if (result.sellerWallet) {
      this.notifier.walletUpdated(result.sellerId, {
        balance: result.sellerWallet.balance,
        committed: result.sellerWallet.committed,
        available: result.sellerWallet.balance - result.sellerWallet.committed
      });
    }

    return result;
  }
}
