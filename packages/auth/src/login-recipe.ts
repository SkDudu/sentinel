import type {
  HttpRequest,
  HttpResponse,
  LoginFieldValue,
  LoginRecipe,
  LoginStep,
  LoginStepRole,
} from "@sw/core";

/** Structural match for `@sw/http-client` RequestExecutor (no package dep). */
export interface LoginExecutor {
  execute(request: HttpRequest): Promise<HttpResponse>;
}

export type LoginAudience = "spec" | "api";

export interface LoginStepReport {
  label: string;
  method: string;
  url: string;
  status: number;
  /** Redirect target when the step answered 3xx. */
  location?: string;
  /** Cookie names set by this step (values never reported). */
  cookies: string[];
  extracted: string[];
}

export interface LoginRecipeResult {
  steps: LoginStepReport[];
  /** Headers to send for the OpenAPI document or for API requests. */
  headersFor(audience: LoginAudience, targetUrl?: string): Record<string, string>;
}

export class LoginRecipeError extends Error {
  constructor(
    message: string,
    readonly steps: LoginStepReport[],
  ) {
    super(message);
    this.name = "LoginRecipeError";
  }
}

interface JarEntry {
  value: string;
  role: LoginStepRole;
}

/** Vault entry: JSON object of strings, or a bare string meaning `password`. */
export function parseRecipeSecrets(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      );
    }
  } catch {
    // Bare password.
  }
  return { password: raw };
}

function parseSetCookie(line: string) {
  const [pair = "", ...attributes] = line.split(";");
  const eq = pair.indexOf("=");
  if (eq <= 0) return null;
  const name = pair.slice(0, eq).trim();
  const value = pair.slice(eq + 1).trim();
  let expired = false;
  for (const attribute of attributes) {
    const [rawKey = "", rawVal = ""] = attribute.split("=");
    const key = rawKey.trim().toLowerCase();
    if (key === "max-age" && Number(rawVal.trim()) <= 0) expired = true;
    if (key === "expires") {
      const at = Date.parse(rawVal.trim());
      if (!Number.isNaN(at) && at <= Date.now()) expired = true;
    }
  }
  return { name, value, expired };
}

function attr(tag: string, name: string): string | undefined {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined;
}

function decodeHtml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function findInputValue(html: string, name: string): string | undefined {
  for (const tag of html.match(/<input\b[^>]*>/gi) ?? []) {
    if (attr(tag, "name") === name) {
      const value = attr(tag, "value");
      return value === undefined ? undefined : decodeHtml(value);
    }
  }
  return undefined;
}

function readJsonPath(body: unknown, path: string): string | undefined {
  let current: unknown = body;
  if (typeof current === "string") {
    try {
      current = JSON.parse(current);
    } catch {
      return undefined;
    }
  }
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" || typeof current === "number"
    ? String(current)
    : undefined;
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function audienceAllows(role: LoginStepRole, audience: LoginAudience) {
  if (role === "both") return true;
  return audience === "spec" ? role === "spec-access" : role === "api-auth";
}

/**
 * Replays a recorded login against the target with plain HTTP.
 * Cookies are tracked per host across steps; redirects are never followed.
 */
export async function runLoginRecipe(
  recipe: LoginRecipe,
  options: {
    baseUrl: string;
    secrets: Record<string, string>;
    executor: LoginExecutor;
  },
): Promise<LoginRecipeResult> {
  const jar = new Map<string, Map<string, JarEntry>>();
  const vars: Record<string, string> = {};
  const bearer: Array<{ token: string; role: LoginStepRole }> = [];
  const reports: LoginStepReport[] = [];

  const hostJar = (host: string) => {
    let entries = jar.get(host);
    if (!entries) {
      entries = new Map();
      jar.set(host, entries);
    }
    return entries;
  };

  const resolveValue = (value: LoginFieldValue, step: LoginStep): string => {
    if (value.kind === "literal") return value.value;
    if (value.kind === "secret") {
      const secret = options.secrets[value.key];
      if (secret === undefined) {
        throw new LoginRecipeError(
          `Passo "${step.label}": secret "${value.key}" não está no vault`,
          reports,
        );
      }
      return secret;
    }
    const resolved = vars[value.name];
    if (resolved === undefined) {
      throw new LoginRecipeError(
        `Passo "${step.label}": variável "${value.name}" não foi extraída antes`,
        reports,
      );
    }
    return resolved;
  };

  for (const step of recipe.steps) {
    const url = new URL(step.request.url, options.baseUrl);
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(step.request.headers)) {
      headers[name] = resolveValue(value, step);
    }

    const cookies = [...hostJar(url.host).entries()]
      .map(([name, entry]) => `${name}=${entry.value}`)
      .join("; ");
    if (cookies) headers.Cookie = cookies;

    let body: string | undefined;
    if (step.request.method !== "GET" && step.request.bodyType !== "none") {
      const fields: Record<string, string> = {};
      for (const [name, value] of Object.entries(step.request.fields)) {
        fields[name] = resolveValue(value, step);
      }
      if (step.request.bodyType === "form") {
        body = new URLSearchParams(fields).toString();
        headers["Content-Type"] = "application/x-www-form-urlencoded";
      } else {
        body = JSON.stringify(fields);
        headers["Content-Type"] = "application/json";
      }
      headers.Accept ??= "text/html,application/json;q=0.9,*/*;q=0.8";
    }

    const response = await options.executor.execute({
      method: step.request.method,
      url: url.toString(),
      headers,
      body,
      redirect: "manual",
    });

    const setNames: string[] = [];
    for (const line of response.setCookies ?? []) {
      const cookie = parseSetCookie(line);
      if (!cookie) continue;
      if (cookie.expired) {
        hostJar(url.host).delete(cookie.name);
      } else {
        hostJar(url.host).set(cookie.name, { value: cookie.value, role: step.role });
        setNames.push(cookie.name);
      }
    }

    const extracted: string[] = [];
    for (const rule of step.extract) {
      let value: string | undefined;
      let key: string;
      switch (rule.kind) {
        case "hiddenInput":
          key = rule.as;
          value =
            typeof response.body === "string"
              ? findInputValue(response.body, rule.name)
              : undefined;
          break;
        case "cookie": {
          key = rule.as ?? rule.name;
          const entry = hostJar(url.host).get(rule.name);
          value = entry ? safeDecode(entry.value) : undefined;
          break;
        }
        case "jsonPath":
          key = rule.as;
          value = readJsonPath(response.body, rule.path);
          if (value && rule.emit === "bearer") {
            bearer.push({ token: value, role: step.role });
          }
          break;
        case "header":
          key = rule.as;
          value = response.headers[rule.name.toLowerCase()];
          break;
      }
      if (value !== undefined) {
        vars[key] = value;
        extracted.push(key);
      }
    }

    const location = response.headers.location;
    reports.push({
      label: step.label,
      method: step.request.method,
      url: url.toString(),
      status: response.status,
      ...(location ? { location } : {}),
      cookies: setNames,
      extracted,
    });

    const ok = step.expectStatus
      ? step.expectStatus.includes(response.status)
      : response.status < 400;
    if (!ok) {
      throw new LoginRecipeError(
        `Passo "${step.label}" respondeu ${response.status}`,
        reports,
      );
    }
    if (
      step.failIfLocationIncludes &&
      location?.includes(step.failIfLocationIncludes)
    ) {
      throw new LoginRecipeError(
        `Passo "${step.label}" redirecionou para ${location} — credencial recusada?`,
        reports,
      );
    }
  }

  return {
    steps: reports,
    headersFor(audience, targetUrl = options.baseUrl) {
      const out: Record<string, string> = {};
      const host = new URL(targetUrl, options.baseUrl).host;
      const cookies = [...(jar.get(host)?.entries() ?? [])]
        .filter(([, entry]) => audienceAllows(entry.role, audience))
        .map(([name, entry]) => `${name}=${entry.value}`)
        .join("; ");
      if (cookies) out.Cookie = cookies;
      const token = [...bearer]
        .reverse()
        .find((item) => audienceAllows(item.role, audience));
      if (token) out.Authorization = `Bearer ${token.token}`;
      return out;
    },
  };
}
