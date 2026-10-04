#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parseOpenApi } from "@sw/api-parser";
import { passesGate, summarizeFindings } from "@sw/findings";
import { HttpExecutor } from "@sw/http-client";
import { TestOrchestrator } from "@sw/security-engine";

function usage() {
  console.log(`security-workbench

Usage:
  security-workbench scan --openapi <file> --base-url <url> [--path <endpoint>]

MVP: imports OpenAPI, generates validation cases, executes against base URL.
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] !== "scan") {
    usage();
    process.exit(args.length === 0 ? 0 : 1);
  }

  const openapiIdx = args.indexOf("--openapi");
  const baseUrlIdx = args.indexOf("--base-url");
  const pathIdx = args.indexOf("--path");

  const openapiPath = openapiIdx >= 0 ? args[openapiIdx + 1] : undefined;
  const baseUrl = baseUrlIdx >= 0 ? args[baseUrlIdx + 1] : undefined;
  const onlyPath = pathIdx >= 0 ? args[pathIdx + 1] : undefined;

  if (!openapiPath || !baseUrl) {
    usage();
    process.exit(1);
  }

  const document = JSON.parse(readFileSync(openapiPath, "utf8"));
  const projectId = randomUUID();
  let endpoints = parseOpenApi(document, projectId);
  if (onlyPath) {
    endpoints = endpoints.filter((e) => e.path === onlyPath);
  }

  if (endpoints.length === 0) {
    console.error("No endpoints found to scan.");
    process.exit(1);
  }

  const orchestrator = new TestOrchestrator();
  const executor = new HttpExecutor({ timeoutMs: 15_000 });
  const allFindings = [];

  for (const endpoint of endpoints) {
    console.log(`→ ${endpoint.method} ${endpoint.path}`);
    const result = await orchestrator.run({
      endpoint,
      baseUrl,
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

  const summary = summarizeFindings(allFindings);
  console.log("\nSummary");
  console.log(JSON.stringify(summary.bySeverity, null, 2));
  console.log(`Total findings: ${summary.total}`);

  if (!passesGate(allFindings)) {
    console.error("\n❌ Build blocked — critical/high findings present");
    process.exit(2);
  }

  console.log("\n✓ Gate passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
