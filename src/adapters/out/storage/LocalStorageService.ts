import axios from "axios";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "../../../core/domain/errors";
import { ILocalStorageService } from "../../../core/ports/services";

function getErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") return error.code;
  return undefined;
}

export class LocalStorageService implements ILocalStorageService {
  private readonly cardsDirectory = path.resolve(process.env.UPLOADS_DIR ?? "./uploads", "cards");

  async deleteImage(imagePath: string): Promise<void> {
    const filename = imagePath.startsWith("/uploads/cards/")
      ? imagePath.slice("/uploads/cards/".length)
      : "";
    if (!/^pokemon-[a-zA-Z0-9-]+\.(png|webp|jpg|svg)$/.test(filename)) {
      throw new AppError("O caminho da imagem do lote não é válido para remoção.", 500);
    }

    await rm(path.join(this.cardsDirectory, filename), { force: true });
  }

  async saveImage(url: string, pokemonId: number): Promise<string> {
    let response;
    try {
      response = await axios.get<ArrayBuffer>(url, { responseType: "arraybuffer", timeout: 12000, maxContentLength: 10_000_000 });
    } catch (error) {
      if (axios.isAxiosError(error)) throw new AppError("Não foi possível descarregar a imagem oficial do Pokémon.", 502);
      throw error;
    }
    const mime = String(response.headers["content-type"] ?? "");
    if (!mime.startsWith("image/")) throw new AppError("A imagem retornada pela PokéAPI é inválida.", 502);
    const bytes = Buffer.from(response.data);
    const extension = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
    const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
    const filename = `pokemon-${pokemonId}-${digest}.${extension}`;
    await mkdir(this.cardsDirectory, { recursive: true });
    const target = path.join(this.cardsDirectory, filename);
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, bytes, { flag: "wx" });
      try {
        await rename(temporary, target);
      } catch (error) {
        const code = getErrorCode(error);
        if (code !== "EEXIST" && code !== "EPERM") throw error;
        await access(target);
        await rm(temporary, { force: true });
      }
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
    return `/uploads/cards/${filename}`;
  }
}
