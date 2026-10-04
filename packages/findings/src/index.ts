import type { Finding, Severity } from "@sw/core";
import { Severity as SeverityEnum } from "@sw/core";

const RANK: Record<Severity, number> = {
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  INFO: 1,
};

export function summarizeFindings(findings: Finding[]) {
  const bySeverity = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    INFO: 0,
  } satisfies Record<Severity, number>;

  for (const finding of findings) {
    bySeverity[finding.severity] += 1;
  }

  return {
    total: findings.length,
    bySeverity,
    blocksCi:
      bySeverity.CRITICAL > 0 || bySeverity.HIGH > 0,
  };
}

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const severityDiff = RANK[b.severity] - RANK[a.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.confidence - a.confidence;
  });
}

export function passesGate(
  findings: Finding[],
  options: { maxCritical?: number; maxHigh?: number } = {},
) {
  const summary = summarizeFindings(findings);
  const maxCritical = options.maxCritical ?? 0;
  const maxHigh = options.maxHigh ?? 0;
  return (
    summary.bySeverity[SeverityEnum.CRITICAL] <= maxCritical &&
    summary.bySeverity[SeverityEnum.HIGH] <= maxHigh
  );
}
