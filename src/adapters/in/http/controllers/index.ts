import { NextFunction, Request, RequestHandler, Response } from "express";
import bcrypt from "bcryptjs";
import { loginSchema, registerSchema, createLotSchema, bidSchema, depositSchema, pokemonSearchSchema } from "../../../../application/dtos/schemas";
import { AppError } from "../../../../core/domain/errors";
import { IAuctionNotifier } from "../../../../core/ports/services";
import { createContainer } from "../../../../main/container";
import { JwtTokenService } from "../../../out/crypto/JwtTokenService";
import { prisma } from "../../../out/database/prisma/client";
import { recordAudit } from "../../../out/database/prisma/PrismaAuditWriter";

const tokens = new JwtTokenService();

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res).catch(next);
  };
}

function maskedBidder(id: string) {
  return `Licitante #${id.replaceAll("-", "").slice(0, 4).toUpperCase()}`;
}

function routeId(req: Request): string {
  const id = req.params.id;
  if (typeof id !== "string") throw new AppError("Identificador inválido.", 400);
  return id;
}

export function createControllers(notifier: IAuctionNotifier) {
  const container = createContainer(notifier);

  return {
    register: asyncRoute(async (req, res) => {
      const input = registerSchema.parse(req.body);
      const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
      if (existing) throw new AppError("Este e-mail já está registado.", 409);
      const user = await prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            name: input.name,
            email: input.email.toLowerCase(),
            passwordHash: await bcrypt.hash(input.password, 12),
            role: input.role,
            ...(input.role === "BIDDER" ? { wallet: { create: {} } } : {})
          }
        });
        await recordAudit(tx, {
          actorId: createdUser.id,
          actorName: createdUser.name,
          actorRole: input.role,
          action: "USER_REGISTERED",
          entityType: "USER",
          entityId: createdUser.id,
          details: { role: input.role }
        });
        return createdUser;
      });
      res.status(201).json({ token: tokens.sign({ sub: user.id, role: user.role }), user: { id: user.id, name: user.name, role: user.role } });
    }),

    login: asyncRoute(async (req, res) => {
      const input = loginSchema.parse(req.body);
      const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
      if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) throw new AppError("E-mail ou senha inválidos.", 401);
      await prisma.$transaction((tx) => recordAudit(tx, {
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: "USER_LOGGED_IN",
        entityType: "USER",
        entityId: user.id,
        details: {}
      }));
      res.json({ token: tokens.sign({ sub: user.id, role: user.role }), user: { id: user.id, name: user.name, role: user.role } });
    }),

    listLots: asyncRoute(async (req, res) => {
      const status = req.query.status === "all" ? undefined : "OPEN";
      res.json(await container.listLots.execute(status));
    }),

    searchPokemon: asyncRoute(async (req, res) => {
      const { q } = pokemonSearchSchema.parse({ q: req.query.q });
      res.json(await container.searchPokemon.execute(q));
    }),

    getPokemonDetails: asyncRoute(async (req, res) => {
      res.json(await container.getPokemonDetails.execute(routeId(req)));
    }),

    getLot: asyncRoute(async (req, res) => {
      const id = routeId(req);
      const lot = await prisma.lot.findUnique({
        where: { id },
        include: { seller: { select: { name: true } }, bids: { orderBy: { sequence: "desc" }, take: 1, select: { bidderId: true } } }
      });
      if (!lot) throw new AppError("Lote não encontrado.", 404);
      res.json({
        id: lot.id, sellerId: lot.sellerId, pokemonId: lot.pokemonId, title: lot.title, imagePath: lot.imagePath,
        types: lot.types, height: lot.height, weight: lot.weight, stats: lot.stats,
        startingBid: lot.startingBid, minimumIncrement: lot.minimumIncrement, currentBid: lot.currentBid,
        endsAt: lot.endsAt, status: lot.status, settledAt: lot.settledAt, seller: lot.seller.name,
        winner: lot.winnerId ? maskedBidder(lot.winnerId) : null,
        latestBidder: lot.bids[0] ? maskedBidder(lot.bids[0].bidderId) : null
      });
    }),

    createLot: asyncRoute(async (req, res) => {
      const input = createLotSchema.parse(req.body);
      const lot = await container.createLot.execute({ ...input, sellerId: req.user!.id });
      notifier.lotUpdated(lot.id, { status: lot.status });
      res.status(201).json(lot);
    }),

    cancelLot: asyncRoute(async (req, res) => {
      const result = await container.cancelLot.execute(routeId(req), req.user!.id);
      res.json({ lot: result.lot, refundedAmount: result.refundedAmount });
    }),

    sellerReport: asyncRoute(async (req, res) => {
      const lots = await prisma.lot.findMany({
        where: { sellerId: req.user!.id, status: "CLOSED" },
        include: { bids: { orderBy: { sequence: "desc" }, take: 1 } },
        orderBy: { settledAt: "desc" }
      });
      res.json({
        lots: lots.map((lot) => ({
          id: lot.id,
          title: lot.title,
          settledAt: lot.settledAt,
          winner: lot.winnerId ? maskedBidder(lot.winnerId) : null,
          amount: lot.bids[0]?.amount ?? 0
        })),
        totalReceived: lots.reduce((total, lot) => total + (lot.bids[0]?.amount ?? 0), 0)
      });
    }),

    sellerAudit: asyncRoute(async (req, res) => {
      res.json(await container.sellerAudit.execute(req.user!.id));
    }),

    sellerAuctionedLots: asyncRoute(async (req, res) => {
      const lots = await prisma.lot.findMany({
        where: { sellerId: req.user!.id, status: "CLOSED", winnerId: { not: null }, settledAt: { not: null } },
        select: {
          id: true,
          pokemonId: true,
          title: true,
          imagePath: true,
          currentBid: true,
          settledAt: true,
          winner: { select: { name: true, email: true } },
          _count: { select: { bids: true } }
        },
        orderBy: { settledAt: "desc" }
      });
      res.json(lots.map((lot) => ({
        id: lot.id,
        pokemonId: lot.pokemonId,
        title: lot.title,
        imagePath: lot.imagePath,
        amount: lot.currentBid ?? 0,
        settledAt: lot.settledAt,
        bidCount: lot._count.bids,
        winner: lot.winner
      })));
    }),

    placeBid: asyncRoute(async (req, res) => {
      const input = bidSchema.parse(req.body);
      const result = await container.placeBid.execute(routeId(req), req.user!.id, input.amount);
      res.status(201).json({
        bid: { id: result.bid.id, amount: result.bid.amount, createdAt: result.bid.createdAt, hash: result.bid.hash },
        lot: { id: result.lot.id, currentBid: result.lot.currentBid, endsAt: result.lot.endsAt }
      });
    }),

    getWallet: asyncRoute(async (req, res) => {
      const wallet = await container.getWallet.execute(req.user!.id);
      res.json({ balance: wallet.balance, committed: wallet.committed, available: wallet.available });
    }),

    deposit: asyncRoute(async (req, res) => {
      const { amount } = depositSchema.parse(req.body);
      const wallet = await container.depositBalance.execute(req.user!.id, amount);
      res.status(201).json({ balance: wallet.balance, committed: wallet.committed, available: wallet.available });
    }),

    bidderReport: asyncRoute(async (req, res) => {
      res.json(await container.bidderReport.execute(req.user!.id));
    }),

    lotAudit: asyncRoute(async (req, res) => {
      res.json(await container.audit.execute(routeId(req)));
    }),

    receipt: asyncRoute(async (req, res) => {
      const lot = await prisma.lot.findUnique({
        where: { id: routeId(req) },
        include: { bids: { orderBy: { sequence: "desc" }, take: 1 } }
      });
      if (!lot) throw new AppError("Comprovativo não encontrado.", 404);
      if (lot.status !== "CLOSED" || !lot.settledAt) throw new AppError("O lote ainda não foi liquidado.", 409);
      res.json({
        id: lot.id,
        title: lot.title,
        imagePath: lot.imagePath,
        amount: lot.bids[0]?.amount ?? 0,
        winner: lot.winnerId ? maskedBidder(lot.winnerId) : null,
        isCurrentUserWinner: req.user?.id === lot.winnerId,
        settledAt: lot.settledAt,
        receiptUrl: `${process.env.CLIENT_ORIGIN ?? "http://localhost:5173"}/receipt/${lot.id}`
      });
    })
  };
}
