import { ILotRepository } from "../../../core/ports/repositories";
import { IAuctionNotifier, ILocalStorageService } from "../../../core/ports/services";

export class CancelLotUseCase {
  constructor(
    private readonly lots: ILotRepository,
    private readonly storage: ILocalStorageService,
    private readonly notifier: IAuctionNotifier
  ) {}

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

    try {
      const imageIsInUse = await this.lots.isImageUsedByOtherActiveLot(result.lot.imagePath, result.lot.id);
      if (!imageIsInUse) await this.storage.deleteImage(result.lot.imagePath);
      return result;
    } catch (error) {
      console.error(`Lote ${result.lot.id} cancelado, mas não foi possível remover a imagem.`, error);
      return {
        ...result,
        imageCleanupWarning: "O lote foi cancelado, mas não foi possível remover a imagem armazenada."
      };
    }
  }
}
