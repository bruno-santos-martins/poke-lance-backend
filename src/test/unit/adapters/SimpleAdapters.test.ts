import { createHash } from "node:crypto";
import type { Server } from "socket.io";
import { describe, expect, it, vi } from "vitest";
import { SocketAuctionNotifier } from "../../../adapters/in/websocket/SocketAuctionNotifier";
import { Sha256HashService } from "../../../adapters/out/crypto/Sha256HashService";
import { GetSellerAuditUseCase } from "../../../application/use-cases/audit/GetSellerAuditUseCase";
import { GetPokemonDetailsUseCase } from "../../../application/use-cases/lot/GetPokemonDetailsUseCase";

describe("Sha256HashService", () => {
  it("returns the hex sha256 digest", () => {
    const expected = createHash("sha256").update("leilao").digest("hex");

    expect(new Sha256HashService().sha256("leilao")).toBe(expected);
  });
});

describe("SocketAuctionNotifier", () => {
  function createIo() {
    const roomEmit = vi.fn();
    const io = { to: vi.fn(() => ({ emit: roomEmit })), emit: vi.fn() };
    return { io, roomEmit, notifier: new SocketAuctionNotifier(io as unknown as Server) };
  }

  it("emits placed bids to the lot room", () => {
    const { io, roomEmit, notifier } = createIo();

    notifier.bidPlaced("lot-1", { amount: 10 });

    expect(io.to).toHaveBeenCalledWith("lot:lot-1");
    expect(roomEmit).toHaveBeenCalledWith("bid:placed", { amount: 10 });
  });

  it("emits lot updates to the lot room and broadcasts the list refresh", () => {
    const { io, roomEmit, notifier } = createIo();

    notifier.lotUpdated("lot-1", { status: "CLOSED" });

    expect(io.to).toHaveBeenCalledWith("lot:lot-1");
    expect(roomEmit).toHaveBeenCalledWith("lot:updated", { status: "CLOSED" });
    expect(io.emit).toHaveBeenCalledWith("lots:updated", { lotId: "lot-1" });
  });

  it("emits wallet updates to the user room", () => {
    const { io, roomEmit, notifier } = createIo();
    const wallet = { balance: 100, committed: 20, available: 80 };

    notifier.walletUpdated("user-1", wallet);

    expect(io.to).toHaveBeenCalledWith("user:user-1");
    expect(roomEmit).toHaveBeenCalledWith("wallet:updated", wallet);
  });
});

describe("GetSellerAuditUseCase", () => {
  it("returns the seller audit entries from the repository", async () => {
    const entries = [{ id: "audit-1" }];
    const getForSeller = vi.fn().mockResolvedValue(entries);

    await expect(new GetSellerAuditUseCase({ getForSeller }).execute("seller-1")).resolves.toBe(entries);
    expect(getForSeller).toHaveBeenCalledWith("seller-1");
  });
});

describe("GetPokemonDetailsUseCase", () => {
  it("delegates to the PokéAPI provider", async () => {
    const card = { id: 25, name: "pikachu" };
    const findPokemon = vi.fn().mockResolvedValue(card);

    await expect(new GetPokemonDetailsUseCase({ findPokemon, searchPokemon: vi.fn() }).execute("pikachu")).resolves.toBe(card);
    expect(findPokemon).toHaveBeenCalledWith("pikachu");
  });
});
