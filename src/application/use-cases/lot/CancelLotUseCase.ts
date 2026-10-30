import { ILotRepository } from "../../../core/ports/repositories";
import { IAuctionNotifier } from "../../../core/ports/services";

export class CancelLotUseCase {
  constructor(private readonly lots: ILotRepository, private readonly notifier: IAuctionNotifier) {}

  async execute(lotId: string, sellerId: string) {
    const result = await this.lots.cancelOpenLot(lotId, sellerId);
    this.notifier.lotUpdated(result.lot.id, { status: result.lot.status });
    if (result.refundedBidderId && result.refundedWallet) {
      this.notifier.walletUpdated(result.refundedBidderId, {
        balance: result.refundedWallet.balance,
        committed: result.refundedWallet.committed,
        available: result.refundedWallet.balance - result.refundedWallet.committed
      });
    }
    return result;
  }
}
