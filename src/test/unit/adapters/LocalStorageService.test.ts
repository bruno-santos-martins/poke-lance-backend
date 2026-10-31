import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalStorageService } from "../../../adapters/out/storage/LocalStorageService";

const axiosMock = vi.hoisted(() => ({
  get: vi.fn(),
  isAxiosError: (error: unknown) => typeof error === "object" && error !== null && "isAxiosError" in error
}));

vi.mock("axios", () => ({ default: axiosMock }));

function imageResponse(contentType: string, content = "image-bytes") {
  return { data: Buffer.from(content), headers: { "content-type": contentType } };
}

describe("LocalStorageService", () => {
  let uploadsDir: string;
  let cardsDir: string;
  const previousUploadsDir = process.env.UPLOADS_DIR;

  beforeEach(async () => {
    uploadsDir = await mkdtemp(path.join(tmpdir(), "auction-uploads-"));
    cardsDir = path.join(uploadsDir, "cards");
    process.env.UPLOADS_DIR = uploadsDir;
    axiosMock.get.mockReset();
  });

  afterEach(async () => {
    if (previousUploadsDir === undefined) delete process.env.UPLOADS_DIR;
    else process.env.UPLOADS_DIR = previousUploadsDir;
    await rm(uploadsDir, { recursive: true, force: true });
  });

  describe("saveImage", () => {
    it.each([
      ["image/png", "png"],
      ["image/webp", "webp"],
      ["image/jpeg", "jpg"]
    ])("stores a %s image with a content-addressed name", async (contentType, extension) => {
      axiosMock.get.mockResolvedValue(imageResponse(contentType));
      const service = new LocalStorageService();

      const publicPath = await service.saveImage("https://img/pikachu", 25);

      expect(publicPath).toMatch(new RegExp(`^/uploads/cards/pokemon-25-[0-9a-f]{16}\\.${extension}$`));
      const filename = publicPath.split("/").pop()!;
      await expect(readFile(path.join(cardsDir, filename), "utf8")).resolves.toBe("image-bytes");
    });

    it("reuses the existing file when the same image is saved twice", async () => {
      axiosMock.get.mockResolvedValue(imageResponse("image/png"));
      const service = new LocalStorageService();

      const first = await service.saveImage("https://img/pikachu", 25);
      const second = await service.saveImage("https://img/pikachu", 25);

      expect(second).toBe(first);
      const files = await readdir(cardsDir);
      expect(files).toHaveLength(1);
    });

    it("rejects responses that are not images", async () => {
      axiosMock.get.mockResolvedValue(imageResponse("text/html"));
      const service = new LocalStorageService();

      await expect(service.saveImage("https://img/pikachu", 25)).rejects.toMatchObject({ statusCode: 502 });
    });

    it("rejects responses without a content type", async () => {
      axiosMock.get.mockResolvedValue({ data: Buffer.from("x"), headers: {} });
      const service = new LocalStorageService();

      await expect(service.saveImage("https://img/pikachu", 25)).rejects.toMatchObject({ statusCode: 502 });
    });

    it("maps download failures to a 502", async () => {
      axiosMock.get.mockRejectedValue(Object.assign(new Error("timeout"), { isAxiosError: true }));
      const service = new LocalStorageService();

      await expect(service.saveImage("https://img/pikachu", 25)).rejects.toMatchObject({ statusCode: 502 });
    });

    it("rethrows unexpected download errors untouched", async () => {
      const unexpected = new TypeError("boom");
      axiosMock.get.mockRejectedValue(unexpected);
      const service = new LocalStorageService();

      await expect(service.saveImage("https://img/pikachu", 25)).rejects.toBe(unexpected);
    });

    it("cleans up the temporary file when writing fails", async () => {
      axiosMock.get.mockResolvedValue(imageResponse("image/png"));
      // A regular file where the cards directory should be makes mkdir/write fail.
      await writeFile(cardsDir, "not a directory");
      const service = new LocalStorageService();

      await expect(service.saveImage("https://img/pikachu", 25)).rejects.toBeDefined();
      const entries = await readdir(uploadsDir);
      expect(entries).toEqual(["cards"]);
    });
  });

  describe("deleteImage", () => {
    it("removes a stored card image", async () => {
      await mkdir(cardsDir, { recursive: true });
      await writeFile(path.join(cardsDir, "pokemon-25-abc.png"), "x");
      const service = new LocalStorageService();

      await service.deleteImage("/uploads/cards/pokemon-25-abc.png");

      await expect(readdir(cardsDir)).resolves.toEqual([]);
    });

    it("does not fail when the file is already gone", async () => {
      const service = new LocalStorageService();

      await expect(service.deleteImage("/uploads/cards/pokemon-25-abc.png")).resolves.toBeUndefined();
    });

    it.each([
      "/uploads/cards/../../etc/passwd",
      "/uploads/other/pokemon-25-abc.png",
      "/uploads/cards/pokemon-25-abc.exe",
      "pokemon-25-abc.png"
    ])("refuses to delete unsafe path %s", async (imagePath) => {
      const service = new LocalStorageService();

      await expect(service.deleteImage(imagePath)).rejects.toMatchObject({ statusCode: 500 });
    });
  });
});
