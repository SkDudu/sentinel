import { AuthType, type Environment } from "@sw/core";
import {
  parseRecipeSecrets,
  runLoginRecipe,
  type LoginExecutor,
  type LoginRecipeResult,
} from "./login-recipe.js";
import type { SecretStore } from "./types.js";

export type { SecretStore } from "./types.js";
export {
  LoginRecipeError,
  parseRecipeSecrets,
  runLoginRecipe,
  type LoginAudience,
  type LoginExecutor,
  type LoginRecipeResult,
  type LoginStepReport,
} from "./login-recipe.js";
export {
  EncryptedFileSecretStore,
  environmentSecretRef,
} from "./encrypted-file-store.js";
export {
  KeychainSecretStore,
  createTauriKeychainBackend,
  type KeychainBackend,
  type TauriInvoke,
} from "./keychain-store.js";
export {
  createSecretStore,
  type CreateSecretStoreOptions,
  type SecretBackendKind,
} from "./create-store.js";

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

  async has(ref: string) {
    return this.#secrets.has(ref);
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

  async has(ref: string) {
    if (await this.overlay.has(ref)) return true;
    return this.primary.has(ref);
  }
}

/** Runs the environment login recipe with secrets from the vault. */
export async function loginWithRecipe(
  environment: Environment,
  store: SecretStore,
  executor: LoginExecutor | undefined,
): Promise<LoginRecipeResult> {
  if (!environment.loginRecipe) {
    throw new Error(`Ambiente "${environment.name}" sem receita de login`);
  }
  if (!executor) {
    throw new Error("Receita de login precisa de um executor HTTP");
  }
  const raw = environment.secretRef
    ? await store.get(environment.secretRef)
    : undefined;
  return runLoginRecipe(environment.loginRecipe, {
    baseUrl: environment.baseUrl,
    secrets: parseRecipeSecrets(raw),
    executor,
  });
}

export async function resolveAuthHeaders(
  environment: Environment,
  store: SecretStore,
  options: { executor?: LoginExecutor } = {},
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...environment.headers };

  if (environment.authType === AuthType.LOGIN_RECIPE) {
    return {
      ...headers,
      ...(await loginWithRecipe(environment, store, options.executor)).headersFor(
        "api",
      ),
    };
  }

  if (environment.authType === AuthType.NONE || !environment.secretRef) {
    return headers;
  }

  const secret = await store.get(environment.secretRef);
  if (!secret) return headers;

  switch (environment.authType) {
    case AuthType.BEARER:
      headers.Authorization = `Bearer ${secret}`;
      break;
    case AuthType.BASIC: {
      // Vault stores `user:pass`. Legacy entries without `:` stay as pre-encoded Basic material.
      const encoded = secret.includes(":")
        ? Buffer.from(secret, "utf8").toString("base64")
        : secret;
      headers.Authorization = `Basic ${encoded}`;
      break;
    }
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
