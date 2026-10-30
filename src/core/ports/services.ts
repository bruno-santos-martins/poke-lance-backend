export interface PokemonCard {
  id: number;
  name: string;
  imageUrl: string;
  types: string[];
  height: number;
  weight: number;
  stats: Record<string, number>;
}

export interface PokemonSuggestion {
  id: number;
  name: string;
}

export interface IPokeApiProvider {
  findPokemon(identifier: string): Promise<PokemonCard>;
  searchPokemon(query: string): Promise<PokemonSuggestion[]>;
}

export interface ILocalStorageService {
  saveImage(url: string, pokemonId: number): Promise<string>;
  deleteImage(imagePath: string): Promise<void>;
}

export interface IHashService {
  sha256(value: string): string;
}

export interface ITokenService {
  sign(payload: { sub: string; role: string }): string;
  verify(token: string): { sub: string; role: string };
}

export interface IAuctionNotifier {
  bidPlaced(lotId: string, payload: unknown): void;
  lotUpdated(lotId: string, payload: unknown): void;
  walletUpdated(userId: string, payload: { balance: number; committed: number; available: number }): void;
}
