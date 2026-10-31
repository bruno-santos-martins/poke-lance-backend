import { beforeEach, describe, expect, it, vi } from "vitest";
import { PokeApiAdapter } from "../../../adapters/out/external-api/PokeApiAdapter";
import { AppError } from "../../../core/domain/errors";

const axiosMock = vi.hoisted(() => ({
  get: vi.fn(),
  isAxiosError: (error: unknown) => typeof error === "object" && error !== null && "isAxiosError" in error
}));

vi.mock("axios", () => ({ default: axiosMock }));

function axiosError(status?: number) {
  return Object.assign(new Error("request failed"), { isAxiosError: true, response: status ? { status } : undefined });
}

function pokemonList(...entries: [number, string][]) {
  return {
    data: {
      results: entries.map(([id, name]) => ({ name, url: `https://pokeapi.co/api/v2/pokemon/${id}/` }))
    }
  };
}

const pikachuDetails = {
  data: {
    id: 25,
    name: "pikachu",
    sprites: { other: { "official-artwork": { front_default: "https://img/pikachu.png" } } },
    types: [{ type: { name: "electric" } }],
    height: 4,
    weight: 60,
    stats: [{ base_stat: 35, stat: { name: "hp" } }, { base_stat: 55, stat: { name: "attack" } }]
  }
};

describe("PokeApiAdapter", () => {
  beforeEach(() => {
    axiosMock.get.mockReset();
  });

  describe("searchPokemon", () => {
    it("returns an empty list for blank queries without calling the API", async () => {
      const adapter = new PokeApiAdapter();

      await expect(adapter.searchPokemon("   ")).resolves.toEqual([]);
      expect(axiosMock.get).not.toHaveBeenCalled();
    });

    it("ranks prefix matches before substring matches and orders by id", async () => {
      axiosMock.get.mockResolvedValue(pokemonList([26, "raichu"], [25, "pikachu"], [172, "pichu"], [10, "caterpie"]));
      const adapter = new PokeApiAdapter();

      const result = await adapter.searchPokemon("  PI ");

      expect(result.map((pokemon) => pokemon.name)).toEqual(["pikachu", "pichu", "caterpie"]);
    });

    it("matches by numeric id prefix", async () => {
      axiosMock.get.mockResolvedValue(pokemonList([25, "pikachu"], [250, "ho-oh"], [1, "bulbasaur"]));
      const adapter = new PokeApiAdapter();

      const result = await adapter.searchPokemon("25");

      expect(result).toEqual([{ id: 25, name: "pikachu" }, { id: 250, name: "ho-oh" }]);
    });

    it("limits results to 8 suggestions", async () => {
      const entries = Array.from({ length: 12 }, (_, index) => [index + 1, `poke${index}`] as [number, string]);
      axiosMock.get.mockResolvedValue(pokemonList(...entries));
      const adapter = new PokeApiAdapter();

      await expect(adapter.searchPokemon("poke")).resolves.toHaveLength(8);
    });

    it("caches the pokemon index between searches", async () => {
      axiosMock.get.mockResolvedValue(pokemonList([25, "pikachu"]));
      const adapter = new PokeApiAdapter();

      await adapter.searchPokemon("pika");
      await adapter.searchPokemon("pik");

      expect(axiosMock.get).toHaveBeenCalledTimes(1);
    });

    it("refreshes the index after the cache expires", async () => {
      vi.useFakeTimers();
      try {
        axiosMock.get.mockResolvedValue(pokemonList([25, "pikachu"]));
        const adapter = new PokeApiAdapter();

        await adapter.searchPokemon("pika");
        vi.advanceTimersByTime(10 * 60_000 + 1);
        await adapter.searchPokemon("pika");

        expect(axiosMock.get).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it("rejects an index with invalid pokemon urls", async () => {
      axiosMock.get.mockResolvedValue({ data: { results: [{ name: "missingno", url: "https://pokeapi.co/broken" }] } });
      const adapter = new PokeApiAdapter();

      await expect(adapter.searchPokemon("miss")).rejects.toMatchObject({ statusCode: 502 });
    });

    it("maps network failures to a 502 and retries on the next search", async () => {
      axiosMock.get.mockRejectedValueOnce(axiosError()).mockResolvedValueOnce(pokemonList([25, "pikachu"]));
      const adapter = new PokeApiAdapter();

      await expect(adapter.searchPokemon("pika")).rejects.toMatchObject({ statusCode: 502 });
      await expect(adapter.searchPokemon("pika")).resolves.toEqual([{ id: 25, name: "pikachu" }]);
    });

    it("rethrows unexpected errors untouched", async () => {
      const unexpected = new TypeError("boom");
      axiosMock.get.mockRejectedValue(unexpected);
      const adapter = new PokeApiAdapter();

      await expect(adapter.searchPokemon("pika")).rejects.toBe(unexpected);
    });
  });

  describe("findPokemon", () => {
    it("maps the API payload into a pokemon card", async () => {
      axiosMock.get.mockResolvedValue(pikachuDetails);
      const adapter = new PokeApiAdapter();

      await expect(adapter.findPokemon("Pikachu")).resolves.toEqual({
        id: 25,
        name: "pikachu",
        imageUrl: "https://img/pikachu.png",
        types: ["electric"],
        height: 4,
        weight: 60,
        stats: { hp: 35, attack: 55 }
      });
      expect(axiosMock.get).toHaveBeenCalledWith("https://pokeapi.co/api/v2/pokemon/pikachu", { timeout: 8000 });
    });

    it("rejects pokemon without official artwork", async () => {
      axiosMock.get.mockResolvedValue({ data: { ...pikachuDetails.data, sprites: {} } });
      const adapter = new PokeApiAdapter();

      await expect(adapter.findPokemon("pikachu")).rejects.toMatchObject({ statusCode: 422 });
    });

    it("maps a 404 to not found", async () => {
      axiosMock.get.mockRejectedValue(axiosError(404));
      const adapter = new PokeApiAdapter();

      const error = await adapter.findPokemon("nope").catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ statusCode: 404 });
    });

    it("maps other API failures to a 502", async () => {
      axiosMock.get.mockRejectedValue(axiosError(500));
      const adapter = new PokeApiAdapter();

      await expect(adapter.findPokemon("pikachu")).rejects.toMatchObject({ statusCode: 502 });
    });

    it("rethrows unexpected errors untouched", async () => {
      const unexpected = new TypeError("boom");
      axiosMock.get.mockRejectedValue(unexpected);
      const adapter = new PokeApiAdapter();

      await expect(adapter.findPokemon("pikachu")).rejects.toBe(unexpected);
    });
  });
});
