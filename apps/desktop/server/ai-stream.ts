export interface StreamChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Repassa o stream do provedor (OpenAI-compatible). */
export async function streamChatCompletion(
  config: { baseUrl: string; model: string; apiKey?: string },
  messages: StreamChatMessage[],
  onDelta: (text: string) => void,
  onStatus?: (text: string) => void,
): Promise<string> {
  const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.2,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`AI provider error: HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let thinking = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const payload = line.startsWith("data:") ? line.slice(5).trim() : "";
      if (!payload || payload === "[DONE]") continue;
      let parsed: {
        choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }>;
      };
      try {
        parsed = JSON.parse(payload) as typeof parsed;
      } catch {
        continue;
      }
      const delta = parsed.choices?.[0]?.delta;
      if (delta?.reasoning_content && !thinking) {
        thinking = true;
        onStatus?.("Raciocinando…");
      }
      const piece = delta?.content ?? "";
      if (!piece) continue;
      thinking = false;
      full += piece;
      onDelta(piece);
    }
  }

  return full;
}
