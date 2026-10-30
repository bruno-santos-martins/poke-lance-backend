import { IAuctionNotifier } from "../core/ports/services";
import { Sha256HashService } from "../adapters/out/crypto/Sha256HashService";
import { PokeApiAdapter } from "../adapters/out/external-api/PokeApiAdapter";
import { LocalStorageService } from "../adapters/out/storage/LocalStorageService";
import { PrismaAuctionTransactionRepository } from "../adapters/out/database/prisma/PrismaAuctionTransactionRepository";
import { PrismaBidRepository } from "../adapters/out/database/prisma/PrismaBidRepository";
import { PrismaLotRepository } from "../adapters/out/database/prisma/PrismaLotRepository";
import { PrismaLotListingRepository } from "../adapters/out/database/prisma/PrismaLotListingRepository";
import { PrismaWalletRepository } from "../adapters/out/database/prisma/PrismaWalletRepository";
import { CreateLotUseCase } from "../application/use-cases/lot/CreateLotUseCase";
import { CancelLotUseCase } from "../application/use-cases/lot/CancelLotUseCase";
import { ListLotsUseCase } from "../application/use-cases/lot/ListLotsUseCase";
import { PlaceBidUseCase } from "../application/use-cases/bid/PlaceBidUseCase";
import { ValidateAuditChainUseCase } from "../application/use-cases/audit/ValidateAuditChainUseCase";
import { DepositBalanceUseCase } from "../application/use-cases/wallet/DepositBalanceUseCase";
import { GetWalletUseCase } from "../application/use-cases/wallet/GetWalletUseCase";
import { SearchPokemonUseCase } from "../application/use-cases/lot/SearchPokemonUseCase";
import { GetBidderReportUseCase } from "../application/use-cases/bidder/GetBidderReportUseCase";
import { PrismaBidderReportRepository } from "../adapters/out/database/prisma/PrismaBidderReportRepository";
import { PrismaSellerAuditRepository } from "../adapters/out/database/prisma/PrismaSellerAuditRepository";
import { GetSellerAuditUseCase } from "../application/use-cases/audit/GetSellerAuditUseCase";
import { GetPokemonDetailsUseCase } from "../application/use-cases/lot/GetPokemonDetailsUseCase";

export function createContainer(notifier: IAuctionNotifier) {
  const hashService = new Sha256HashService();
  const lotRepository = new PrismaLotRepository();
  const walletRepository = new PrismaWalletRepository();
  const pokeApi = new PokeApiAdapter();
  return {
    createLot: new CreateLotUseCase(pokeApi, new LocalStorageService(), lotRepository),
    searchPokemon: new SearchPokemonUseCase(pokeApi),
    getPokemonDetails: new GetPokemonDetailsUseCase(pokeApi),
    cancelLot: new CancelLotUseCase(lotRepository, notifier),
    listLots: new ListLotsUseCase(new PrismaLotListingRepository()),
    placeBid: new PlaceBidUseCase(hashService, notifier, new PrismaAuctionTransactionRepository()),
    audit: new ValidateAuditChainUseCase(hashService, lotRepository, new PrismaBidRepository()),
    getWallet: new GetWalletUseCase(walletRepository),
    depositBalance: new DepositBalanceUseCase(walletRepository),
    bidderReport: new GetBidderReportUseCase(new PrismaBidderReportRepository()),
    sellerAudit: new GetSellerAuditUseCase(new PrismaSellerAuditRepository())
  };
}
