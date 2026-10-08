#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { parseOpenApi, parseSpecText } from "@sw/api-parser";
import { createSecretStore } from "@sw/auth";
import {
  createSqliteDb,
  EndpointRepository,
  EnvironmentRepository,
  FindingRepository,
  ProjectRepository,
  TestResultRepository,
  TestRunRepository,
} from "@sw/database";
import {
  passesGate,
  summarizeFindings,
  toJsonReport,
  toSarifReport,
} from "@sw/findings";
import { HttpExecutor, ZapExecutor } from "@sw/http-client";
import { runProjectScan } from "@sw/scan-runner";
import { TestOrchestrator } from "@sw/security-engine";
import {
  createDefaultRegistry,
  registerPluginsFromDirectory,
} from "@sw/test-registry";

type OutputFormat = "text" | "json" | "sarif";

function usage() {
  console.log(`sentinel — local API security workbench CLI

Usage:
  sentinel scan --openapi <file> --base-url <url> [options]
  sentinel scan --project <id> --environment <id> [options]

Options:
  --db <path>              SQLite path (default: ./data/sentinel.db)
  --path <endpoint>        Filter OpenAPI path
  --token <bearer>         Ephemeral bearer override
  --plugins <dir>          Load custom SecurityTest plugins (.js/.mjs)
  --executor <http|zap>    Request executor (default: http)
  --zap-url <url>          ZAP API base (required for --executor zap)
  --zap-key <key>          ZAP API key
  --format <text|json|sarif>
  --output <file>          Write report to file
  --fail-on < severities > Comma list (default: critical,high)
  --max-critical <n>       Gate threshold (default: 0)
  --max-high <n>           Gate threshold (default: 0)

Notes:
  --project mode shares the desktop DB when run from the repo root
  (or pass an absolute --db path to <repo>/data/sentinel.db).
  --openapi mode is ephemeral and does NOT write findings to SQLite.

Exit codes:
  0  gate passed
  1  usage / runtime error
  2  gate failed (findings above threshold)
`);
}

function flag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : undefined;
}

function hasFlag(args: string[], name: string) {
  return args.includes(name);
}

function parseFailOn(raw: string | undefined) {
  const parts = (raw ?? "critical,high")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return {
    failCritical: parts.includes("CRITICAL"),
    failHigh: parts.includes("HIGH"),
  };
}

async function runOpenApiScan(args: string[]) {
  const openapiPath = flag(args, "--openapi");
  const baseUrl = flag(args, "--base-url");
  const onlyPath = flag(args, "--path");
  const token = flag(args, "--token");
  const pluginsDir = flag(args, "--plugins");

  if (!openapiPath || !baseUrl) {
    usage();
    process.exit(1);
  }

  const document = parseSpecText(readFileSync(resolve(openapiPath), "utf8"));
  const projectId = randomUUID();
  let endpoints = parseOpenApi(document, projectId);
  if (onlyPath) endpoints = endpoints.filter((e) => e.path === onlyPath);
  if (endpoints.length === 0) {
    console.error("No endpoints found to scan.");
    process.exit(1);
  }

  const registry = createDefaultRegistry();
  if (pluginsDir) {
    const count = await registerPluginsFromDirectory(registry, pluginsDir);
    console.log(`Loaded ${count} custom plugin(s) from ${pluginsDir}`);
  }

  const executor = createExecutor(args);
  const orchestrator = new TestOrchestrator(registry);
  const allFindings = [];

  for (const endpoint of endpoints) {
    console.log(`→ ${endpoint.method} ${endpoint.path}`);
    const result = await orchestrator.run({
      endpoint,
      baseUrl,
      authHeaders: token ? { Authorization: `Bearer ${token}` } : {},
      executor,
      options: {
        normal: true,
        validationErrors: true,
        edgeCases: true,
        typeConfusion: true,
        boundaryValues: false,
        businessLogic: false,
        aiGenerated: false,
      },
      onProgress: ({ completed, total }) => {
        process.stdout.write(`\r  cases ${completed}/${total}`);
      },
    });
    process.stdout.write("\n");
    allFindings.push(...result.findings);
  }

  return allFindings;
}

async function runProjectMode(args: string[]) {
  const projectId = flag(args, "--project");
  const environmentId = flag(args, "--environment");
  const dbPath = resolve(flag(args, "--db") ?? "./data/sentinel.db");
  const token = flag(args, "--token");
  const pluginsDir = flag(args, "--plugins");

  if (!projectId || !environmentId) {
    usage();
    process.exit(1);
  }

  mkdirSync(dirname(dbPath), { recursive: true });
  console.log(`Using DB: ${dbPath}`);
  const handle = createSqliteDb(dbPath);
  const dataDir = dirname(dbPath);
  const { store } = createSecretStore({ dataDir, kind: "file" });

  const registry = createDefaultRegistry();
  if (pluginsDir) {
    const count = await registerPluginsFromDirectory(registry, pluginsDir);
    console.log(`Loaded ${count} custom plugin(s) from ${pluginsDir}`);
  }

  try {
    const result = await runProjectScan(
      {
        projectId,
        environmentId,
        bearerToken: token,
        executor: createExecutor(args),
        registry,
      },
      {
        projects: new ProjectRepository(handle.db),
        environments: new EnvironmentRepository(handle.db),
        endpoints: new EndpointRepository(handle.db),
        findings: new FindingRepository(handle.db),
        runs: new TestRunRepository(handle.db),
        testResults: new TestResultRepository(handle.db),
      },
      store,
    );
    console.log(
      `Scanned ${result.endpointsScanned} endpoint(s), ${result.totalCases} case(s)`,
    );
    return result.findings;
  } finally {
    handle.close();
  }
}

function createExecutor(args: string[]) {
  const kind = (flag(args, "--executor") ?? "http").toLowerCase();
  if (kind === "zap") {
    const zapUrl = flag(args, "--zap-url");
    if (!zapUrl) {
      console.error("--zap-url is required when --executor zap");
      process.exit(1);
    }
    return new ZapExecutor({
      apiBaseUrl: zapUrl,
      apiKey: flag(args, "--zap-key"),
      timeoutMs: 30_000,
    });
  }
  return new HttpExecutor({ timeoutMs: 15_000 });
}

function emitReport(
  findings: Awaited<ReturnType<typeof runOpenApiScan>>,
  format: OutputFormat,
  outputPath?: string,
) {
  if (format === "text") {
    const summary = summarizeFindings(findings);
    console.log("\nSummary");
    console.log(JSON.stringify(summary.bySeverity, null, 2));
    console.log(`Total findings: ${summary.total}`);
    if (outputPath) {
      writeFileSync(
        outputPath,
        JSON.stringify(toJsonReport(findings), null, 2),
        "utf8",
      );
      console.log(`Wrote ${outputPath}`);
    }
    return;
  }

  const body =
    format === "sarif"
      ? JSON.stringify(toSarifReport(findings), null, 2)
      : JSON.stringify(toJsonReport(findings), null, 2);

  if (outputPath) {
    writeFileSync(outputPath, body, "utf8");
    console.log(`Wrote ${outputPath}`);
  } else {
    console.log(body);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (
    args.length === 0 ||
    hasFlag(args, "--help") ||
    hasFlag(args, "-h") ||
    args[0] === "help"
  ) {
    usage();
    process.exit(0);
  }
  if (args[0] !== "scan") {
    usage();
    process.exit(1);
  }

  const format = (flag(args, "--format") ?? "text").toLowerCase() as OutputFormat;
  if (!["text", "json", "sarif"].includes(format)) {
    console.error("Invalid --format (use text|json|sarif)");
    process.exit(1);
  }

  const findings = flag(args, "--project")
    ? await runProjectMode(args)
    : await runOpenApiScan(args);

  emitReport(findings, format, flag(args, "--output"));

  const { failCritical, failHigh } = parseFailOn(flag(args, "--fail-on"));
  const maxCritical = failCritical
    ? Number(flag(args, "--max-critical") ?? "0")
    : Number.POSITIVE_INFINITY;
  const maxHigh = failHigh
    ? Number(flag(args, "--max-high") ?? "0")
    : Number.POSITIVE_INFINITY;

  if (
    !passesGate(findings, {
      maxCritical: Number.isFinite(maxCritical) ? maxCritical : 999_999,
      maxHigh: Number.isFinite(maxHigh) ? maxHigh : 999_999,
    })
  ) {
    console.error("\nGate failed — findings above threshold (exit 2)");
    process.exit(2);
  }

  if (format === "text") console.log("\nGate passed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
