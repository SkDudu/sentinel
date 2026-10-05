import type { SecretStore } from "@sw/auth";

/** True when running inside the Tauri shell. */
export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * SecretStore backed by OS keychain via Tauri commands.
 * Returns null outside the native shell (API uses file vault).
 */
export async function createTauriKeychainStore(): Promise<SecretStore | null> {
  if (!isTauriRuntime()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  const service = "sentinel";

  async function get(ref: string) {
    const value = await invoke<string | null>("secret_get", {
      service,
      account: ref,
    });
    return value == null || value === "" ? undefined : value;
  }

  return {
    get,
    async set(ref: string, value: string) {
      await invoke("secret_set", { service, account: ref, password: value });
    },
    async delete(ref: string) {
      await invoke("secret_delete", { service, account: ref });
    },
    async has(ref: string) {
      return (await get(ref)) !== undefined;
    },
  };
}
