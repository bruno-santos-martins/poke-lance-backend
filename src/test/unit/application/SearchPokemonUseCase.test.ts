import { describe, expect, it, vi } from "vitest";
import type { IPokeApiProvider } from "../../../core/ports/services";
import { SearchPokemonUseCase } from "../../../application/use-cases/lot/SearchPokemonUseCase";

describe("SearchPokemonUseCase", () => {
  it("forwards the query and returns the provider suggestions", async () => {
    const suggestions = [{ id: 25, name: "pikachu" }];
    const searchPokemon = vi.fn<IPokeApiProvider["searchPokemon"]>().mockResolvedValue(suggestions);
    const useCase = new SearchPokemonUseCase({
      searchPokemon,
      findPokemon: vi.fn()
    });

    await expect(useCase.execute("pika")).resolves.toBe(suggestions);
    expect(searchPokemon).toHaveBeenCalledWith("pika");
  });

  it("propagates provider failures", async () => {
    const searchPokemon = vi.fn<IPokeApiProvider["searchPokemon"]>()
      .mockRejectedValue(new Error("PokéAPI indisponível"));
    const useCase = new SearchPokemonUseCase({
      searchPokemon,
      findPokemon: vi.fn()
    });

    await expect(useCase.execute("pika")).rejects.toThrow("PokéAPI indisponível");
  });
});
