import type { LoginFieldValue, LoginRecipe, LoginStep } from "@sw/core";

/** One same-origin exchange captured from the headed browser. */
export interface CapturedExchange {
  method: "GET" | "POST";
  url: string;
  status: number;
  location?: string;
  requestHeaders: Record<string, string>;
  postData?: string;
  responseType: string;
  setCookies: string[];
  body?: string;
}

export interface DerivedLogin {
  recipe: LoginRecipe;
  /** Secret field values. The UI puts `password` in the vault, never in the recipe. */
  secrets: Record<string, string>;
  specCandidates: string[];
}

const SECRET_FIELD = /^(password|senha|passwd|pass|secret)$/i;
const STATIC_PATH = /\.(?:js|mjs|css|map|png|jpe?g|gif|svg|ico|webp|woff2?|ttf)(?:\?|$)/i;
const SPEC_PATH = /openapi|swagger|api-docs/i;
const SKIP_HEADER = /^(cookie|host|content-length|user-agent|accept|accept-language|accept-encoding|connection|origin|referer|sec-|upgrade-insecure)/i;

interface Draft {
  method: "GET" | "POST";
  url: string;
  status: number;
  location?: string;
  bodyType: "none" | "form" | "json";
  fields: Record<string, LoginFieldValue>;
  headers: Record<string, LoginFieldValue>;
  setCookies: string[];
  html?: string;
  json?: unknown;
  extracts: LoginStep["extract"];
}

function header(headers: Record<string, string>, name: string) {
  const found = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  return found?.[1];
}

function attr(tag: string, name: string): string | undefined {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined;
}

function hiddenInputs(html: string): Array<{ name: string; value: string }> {
  const found: Array<{ name: string; value: string }> = [];
  for (const tag of html.match(/<input\b[^>]*>/gi) ?? []) {
    if ((attr(tag, "type") ?? "").toLowerCase() !== "hidden") continue;
    const name = attr(tag, "name");
    const value = attr(tag, "value");
    if (name && value) found.push({ name, value });
  }
  return found;
}

function cookiePairs(lines: string[]) {
  const pairs: Array<{ name: string; value: string }> = [];
  for (const line of lines) {
    const pair = line.split(";")[0] ?? "";
    const eq = pair.indexOf("=");
    if (eq > 0) {
      pairs.push({
        name: pair.slice(0, eq).trim(),
        value: pair.slice(eq + 1).trim(),
      });
    }
  }
  return pairs;
}

function isSpec(exchange: CapturedExchange) {
  if (!SPEC_PATH.test(exchange.url) && !/\.ya?ml(?:\?|$)/i.test(exchange.url)) {
    return false;
  }
  const body = exchange.body ?? "";
  return /openapi\s*:|"openapi"\s*:|swagger\s*:|"swagger"\s*:/.test(body);
}

function parseFields(
  exchange: CapturedExchange,
  secrets: Record<string, string>,
): { bodyType: Draft["bodyType"]; fields: Record<string, LoginFieldValue> } {
  if (exchange.method === "GET" || !exchange.postData) {
    return { bodyType: "none", fields: {} };
  }
  const type = header(exchange.requestHeaders, "content-type") ?? "";
  if (type.includes("application/json")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(exchange.postData);
    } catch {
      return { bodyType: "none", fields: {} };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { bodyType: "none", fields: {} };
    }
    return {
      bodyType: "json",
      fields: fieldsFromRecord(parsed as Record<string, unknown>, secrets),
    };
  }
  const params = new URLSearchParams(exchange.postData);
  const record: Record<string, unknown> = {};
  for (const [key, value] of params) record[key] = value;
  return { bodyType: "form", fields: fieldsFromRecord(record, secrets) };
}

function fieldsFromRecord(
  record: Record<string, unknown>,
  secrets: Record<string, string>,
): Record<string, LoginFieldValue> {
  const fields: Record<string, LoginFieldValue> = {};
  for (const [key, raw] of Object.entries(record)) {
    if (typeof raw !== "string" && typeof raw !== "number") continue;
    const value = String(raw);
    if (SECRET_FIELD.test(key)) {
      const secretKey = key.toLowerCase() === "password" ? "password" : key;
      secrets[secretKey] = value;
      fields[key] = { kind: "secret", key: secretKey };
    } else {
      fields[key] = { kind: "literal", value };
    }
  }
  return fields;
}

function interestingHeaders(
  headers: Record<string, string>,
): Record<string, LoginFieldValue> {
  const kept: Record<string, LoginFieldValue> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (SKIP_HEADER.test(name)) continue;
    if (/^content-type$/i.test(name)) continue;
    kept[name] = { kind: "literal", value };
  }
  return kept;
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Turns a captured login into a replayable recipe.
 * Password values leave in `secrets`; the recipe only keeps the key.
 */
export function deriveLoginRecipe(
  baseUrl: string,
  exchanges: CapturedExchange[],
): DerivedLogin {
  const origin = new URL(baseUrl);
  const secrets: Record<string, string> = {};
  const specCandidates: string[] = [];
  const drafts: Draft[] = [];

  for (const exchange of exchanges) {
    let url: URL;
    try {
      url = new URL(exchange.url);
    } catch {
      continue;
    }
    if (url.host !== origin.host) continue;
    if (STATIC_PATH.test(url.pathname)) continue;
    if (isSpec(exchange)) {
      specCandidates.push(`${url.pathname}${url.search}`);
      continue;
    }
    if (exchange.method !== "GET" && exchange.method !== "POST") continue;

    const { bodyType, fields } = parseFields(exchange, secrets);
    const type = exchange.responseType.toLowerCase();
    let json: unknown;
    if (type.includes("json") && exchange.body) {
      try {
        json = JSON.parse(exchange.body);
      } catch {
        json = undefined;
      }
    }
    drafts.push({
      method: exchange.method,
      url: `${url.pathname}${url.search}`,
      status: exchange.status,
      location: exchange.location,
      bodyType,
      fields,
      headers: interestingHeaders(exchange.requestHeaders),
      setCookies: exchange.setCookies,
      html: type.includes("html") ? exchange.body : undefined,
      json,
      extracts: [],
    });
  }

  linkHiddenInputs(drafts);
  linkCookieHeaders(drafts);
  linkJsonTokens(drafts);

  const spec = specCandidates[0];
  const steps: LoginStep[] = drafts
    .filter(
      (draft) =>
        draft.method === "POST" ||
        draft.setCookies.length > 0 ||
        draft.extracts.length > 0,
    )
    .map((draft) => toStep(draft));

  if (steps.length === 0) {
    throw new Error(
      "Nenhum passo de login capturado. Faça o login na janela e conclua de novo.",
    );
  }

  return {
    recipe: {
      version: 1,
      steps,
      ...(spec ? { spec: { url: spec } } : {}),
    },
    secrets,
    specCandidates,
  };
}

function toStep(draft: Draft): LoginStep {
  const loginPost =
    draft.method === "POST" &&
    /login/i.test(draft.url) &&
    draft.location &&
    !/login/i.test(draft.location);
  const emitsBearer = draft.extracts.some(
    (extract) => extract.kind === "jsonPath" && extract.emit === "bearer",
  );
  return {
    label: `${draft.method} ${draft.url}`,
    role: emitsBearer ? "api-auth" : "both",
    request: {
      method: draft.method,
      url: draft.url,
      bodyType: draft.bodyType,
      fields: draft.fields,
      headers: draft.headers,
    },
    extract: draft.extracts,
    ...(loginPost ? { failIfLocationIncludes: "/login" } : {}),
  };
}

function linkHiddenInputs(drafts: Draft[]) {
  for (let index = 0; index < drafts.length; index += 1) {
    const draft = drafts[index]!;
    for (const [name, field] of Object.entries(draft.fields)) {
      if (field.kind !== "literal" || !field.value) continue;
      for (let prev = index - 1; prev >= 0; prev -= 1) {
        const source = drafts[prev]!;
        if (!source.html) continue;
        const input = hiddenInputs(source.html).find(
          (item) => item.name === name && item.value === field.value,
        );
        if (!input) continue;
        const variable = name.replace(/[^\w]+/g, "_") || "field";
        draft.fields[name] = { kind: "var", name: variable };
        if (
          !source.extracts.some(
            (extract) =>
              extract.kind === "hiddenInput" && extract.name === input.name,
          )
        ) {
          source.extracts.push({
            kind: "hiddenInput",
            name: input.name,
            as: variable,
          });
        }
        break;
      }
    }
  }
}

function linkCookieHeaders(drafts: Draft[]) {
  const jar = new Map<string, { value: string; draft: Draft }>();
  for (const draft of drafts) {
    for (const [name, field] of Object.entries(draft.headers)) {
      if (field.kind !== "literal") continue;
      if (!/xsrf|csrf/i.test(name)) continue;
      for (const [cookieName, entry] of jar) {
        if (safeDecode(entry.value) !== field.value) continue;
        const variable = cookieName.toLowerCase().replace(/[^\w]+/g, "_");
        draft.headers[name] = { kind: "var", name: variable };
        if (
          !entry.draft.extracts.some(
            (extract) => extract.kind === "cookie" && extract.name === cookieName,
          )
        ) {
          entry.draft.extracts.push({
            kind: "cookie",
            name: cookieName,
            as: variable,
          });
        }
        break;
      }
    }
    for (const cookie of cookiePairs(draft.setCookies)) {
      jar.set(cookie.name, { value: cookie.value, draft });
    }
  }
}

function linkJsonTokens(drafts: Draft[]) {
  for (const draft of drafts) {
    if (!draft.json || typeof draft.json !== "object" || Array.isArray(draft.json)) {
      continue;
    }
    const record = draft.json as Record<string, unknown>;
    for (const key of ["access_token", "token", "jwt"]) {
      if (typeof record[key] !== "string") continue;
      draft.extracts.push({
        kind: "jsonPath",
        path: key,
        as: key,
        emit: "bearer",
      });
      break;
    }
  }
}
