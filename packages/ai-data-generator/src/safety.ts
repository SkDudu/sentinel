import type { TestCase } from "@sw/core";

const BLOCKED_PATTERNS: RegExp[] = [
  /DROP\s+TABLE/i,
  /DELETE\s+FROM\s+\w+/i,
  /TRUNCATE\s+TABLE/i,
  /ALTER\s+TABLE/i,
  /;\s*--/,
  /xp_cmdshell/i,
  /INTO\s+OUTFILE/i,
  /LOAD_FILE\s*\(/i,
  /\$\(.*\)/,
  /`[^`]+`/,
  /\brm\s+-rf\b/i,
  /\bcurl\s+.*\|\s*sh\b/i,
  /\bwget\s+.*\|\s*sh\b/i,
  /<script[\s>]/i,
  /javascript:/i,
];

const MAX_SERIALIZED = 20_000;
const MAX_STRING_FIELD = 4_000;
const MAX_ARRAY_LEN = 50;
const MAX_DEPTH = 6;

function depthOf(value: unknown, depth = 0): number {
  if (depth > MAX_DEPTH) return depth;
  if (Array.isArray(value)) {
    return Math.max(depth, ...value.map((item) => depthOf(item, depth + 1)), depth);
  }
  if (value && typeof value === "object") {
    return Math.max(
      depth,
      ...Object.values(value as Record<string, unknown>).map((item) =>
        depthOf(item, depth + 1),
      ),
      depth,
    );
  }
  return depth;
}

function oversizedValues(value: unknown): boolean {
  if (typeof value === "string" && value.length > MAX_STRING_FIELD) return true;
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LEN) return true;
    return value.some(oversizedValues);
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(oversizedValues);
  }
  return false;
}

export interface SafetyResult {
  accepted: TestCase[];
  rejected: Array<{ id: string; name: string; reason: string }>;
}

export function applySafetyFilter(cases: TestCase[]): SafetyResult {
  const accepted: TestCase[] = [];
  const rejected: Array<{ id: string; name: string; reason: string }> = [];

  for (const testCase of cases) {
    const serialized = JSON.stringify(testCase.mutations ?? {});

    if (serialized.length > MAX_SERIALIZED) {
      rejected.push({
        id: testCase.id,
        name: testCase.name,
        reason: "payload too large",
      });
      continue;
    }

    if (depthOf(testCase.mutations) > MAX_DEPTH) {
      rejected.push({
        id: testCase.id,
        name: testCase.name,
        reason: "mutation nesting too deep",
      });
      continue;
    }

    if (oversizedValues(testCase.mutations)) {
      rejected.push({
        id: testCase.id,
        name: testCase.name,
        reason: "field value exceeds size limits",
      });
      continue;
    }

    const hit = BLOCKED_PATTERNS.find((pattern) => pattern.test(serialized));
    if (hit) {
      rejected.push({
        id: testCase.id,
        name: testCase.name,
        reason: `blocked pattern: ${hit.source}`,
      });
      continue;
    }

    if (
      testCase.tags.some((tag) =>
        /destructive|rce|exfil|bomb/i.test(tag),
      )
    ) {
      rejected.push({
        id: testCase.id,
        name: testCase.name,
        reason: "dangerous tag",
      });
      continue;
    }

    accepted.push(testCase);
  }

  return { accepted, rejected };
}
