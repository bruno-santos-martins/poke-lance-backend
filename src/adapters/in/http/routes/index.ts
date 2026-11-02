import { Router } from "express";
import { IAuctionNotifier } from "../../../../core/ports/services";
import { authenticate, authenticateIfPresent, requireRole } from "../middlewares/auth";
import { apiRateLimit, loginAccountRateLimit, loginIpRateLimit, registerRateLimit } from "../middlewares/rateLimits";
import { createControllers } from "../controllers";

export function buildRouter(notifier: IAuctionNotifier): Router {
  const router = Router();
  const controllers = createControllers(notifier);
  router.use(apiRateLimit);

  router.post("/auth/register", registerRateLimit, controllers.register);
  router.post("/auth/login", loginIpRateLimit, loginAccountRateLimit, controllers.login);
  router.post("/auth/logout", controllers.logout);
  router.get("/auth/session", authenticateIfPresent, controllers.session);

  router.get("/lots", controllers.listLots);
  router.get("/pokemon/search", controllers.searchPokemon);
  router.get("/pokemon/:id", controllers.getPokemonDetails);
  router.get("/lots/:id", controllers.getLot);
  router.post("/lots", authenticate, requireRole("AUCTIONEER"), controllers.createLot);
  router.delete("/lots/:id", authenticate, requireRole("AUCTIONEER"), controllers.cancelLot);
  router.post("/lots/:id/finalize", authenticate, requireRole("AUCTIONEER"), controllers.finalizeLot);

  router.get("/seller/wallet", authenticate, requireRole("AUCTIONEER"), controllers.sellerWallet);
  router.get("/seller/reports", authenticate, requireRole("AUCTIONEER"), controllers.sellerReport);
  router.get("/seller/audit", authenticate, requireRole("AUCTIONEER"), controllers.sellerAudit);
  router.get("/seller/auctioned-lots", authenticate, requireRole("AUCTIONEER"), controllers.sellerAuctionedLots);

  router.post("/lots/:id/bids", authenticate, requireRole("BIDDER"), controllers.placeBid);
  router.get("/wallet", authenticate, requireRole("BIDDER"), controllers.getWallet);
  router.post("/wallet/deposits", authenticate, requireRole("BIDDER"), controllers.deposit);
  router.get("/bidder/report", authenticate, requireRole("BIDDER"), controllers.bidderReport);

  router.get("/lots/:id/audit", controllers.lotAudit);
  router.get("/receipts/:id", authenticateIfPresent, controllers.receipt);

  return router;
}
