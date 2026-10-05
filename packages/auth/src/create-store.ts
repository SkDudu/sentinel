import { EncryptedFileSecretStore } from "./encrypted-file-store.js";
import {
  KeychainSecretStore,
  type KeychainBackend,
  type TauriInvoke,
  createTauriKeychainBackend,
} from "./keychain-store.js";
import type { SecretStore } from "./types.js";

export type SecretBackendKind = "file" | "keychain";

export interface CreateSecretStoreOptions {
  dataDir: string;
  /** Prefer OS keychain when backend is available. */
  preferKeychain?: boolean;
  /** Explicit backend kind. */
  kind?: SecretBackendKind;
  /** Pre-built keychain backend. */
  keychainBackend?: KeychainBackend;
  /** Tauri invoke used to build keychain backend. */
  tauriInvoke?: TauriInvoke;
}

export function createSecretStore(options: CreateSecretStoreOptions): {
  store: SecretStore;
  kind: SecretBackendKind;
} {
  const wantKeychain =
    options.kind === "keychain" ||
    (options.preferKeychain && options.kind !== "file");

  if (wantKeychain) {
    const backend =
      options.keychainBackend ??
      (options.tauriInvoke
        ? createTauriKeychainBackend(options.tauriInvoke)
        : undefined);
    if (backend) {
      return {
        store: new KeychainSecretStore(backend),
        kind: "keychain",
      };
    }
  }

  return {
    store: new EncryptedFileSecretStore(options.dataDir),
    kind: "file",
  };
}
