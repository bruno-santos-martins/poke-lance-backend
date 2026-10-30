import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ILotRepository } from "../../../core/ports/repositories";
import type { ILocalStorageService, IPokeApiProvider, PokemonCard } from "../../../core/ports/services";
import { CreateLotUseCase } from "../../../application/use-cases/lot/CreateLotUseCase";

const pokemon: PokemonCard = {
  id: 25,
  name: "pikachu",
  imageUrl: "https://example.test/pikachu.png",
  types: ["electric"],
  height: 4,
  weight: 60,
  stats: { speed: 90 }
};

describe("CreateLotUseCase", () => {
  const findPokemon = vi.fn<IPokeApiProvider["findPokemon"]>();
  const searchPokemon = vi.fn<IPokeApiProvider["searchPokemon"]>();
  const saveImage = vi.fn<ILocalStorageService["saveImage"]>();
  const deleteImage = vi.fn<ILocalStorageService["deleteImage"]>();
  const createWithSellerWallet = vi.fn<ILotRepository["createWithSellerWallet"]>();

  const useCase = new CreateLotUseCase(
    { findPokemon, searchPokemon },
    { saveImage, deleteImage },
    {
      findById: vi.fn(),
      listOpen: vi.fn(),
      createWithSellerWallet,
      isImageUsedByOtherActiveLot: vi.fn(),
      cancelOpenLot: vi.fn()
    }
  );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("downloads and stores the Pokémon art before creating the lot", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-10-30T12:00:00.000Z");
    vi.setSystemTime(now);
    findPokemon.mockResolvedValue(pokemon);
    saveImage.mockResolvedValue("/uploads/cards/pikachu.png");
    createWithSellerWallet.mockImplementation(async (input) => ({
      ...input,
      id: "lot-1",
      currentBid: null,
      status: "OPEN"
    }));

    const result = await useCase.execute({
      sellerId: "seller-1",
      pokemon: "25",
      startingBid: 1000,
      minimumIncrement: 100,
      durationMinutes: 30
    });

    expect(findPokemon).toHaveBeenCalledWith("25");
    expect(saveImage).toHaveBeenCalledWith(pokemon.imageUrl, pokemon.id);
    expect(createWithSellerWallet).toHaveBeenCalledWith({
      sellerId: "seller-1",
      pokemonId: 25,
      title: "Pikachu",
      imagePath: "/uploads/cards/pikachu.png",
      types: pokemon.types,
      height: 4,
      weight: 60,
      stats: pokemon.stats,
      startingBid: 1000,
      minimumIncrement: 100,
      endsAt: new Date(now.getTime() + 30 * 60_000)
    });
    expect(result.id).toBe("lot-1");
    expect(findPokemon.mock.invocationCallOrder[0]).toBeLessThan(saveImage.mock.invocationCallOrder[0]);
    expect(saveImage.mock.invocationCallOrder[0]).toBeLessThan(createWithSellerWallet.mock.invocationCallOrder[0]);
  });

  it("stops when the Pokémon provider fails", async () => {
    findPokemon.mockRejectedValue(new Error("Pokémon indisponível"));

    await expect(useCase.execute({
      sellerId: "seller-1",
      pokemon: "missingno",
      startingBid: 1000,
      minimumIncrement: 100,
      durationMinutes: 30
    })).rejects.toThrow("Pokémon indisponível");

    expect(saveImage).not.toHaveBeenCalled();
    expect(createWithSellerWallet).not.toHaveBeenCalled();
  });

  it("does not create a lot when image storage fails", async () => {
    findPokemon.mockResolvedValue(pokemon);
    saveImage.mockRejectedValue(new Error("Falha ao armazenar imagem"));

    await expect(useCase.execute({
      sellerId: "seller-1",
      pokemon: "25",
      startingBid: 1000,
      minimumIncrement: 100,
      durationMinutes: 30
    })).rejects.toThrow("Falha ao armazenar imagem");

    expect(createWithSellerWallet).not.toHaveBeenCalled();
  });

  it("propagates lot repository failures", async () => {
    findPokemon.mockResolvedValue(pokemon);
    saveImage.mockResolvedValue("/uploads/cards/pikachu.png");
    createWithSellerWallet.mockRejectedValue(new Error("Falha ao criar lote"));

    await expect(useCase.execute({
      sellerId: "seller-1",
      pokemon: "25",
      startingBid: 1000,
      minimumIncrement: 100,
      durationMinutes: 30
    })).rejects.toThrow("Falha ao criar lote");
  });
});
