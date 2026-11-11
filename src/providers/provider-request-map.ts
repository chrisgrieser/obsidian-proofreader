import type { ProviderAdapter, ProviderName } from "src/providers/adapter";
import { googleRequest } from "src/providers/request-logic/google";
import { mistralRequest } from "src/providers/request-logic/mistral";
import { ollamaRequest } from "src/providers/request-logic/ollama";
import { openAiRequest } from "src/providers/request-logic/openai";
import { openRouterRequest } from "src/providers/request-logic/openrouter";

export const PROVIDER_REQUEST_MAP: Record<ProviderName, ProviderAdapter> = {
	openai: openAiRequest,
	google: googleRequest,
	mistral: mistralRequest,
	openrouter: openRouterRequest,
	ollama: ollamaRequest,
};
