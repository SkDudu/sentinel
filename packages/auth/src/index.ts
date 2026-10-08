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

/** Logs in with the recipe and downloads the OpenAPI document it points to. */
export async function fetchSpecWithRecipe(
  environment: Environment,
  store: SecretStore,
  executor: LoginExecutor,
): Promise<{ text: string; url: string; login: LoginRecipeResult }> {
  const specUrl = environment.loginRecipe?.spec?.url;
  if (!specUrl) {
    throw new Error("Receita de login não tem URL do OpenAPI");
  }
  const login = await loginWithRecipe(environment, store, executor);
  const url = new URL(specUrl, environment.baseUrl).toString();
  const response = await executor.execute({
    method: "GET",
    url,
    headers: {
      ...environment.headers,
      ...login.headersFor("spec", url),
      Accept: "application/json, application/yaml, text/yaml, */*",
    },
    redirect: "manual",
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error(
      `OpenAPI redirecionou para ${response.headers.location ?? "?"} — sessão não aceita`,
    );
  }
  if (response.status >= 400) {
    throw new Error(`OpenAPI respondeu ${response.status}`);
  }
  const text =
    typeof response.body === "string"
      ? response.body
      : JSON.stringify(response.body);
  return { text, url, login };
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
