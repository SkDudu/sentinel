import { OpenAiCompatibleClient, type AiClient } from "@sw/ai";
import type { AiProviderConfig } from "@sw/core";
import type { AiSettingsFile } from "./ai-settings.js";

export function createAiClientFromSettings(
  settings: AiSettingsFile,
): AiClient | null {
  if (!settings.saved || !settings.enabled) return null;

  const config: AiProviderConfig = {
    kind: settings.kind,
    baseUrl: settings.baseUrl,
    model: settings.model,
    apiKeyRef: settings.apiKey,
  };

  return new OpenAiCompatibleClient(config);
}
