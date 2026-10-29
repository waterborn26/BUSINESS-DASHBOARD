// Credential storage.
//
// Secrets go to the macOS Keychain through the Rust shell, never to localStorage,
// the SQLite file or anything the web build can reach. That means the browser build
// genuinely cannot store them — and it must say so rather than quietly keeping an
// API token in a web page, which is how tokens leak.

export type SecretHost = "desktop" | "browser";

/** Tauri v2 injects this before any app code runs. */
export function secretHost(): SecretHost {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window ? "desktop" : "browser";
}

async function invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const { invoke: call } = await import("@tauri-apps/api/core");
  return call<T>(cmd, args);
}

export async function setSecret(key: string, value: string): Promise<void> {
  if (secretHost() !== "desktop") {
    throw new Error("Credentials can only be stored by the desktop app, where the macOS Keychain is available.");
  }
  await invoke<void>("secret_set", { key, value });
}

export async function getSecret(key: string): Promise<string | null> {
  if (secretHost() !== "desktop") return null;
  return (await invoke<string | null>("secret_get", { key })) ?? null;
}

export async function deleteSecret(key: string): Promise<void> {
  if (secretHost() !== "desktop") return;
  await invoke<void>("secret_delete", { key });
}
