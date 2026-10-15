import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tauriDir = join(root, "src-tauri");
const serverOut = join(tauriDir, "resources", "server");
rmSync(serverOut, { recursive: true, force: true });

await build({
  entryPoints: [join(root, "server", "standalone.ts")],
  outfile: join(serverOut, "sentinel-api.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["playwright-core"],
  banner: {
    js: 'import { createRequire as __sentinelRequire } from "node:module"; const require = __sentinelRequire(import.meta.url);',
  },
  logLevel: "warning",
});

const recorderRequire = createRequire(
  join(root, "..", "..", "packages", "login-recorder", "package.json"),
);
cpSync(
  dirname(recorderRequire.resolve("playwright-core/package.json")),
  join(serverOut, "node_modules", "playwright-core"),
  { recursive: true, dereference: true },
);

// Tauri resolves externalBin by host target triple; node:sqlite needs Node >= 22.5.
const triple = execFileSync("rustc", ["-vV"], { encoding: "utf8" }).match(/^host: (.+)$/m)[1];
const ext = process.platform === "win32" ? ".exe" : "";
const nodeOut = join(tauriDir, "binaries", `node-${triple}${ext}`);
mkdirSync(dirname(nodeOut), { recursive: true });
copyFileSync(process.execPath, nodeOut);
if (process.platform === "darwin") {
  const arch = triple.startsWith("aarch64") ? "arm64" : "x86_64";
  try {
    execFileSync("lipo", [nodeOut, "-thin", arch, "-output", nodeOut], { stdio: "ignore" });
  } catch {
    // not a universal binary
  }
}

console.log(`sidecar ready: ${nodeOut}`);
