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
  const page = await context.newPage();
  const exchanges: CapturedExchange[] = [];
  let open = true;

  const record = (responsePage: Page) => {
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
    throw new Error(
      `Não abriu ${origin.toString()}: ${error instanceof Error ? error.message : String(error)}`,
    );
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
