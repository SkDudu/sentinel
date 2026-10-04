import { AuthType, type Environment } from "@sw/core";

export interface SecretStore {
  get(ref: string): Promise<string | undefined>;
  set(ref: string, value: string): Promise<void>;
  delete(ref: string): Promise<void>;
}

/** In-memory store for local/dev only — desktop should use OS keychain. */
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
