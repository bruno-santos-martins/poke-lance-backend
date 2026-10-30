import { IPokeApiProvider } from "../../../core/ports/services";

export class GetPokemonDetailsUseCase {
  constructor(private readonly pokeApi: IPokeApiProvider) {}

  execute(identifier: string) {
    return this.pokeApi.findPokemon(identifier);
  }
}
