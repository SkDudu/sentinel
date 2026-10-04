import { AuthType, type Environment } from "@sw/core";
import type { SecretStore } from "./types.js";

export type { SecretStore } from "./types.js";
export {
  EncryptedFileSecretStore,
  environmentSecretRef,
} from "./encrypted-file-store.js";

/** In-memory store for tests / ephemeral overrides. */
export class MemorySecretStore implements SecretStore {
  #secrets = new Map<string, string>();

  async get(ref: string) {
    return this.#secrets.get(ref);
  }

  async set(ref: string, value: string) {
    this.#secrets.set(ref, value);
  }

  async delete(ref: string) {
    this.#secrets.delete(ref);
  }
}

/** Overlay wins over primary — used for one-off scan token overrides. */
export class OverlaySecretStore implements SecretStore {
  constructor(
    private readonly primary: SecretStore,
    private readonly overlay: SecretStore,
  ) {}

  async get(ref: string) {
    return (await this.overlay.get(ref)) ?? this.primary.get(ref);
  }

  async set(ref: string, value: string) {
    await this.primary.set(ref, value);
  }

  async delete(ref: string) {
    await this.overlay.delete(ref);
    await this.primary.delete(ref);
  }
}

export async function resolveAuthHeaders(
  environment: Environment,
  store: SecretStore,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...environment.headers };

  if (environment.authType === AuthType.NONE || !environment.secretRef) {
    return headers;
  }

  const secret = await store.get(environment.secretRef);
  if (!secret) return headers;

  switch (environment.authType) {
    case AuthType.BEARER:
      headers.Authorization = `Bearer ${secret}`;
      break;
    case AuthType.BASIC:
      headers.Authorization = `Basic ${secret}`;
      break;
    case AuthType.API_KEY:
      headers["X-API-Key"] = secret;
      break;
    case AuthType.COOKIE:
      headers.Cookie = secret;
      break;
    case AuthType.OAUTH2:
      headers.Authorization = `Bearer ${secret}`;
      break;
  }

  return headers;
}
