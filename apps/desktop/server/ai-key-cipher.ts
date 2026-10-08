import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function keyMaterial(dataDir: string): Buffer {
  const path = join(dataDir, ".sentinel-key");
  if (!existsSync(path)) {
    writeFileSync(path, randomBytes(32).toString("base64"), { encoding: "utf8" });
  }
  return scryptSync(Buffer.from(readFileSync(path, "utf8"), "base64"), "sentinel-ai-key", 32);
}

/** Cifra a chave. O retorno vai para o SQLite, nunca o texto puro. */
export function sealApiKey(dataDir: string, plain: string): string {
  const key = keyMaterial(dataDir);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return JSON.stringify({
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  });
}

export function openApiKey(dataDir: string, encoded: string): string {
  const packed = JSON.parse(encoded) as { iv: string; tag: string; ciphertext: string };
  const key = keyMaterial(dataDir);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(packed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(packed.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(packed.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
