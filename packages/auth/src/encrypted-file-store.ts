import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SecretStore } from "./types.js";

interface VaultFile {
  version: 1;
  salt: string;
  secrets: Record<string, { iv: string; tag: string; ciphertext: string }>;
}

/**
 * AES-256-GCM encrypted secret vault on disk.
 * Secrets never go into SQLite — only `secretRef` keys do.
 * Until Tauri keychain lands, this is the secure local store.
 */
export class EncryptedFileSecretStore implements SecretStore {
  #keyPath: string;
  #vaultPath: string;
  #key: Buffer | null = null;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.#keyPath = join(dataDir, ".sentinel-key");
    this.#vaultPath = join(dataDir, "secrets.vault");
  }

  async get(ref: string): Promise<string | undefined> {
    const vault = this.#readVault();
    const entry = vault.secrets[ref];
    if (!entry) return undefined;

    const key = this.#getKey(Buffer.from(vault.salt, "base64"));
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(entry.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(entry.tag, "base64"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(entry.ciphertext, "base64")),
      decipher.final(),
    ]);
    return plain.toString("utf8");
  }

  async set(ref: string, value: string): Promise<void> {
    const vault = this.#readVault();
    const key = this.#getKey(Buffer.from(vault.salt, "base64"));
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    vault.secrets[ref] = {
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
    this.#writeVault(vault);
  }

  async delete(ref: string): Promise<void> {
    const vault = this.#readVault();
    if (!(ref in vault.secrets)) return;
    delete vault.secrets[ref];
    this.#writeVault(vault);
  }

  async has(ref: string): Promise<boolean> {
    const vault = this.#readVault();
    return Boolean(vault.secrets[ref]);
  }

  #readVault(): VaultFile {
    if (!existsSync(this.#vaultPath)) {
      const salt = randomBytes(16);
      const empty: VaultFile = {
        version: 1,
        salt: salt.toString("base64"),
        secrets: {},
      };
      this.#ensureKeyFile();
      this.#writeVault(empty);
      return empty;
    }
    return JSON.parse(readFileSync(this.#vaultPath, "utf8")) as VaultFile;
  }

  #writeVault(vault: VaultFile) {
    mkdirSync(dirname(this.#vaultPath), { recursive: true });
    writeFileSync(this.#vaultPath, JSON.stringify(vault), { encoding: "utf8" });
    try {
      chmodSync(this.#vaultPath, 0o600);
    } catch {
      // Windows may ignore chmod — still better than plaintext SQLite.
    }
  }

  #ensureKeyFile() {
    if (existsSync(this.#keyPath)) return;
    const material = randomBytes(32);
    writeFileSync(this.#keyPath, material.toString("base64"), {
      encoding: "utf8",
    });
    try {
      chmodSync(this.#keyPath, 0o600);
    } catch {
      // ignore
    }
  }

  #getKey(salt: Buffer): Buffer {
    if (this.#key) return this.#key;
    this.#ensureKeyFile();
    const material = Buffer.from(readFileSync(this.#keyPath, "utf8"), "base64");
    this.#key = scryptSync(material, salt, 32);
    return this.#key;
  }
}

export function environmentSecretRef(environmentId: string): string {
  return `env:${environmentId}:auth`;
}

export function personaSecretRef(environmentId: string, personaId: string): string {
  return `persona:${environmentId}:${personaId}:auth`;
}
