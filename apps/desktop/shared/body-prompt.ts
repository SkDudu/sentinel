export function bodyChatPrompt(input: {
  method: string;
  path: string;
  summary?: string;
  requestBodySchema?: unknown;
}): string {
  const schema =
    input.requestBodySchema === undefined
      ? "O contrato não descreve o body."
      : JSON.stringify(input.requestBodySchema).slice(0, 8_000);
  return [
    "Gere o JSON body de um request de teste autorizado.",
    `${input.method} ${input.path}`,
    input.summary ? `Resumo: ${input.summary}` : "",
    `Schema: ${schema}`,
    "Textos únicos usam {{prefix}}. IDs usam {{fixtures.<chave>}}.",
    "Sem credenciais, SQL, scripts ou payloads de ataque.",
    "Responda só o objeto JSON, sem markdown.",
  ]
    .filter(Boolean)
    .join("\n");
}
