import type { SecretStore } from "./types.js";

/** Pluggable OS keychain backend (Tauri invoke, keytar, etc.). */
export interface KeychainBackend {
  get(service: string, account: string): Promise<string | undefined>;
  set(service: string, account: string, password: string): Promise<void>;
  delete(service: string, account: string): Promise<void>;
}

export type TauriInvoke = (
  cmd: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

/** Backend that talks to Tauri Rust commands (`secret_get` / `secret_set` / `secret_delete`). */
export function createTauriKeychainBackend(invoke: TauriInvoke): KeychainBackend {
  return {
    async get(service, account) {
      const value = await invoke("secret_get", { service, account });
      if (value == null || value === "") return undefined;
      return String(value);
    },
    async set(service, account, password) {
      await invoke("secret_set", { service, account, password });
    },
    async delete(service, account) {
      await invoke("secret_delete", { service, account });
    },
  };
}

/**
 * OS keychain-backed SecretStore.
 * Requires a KeychainBackend (Tauri in desktop shell).
 */
export class KeychainSecretStore implements SecretStore {
  constructor(
    private readonly backend: KeychainBackend,
    private readonly service = "sentinel",
  ) {}

  async get(ref: string) {
    return this.backend.get(this.service, ref);
  }

  async set(ref: string, value: string) {
    await this.backend.set(this.service, ref, value);
  }

  async delete(ref: string) {
    await this.backend.delete(this.service, ref);
  }

  async has(ref: string) {
    return (await this.get(ref)) !== undefined;
  }
}
