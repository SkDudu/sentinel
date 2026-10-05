import type { Finding } from "@sw/core";
import { summarizeFindings } from "./summary.js";

const SEVERITY_TO_SARIF: Record<string, string> = {
  CRITICAL: "error",
  HIGH: "error",
  MEDIUM: "warning",
  LOW: "note",
  INFO: "note",
};

const SEVERITY_TO_LEVEL_SCORE: Record<string, number> = {
  CRITICAL: 1.0,
  HIGH: 0.9,
  MEDIUM: 0.6,
  LOW: 0.3,
  INFO: 0.1,
};

export function toSarifReport(
  findings: Finding[],
  options: { toolName?: string; version?: string } = {},
) {
  const toolName = options.toolName ?? "Sentinel";
  const version = options.version ?? "0.1.0";

  const rules = new Map<string, { id: string; name: string; level: string }>();
  for (const finding of findings) {
    if (!rules.has(finding.testId)) {
      rules.set(finding.testId, {
        id: finding.testId,
        name: finding.title,
        level: SEVERITY_TO_SARIF[finding.severity] ?? "warning",
      });
    }
  }

  return {
    $schema:
      "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: toolName,
            version,
            informationUri: "https://github.com/SkDudu/sentinel",
            rules: [...rules.values()].map((rule) => ({
              id: rule.id,
              name: rule.name,
              shortDescription: { text: rule.name },
              defaultConfiguration: { level: rule.level },
            })),
          },
        },
        results: findings.map((finding) => ({
          ruleId: finding.testId,
          level: SEVERITY_TO_SARIF[finding.severity] ?? "warning",
          message: { text: finding.title },
          properties: {
            severity: finding.severity,
            confidence: finding.confidence,
            evidence: finding.evidence,
            recommendation: finding.recommendation,
            securitySeverity: SEVERITY_TO_LEVEL_SCORE[finding.severity] ?? 0.5,
          },
          locations: finding.request
            ? [
                {
                  physicalLocation: {
                    artifactLocation: { uri: finding.request.url },
                  },
                },
              ]
            : [],
        })),
      },
    ],
  };
}

export function toJsonReport(findings: Finding[]) {
  return {
    tool: "sentinel",
    version: "0.1.0",
    summary: summarizeFindings(findings),
    findings,
  };
}
