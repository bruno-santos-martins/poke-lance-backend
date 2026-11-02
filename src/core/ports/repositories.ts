import { Bid, Lot, User, Wallet } from "../domain/entities";

export type NewBid = Omit<Bid, "sequence"> & { sequence: number };
export type NewLot = {
  sellerId: string;
  pokemonId: number;
  title: string;
  imagePath: string;
  types: string[];
  height: number;
  weight: number;
  stats: Record<string, number>;
  startingBid: number;
  minimumIncrement: number;
  endsAt: Date;
};
export type WalletAdjustment = { balanceDelta?: number; committedDelta?: number };
export type LotBidUpdate = { currentBid: number; endsAt: Date };
export type WalletTransactionType =
  | "OPENING_BALANCE"
  | "OPENING_COMMITMENT"
  | "DEPOSIT"
  | "BID_COMMITTED"
  | "BID_RELEASED"
  | "BID_REFUNDED"
  | "AUCTION_DEBIT"
  | "AUCTION_CREDIT";
export type NewWalletTransaction = {
  walletUserId: string;
  type: WalletTransactionType;
  amount: number;
  lotId?: string;
  lotTitle?: string;
  description: string;
  createdAt?: Date;
};
export type NewAuditEvent = {
  actorId: string | null;
  actorName?: string;
  actorRole: "AUCTIONEER" | "BIDDER" | "SYSTEM";
  action: string;
  entityType: string;
  entityId?: string | null;
  lotId?: string | null;
  details: Record<string, string | number | boolean | null>;
};
export type AuditEntry = {
  id: string;
  actorId: string | null;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string | null;
  lotId: string | null;
  lotTitle: string | null;
  details: Record<string, unknown>;
  createdAt: Date;
};

export interface IAuctionTransaction {
  lockLot(lotId: string): Promise<void>;
  findLot(lotId: string): Promise<Lot | null>;
  findLatestBid(lotId: string): Promise<Bid | null>;
  lockWallets(userIds: string[]): Promise<void>;
  findWallet(userId: string): Promise<Wallet | null>;
  adjustWallet(userId: string, adjustment: WalletAdjustment): Promise<Wallet>;
  recordWalletTransaction(transaction: NewWalletTransaction): Promise<void>;
  recordAudit(event: NewAuditEvent): Promise<void>;
  addBid(bid: NewBid): Promise<Bid>;
  updateLotBid(lotId: string, update: LotBidUpdate): Promise<Lot>;
}

export interface IBidTransactionRepository {
  transaction<T>(operation: (tx: IAuctionTransaction) => Promise<T>): Promise<T>;
}

export type SettlementWallet = { userId: string; balance: number; committed: number };
export type SettlementResult = {
  id: string;
  sellerId: string;
  settledAt: Date | null;
  winnerId: string | null;
  winnerWallet: SettlementWallet | null;
  sellerWallet: SettlementWallet | null;
};

export type LotSummary = {
  id: string;
  sellerId: string;
  pokemonId: number;
  title: string;
  imagePath: string;
  types: string[];
  height: number;
  weight: number;
  stats: Record<string, number>;
  startingBid: number;
  minimumIncrement: number;
  currentBid: number | null;
  endsAt: Date;
  status: "OPEN" | "CLOSED" | "CANCELLED";
  seller: string;
  latestBidder: string | null;
};

export interface ILotListingRepository {
  list(status?: "OPEN" | "CLOSED" | "CANCELLED"): Promise<LotSummary[]>;
}

export interface ISettlementRepository {
  settleExpired(): Promise<SettlementResult[]>;
  settleLotNow(lotId: string, sellerId: string): Promise<SettlementResult>;
}
export interface ISellerAuditRepository {
  getForSeller(sellerId: string): Promise<AuditEntry[]>;
}

export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
}

export interface IWalletRepository {
  findByUserId(userId: string): Promise<Wallet | null>;
  deposit(userId: string, amount: number): Promise<Wallet>;
  ensure(userId: string): Promise<void>;
}

export type BidderReport = {
  wallet: Wallet;
  acquiredCards: {
    id: string;
    title: string;
    imagePath: string;
    amount: number;
    settledAt: Date;
  }[];
  bids: {
    id: string;
    lotId: string;
    lotTitle: string;
    amount: number;
    createdAt: Date;
    status: "LEADING" | "OUTBID" | "WON" | "LOST" | "CANCELLED";
  }[];
  transactions: {
    id: string;
    type: WalletTransactionType;
    amount: number;
    lotId: string | null;
    lotTitle: string | null;
    description: string;
    createdAt: Date;
  }[];
};

export interface IBidderReportRepository {
  getForBidder(userId: string): Promise<BidderReport>;
}

export interface ILotRepository {
  findById(id: string): Promise<Lot | null>;
  listOpen(): Promise<Lot[]>;
  createWithSellerWallet(input: NewLot): Promise<Lot>;
  isImageUsedByOtherActiveLot(imagePath: string, lotId: string): Promise<boolean>;
  cancelOpenLot(lotId: string, sellerId: string): Promise<{
    lot: Lot;
    refundedBidderId: string | null;
    refundedAmount: number;
    refundedWallet: SettlementWallet | null;
  }>;
}

export interface IBidRepository {
  listByLotId(lotId: string): Promise<Bid[]>;
}
