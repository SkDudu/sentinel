import type { Finding } from "@sw/core";

const TEST_LABEL_PT: Record<string, string> = {
  "http.methods": "Métodos HTTP",
  "http.cors": "CORS",
  "http.security-headers": "Headers de segurança",
  "rate-limit.burst": "Rate limit (burst)",
  "authentication.missing-auth": "Auth ausente",
  "authentication.invalid-token": "Token inválido",
  "authentication.expired-token": "Token expirado",
  "authorization.idor": "IDOR / autorização",
  "validation.missing-required": "Campo obrigatório ausente",
  "validation.null-empty": "Null / vazio",
  "validation.wrong-type": "Tipo inválido",
  generic: "Genérico",
};

const SEVERITY_PT: Record<string, string> = {
  CRITICAL: "Crítica",
  HIGH: "Alta",
  MEDIUM: "Média",
  LOW: "Baixa",
  INFO: "Info",
};

export function severityLabelPt(severity: string): string {
  return SEVERITY_PT[severity] ?? severity;
}

export function testLabelPt(testId: string): string {
  return TEST_LABEL_PT[testId] ?? testId;
}

function translateTitle(title: string, testId: string): string {
  if (/^Request failed: Method TRACE$/i.test(title)) {
    return "Método TRACE rejeitado / não suportado";
  }
  if (/^Request failed: Method /i.test(title)) {
    return title.replace(/^Request failed: Method /i, "Falha na request: método ");
  }
  if (/^Request failed:/i.test(title)) {
    return title.replace(/^Request failed:/i, "Falha na request:");
  }
  if (/^No rate limit detected after (\d+) requests$/i.test(title)) {
    return title.replace(
      /^No rate limit detected after (\d+) requests$/i,
      "Sem rate limit após $1 requests",
    );
  }
  if (/^Endpoint accessible without authentication$/i.test(title)) {
    return "Endpoint acessível sem autenticação";
  }
  if (/^Endpoint accepted an invalid authentication token$/i.test(title)) {
    return "Endpoint aceitou token de autenticação inválido";
  }
  if (/^Endpoint accepted an expired token$/i.test(title)) {
    return "Endpoint aceitou token expirado";
  }
  if (/^TRACE method enabled$/i.test(title)) {
    return "Método TRACE habilitado";
  }
  if (/^Unexpected method (.+) accepted$/i.test(title)) {
    return title.replace(
      /^Unexpected method (.+) accepted$/i,
      "Método inesperado $1 aceito",
    );
  }
  if (/^Missing security headers$/i.test(title)) {
    return "Headers de segurança ausentes";
  }
  if (/^Possible IDOR on /i.test(title)) {
    return title.replace(/^Possible IDOR on /i, "Possível IDOR em ");
  }
  if (/^Possible privilege escalation via /i.test(title)) {
    return title.replace(
      /^Possible privilege escalation via /i,
      "Possível escalada de privilégio via ",
    );
  }
  if (/^Required field accepted when missing:/i.test(title)) {
    return title.replace(
      /^Required field accepted when missing:/i,
      "Campo obrigatório aceito mesmo ausente:",
    );
  }
  if (/^Server error on null\/empty input:/i.test(title)) {
    return title.replace(
      /^Server error on null\/empty input:/i,
      "Erro de servidor com input null/vazio:",
    );
  }
  if (/^Type confusion accepted:/i.test(title)) {
    return title.replace(/^Type confusion accepted:/i, "Confusão de tipo aceita:");
  }
  if (/^Server error on AI\/extra case:/i.test(title)) {
    return title.replace(
      /^Server error on AI\/extra case:/i,
      "Erro de servidor no caso AI/extra:",
    );
  }
  if (/^Unexpected status for /i.test(title)) {
    return title.replace(/^Unexpected status for /i, "Status inesperado para ");
  }

  // Fallback by test id when title is unknown English
  if (testId === "rate-limit.burst" && /rate limit/i.test(title)) {
    return "Rate limit não detectado";
  }
  return title;
}

function summarizeStatuses(raw: string): string {
  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return raw;
  const counts = new Map<string, number>();
  for (const status of parts) {
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([status, count]) => (count > 1 ? `${status}×${count}` : status))
    .join(", ");
}

function translateEvidence(evidence: string): string {
  const burst = evidence.match(
    /^Sent (\d+) requests \(concurrency (\d+)\); statuses=(.+)\. Expected (\d+)\. Last=(\d+)\.$/i,
  );
  if (burst) {
    const [, requests, concurrency, statuses, expected, last] = burst;
    return `Enviou ${requests} requests (concorrência ${concurrency}); status=${summarizeStatuses(statuses ?? "")}. Esperava ${expected}. Último=${last}.`;
  }

  return evidence
    .replace(
      /^Expected 401\/403 for broken auth, got HTTP (\d+)\.$/i,
      "Esperava 401/403 sem auth válida; API respondeu HTTP $1.",
    )
    .replace(
      /^'TRACE' HTTP method is unsupported\.$/i,
      "Método HTTP TRACE não é suportado pela API.",
    )
    .replace(
      /^TRACE returned HTTP (\d+)\.$/i,
      "TRACE retornou HTTP $1.",
    )
    .replace(/^Missing: /i, "Ausentes: ")
    .replace(
      /^Expected 4xx when omitting required field, got HTTP (\d+)\.$/i,
      "Esperava 4xx ao omitir campo obrigatório; recebeu HTTP $1.",
    )
    .replace(
      /^Expected validation failure, got HTTP (\d+)\.$/i,
      "Esperava falha de validação; recebeu HTTP $1.",
    )
    .replace(/^HTTP (\d+) for /i, "HTTP $1 para ");
}

function translateRecommendation(recommendation: string | undefined): string | undefined {
  if (!recommendation) return undefined;
  const map: Record<string, string> = {
    "Disable TRACE on API gateways and app servers.":
      "Desabilite TRACE em gateways e servidores da API.",
    "Return 405 Method Not Allowed for undeclared verbs.":
      "Retorne 405 Method Not Allowed para verbos não declarados.",
    "Apply per-IP/per-token rate limiting and return 429 with Retry-After.":
      "Aplique rate limit por IP/token e retorne 429 com Retry-After.",
    "Require valid credentials and return 401/403 when Authorization is absent.":
      "Exija credenciais válidas e retorne 401/403 quando Authorization estiver ausente.",
    "Reject malformed or unknown tokens with 401.":
      "Rejeite tokens malformados ou desconhecidos com 401.",
    "Validate and reject null/empty inputs before processing.":
      "Valide e rejeite inputs null/vazios antes de processar.",
    "Enforce schema types and reject mismatched payloads.":
      "Enforce tipos do schema e rejeite payloads incompatíveis.",
    "Verifique se a API alvo está no ar e se baseUrl/auth estão corretos.":
      "Verifique se a API alvo está no ar e se baseUrl/auth estão corretos.",
  };
  if (map[recommendation]) return map[recommendation];

  return recommendation
    .replace(
      /^Reject expired tokens with 401\.$/i,
      "Rejeite tokens expirados com 401.",
    )
    .replace(
      /^Confirm object ownership checks\.$/i,
      "Confirme checagens de ownership do objeto.",
    );
}

export function findingDisplayPt(finding: Finding): {
  title: string;
  evidence: string;
  recommendation?: string;
  testLabel: string;
  severityLabel: string;
} {
  return {
    title: translateTitle(finding.title, finding.testId),
    evidence: translateEvidence(finding.evidence),
    recommendation: translateRecommendation(finding.recommendation),
    testLabel: testLabelPt(finding.testId),
    severityLabel: severityLabelPt(finding.severity),
  };
}
