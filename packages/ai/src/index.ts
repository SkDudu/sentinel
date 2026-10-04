import type { AiProviderConfig, Finding } from "@sw/core";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiClient {
  readonly config: AiProviderConfig;
  complete(messages: ChatMessage[]): Promise<string>;
}

export class OpenAiCompatibleClient implements AiClient {
  constructor(public readonly config: AiProviderConfig) {}

  async complete(messages: ChatMessage[]): Promise<string> {
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.config.apiKeyRef
          ? { Authorization: `Bearer ${this.config.apiKeyRef}` }
          : {}),
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI provider error: HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return data.choices?.[0]?.message?.content ?? "";
  }
}

/** Post-scan analysis only — never executes scanners. */
export async function interpretFindings(
  client: AiClient,
  findings: Finding[],
): Promise<string> {
  if (findings.length === 0) {
    return "Nenhum finding para interpretar.";
  }

  const payload = findings.map((f) => ({
    title: f.title,
    severity: f.severity,
    confidence: f.confidence,
    evidence: f.evidence,
  }));

  return client.complete([
    {
      role: "system",
      content:
        "You are a security analyst. Correlate findings, explain likely root causes, and recommend fixes. Respond in Portuguese.",
    },
    {
      role: "user",
      content: JSON.stringify(payload, null, 2),
    },
  ]);
}
