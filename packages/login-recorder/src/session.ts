import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type { Browser, Page, Response } from "playwright-core";
import {
  deriveLoginRecipe,
  type CapturedExchange,
  type DerivedLogin,
} from "./derive.js";

const { chromium } = createRequire(import.meta.url)("playwright-core") as typeof import("playwright-core");

export interface RecorderSnapshot {
  id: string;
  open: boolean;
  steps: Array<{ method: string; url: string; status: number }>;
}

export interface RecorderHandle {
  id: string;
  snapshot(): RecorderSnapshot;
  stop(): Promise<DerivedLogin>;
}

const BODY_LIMIT = 300_000;

async function launchBrowser(): Promise<Browser> {
  const channels = ["chrome", "msedge", "chromium"] as const;
  const errors: string[] = [];
  for (const channel of channels) {
    try {
      return await chromium.launch({ channel, headless: false });
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message.split("\n")[0]! : String(error),
      );
    }
  }
  throw new Error(
    `Chrome não encontrado. Instale o Google Chrome e tente de novo. (${errors[0] ?? "sem detalhe"})`,
  );
}

function friendlyNavigationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE/.test(message)) {
    return "A aplicação não respondeu. Confira se ela está rodando e se a base URL está certa.";
  }
  if (/ERR_NAME_NOT_RESOLVED|ERR_ADDRESS_UNREACHABLE|ERR_INTERNET_DISCONNECTED/.test(message)) {
    return "Endereço não encontrado. Confira a base URL e sua conexão.";
  }
  if (/ERR_CERT_|ERR_SSL_/.test(message)) {
    return "Certificado HTTPS inválido nesse endereço.";
  }
  if (/Timeout/i.test(message)) {
    return "A aplicação demorou demais para responder.";
  }
  return "Não foi possível abrir a base URL no navegador.";
}

/** Runs inside every recorded page (top frame only). */
const FINISH_OVERLAY_SCRIPT = `(() => {
  if (window.top !== window) return;
  const mount = () => {
    if (document.getElementById("__sentinel-recorder")) return;
    const host = document.createElement("div");
    host.id = "__sentinel-recorder";
    host.style.cssText =
      "position:fixed;right:16px;bottom:16px;z-index:2147483647;";
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = \`
      <style>
        .box{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;
          background:#111827;color:#f9fafb;font:500 13px system-ui,sans-serif;
          box-shadow:0 8px 24px rgba(0,0,0,.35)}
        .dot{width:8px;height:8px;border-radius:50%;background:#ef4444;animation:p 1.2s infinite}
        @keyframes p{50%{opacity:.3}}
        button{border:0;border-radius:8px;padding:6px 10px;background:#f9fafb;color:#111827;
          font:600 12px system-ui,sans-serif;cursor:pointer}
        button:disabled{opacity:.6;cursor:default}
      </style>
      <div class="box">
        <span class="dot"></span>
        <span>Sentinel gravando login</span>
        <button type="button">Concluir gravação</button>
      </div>\`;
    const button = root.querySelector("button");
    button.addEventListener("click", () => {
      button.disabled = true;
      button.textContent = "Concluindo…";
      window.__sentinelFinishRecording?.();
    });
    document.documentElement.appendChild(host);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})();`;

function keep(type: string) {
  return type === "document" || type === "xhr" || type === "fetch";
}

/** Opens a visible browser at `baseUrl` and records same-origin traffic. */
export async function startLoginRecording(options: {
  baseUrl: string;
}): Promise<RecorderHandle> {
  const origin = new URL(options.baseUrl);
  const browser = await launchBrowser();
  const context = await browser.newContext();
  const exchanges: CapturedExchange[] = [];
  let open = true;

  await context.exposeBinding("__sentinelFinishRecording", () => {
    open = false;
  });
  await context.addInitScript({ content: FINISH_OVERLAY_SCRIPT });
  const page = await context.newPage();

  const record = (responsePage: Page) => {
    responsePage.on("close", () => {
      if (context.pages().length === 0) open = false;
    });
    responsePage.on("response", (response) => {
      if (!keep(response.request().resourceType())) return;
      void capture(response).then((exchange) => {
        if (exchange) exchanges.push(exchange);
      });
    });
  };

  async function capture(response: Response): Promise<CapturedExchange | null> {
    const request = response.request();
    const method = request.method();
    if (method !== "GET" && method !== "POST") return null;
    let host: string;
    try {
      host = new URL(response.url()).host;
    } catch {
      return null;
    }
    if (host !== origin.host) return null;

    const type = response.headers()["content-type"] ?? "";
    let body: string | undefined;
    if (/html|json|yaml|text\/plain/i.test(type)) {
      try {
        const text = await response.text();
        body = text.slice(0, BODY_LIMIT);
      } catch {
        body = undefined;
      }
    }

    const location = response.headers().location;
    const setCookies = (await response.headersArray())
      .filter((header) => header.name.toLowerCase() === "set-cookie")
      .map((header) => header.value);
    return {
      method,
      url: response.url(),
      status: response.status(),
      ...(location ? { location } : {}),
      requestHeaders: request.headers(),
      postData: request.postData() ?? undefined,
      responseType: type,
      setCookies,
      ...(body ? { body } : {}),
    };
  }

  record(page);
  context.on("page", record);
  const markClosed = () => {
    open = false;
  };
  browser.on("disconnected", markClosed);

  try {
    await page.goto(origin.toString(), { waitUntil: "domcontentloaded" });
  } catch (error) {
    await browser.close().catch(() => undefined);
    throw new Error(friendlyNavigationError(error));
  }

  const id = randomUUID();
  return {
    id,
    snapshot: () => ({
      id,
      open,
      steps: exchanges.map((exchange) => ({
        method: exchange.method,
        url: exchange.url,
        status: exchange.status,
      })),
    }),
    stop: async () => {
      open = false;
      await browser.close().catch(() => undefined);
      return deriveLoginRecipe(origin.toString(), exchanges);
    },
  };
}
