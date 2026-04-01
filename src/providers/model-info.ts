import type { ProviderAdapter, ProviderName } from "src/providers/adapter";
import { googleRequest } from "src/providers/google";
import { mistralRequest } from "src/providers/mistral";
import { openAiRequest } from "src/providers/openai";
import { openRouterRequest } from "src/providers/openrouter";

export const PROVIDER_REQUEST_MAP: Record<ProviderName, ProviderAdapter> = {
	openai: openAiRequest,
	google: googleRequest,
	mistral: mistralRequest,
	openrouter: openRouterRequest,
};

export const MODEL_SPECS = {
	"gpt-5-nano": {
		provider: "openai",
		displayText: "GPT 5 nano",
		maxOutputTokens: 128_000,
		info: {
			costPerMillionTokens: { input: 0.05, output: 0.4 },
			reasoning: 2,
			speed: 5,
			url: "https://platform.openai.com/docs/models/gpt-5-nano",
		},
	},
	"gpt-5-mini": {
		provider: "openai",
		displayText: "GPT 5 mini",
		maxOutputTokens: 128_000,
		info: {
			costPerMillionTokens: { input: 0.25, output: 2.0 },
			reasoning: 3,
			speed: 4,
			url: "https://platform.openai.com/docs/models/gpt-5-nano",
		},
	},
	"gemini-2.5-flash-lite": {
		provider: "google",
		displayText: "Gemini 2.5 Flash Lite",
		maxOutputTokens: 65_536,
		info: {
			costPerMillionTokens: { input: 0.1, output: 0.4 },
			reasoning: 3,
			speed: 5,
			url: "https://ai.google.dev/gemini-api/docs/models#gemini-2.5-flash-lite",
		},
	},
	"gemini-2.5-flash": {
		provider: "google",
		displayText: "Gemini 2.5 Flash",
		maxOutputTokens: 65_536,
		info: {
			costPerMillionTokens: { input: 0.3, output: 2.5 },
			reasoning: 4,
			speed: 4,
			url: "https://ai.google.dev/gemini-api/docs/models#gemini-2.5-flash",
		},
	},
	"mistral-small-latest": {
		provider: "mistral",
		displayText: "Mistral Small",
		maxOutputTokens: 32_768,
		info: {
			costPerMillionTokens: { input: 0.1, output: 0.3 },
			reasoning: 2,
			speed: 5,
			url: "https://docs.mistral.ai/getting-started/models/models_overview/#premier-models",
		},
	},
	openrouter: {
		provider: "openrouter",
		displayText: "OpenRouter (custom model)",
		maxOutputTokens: Number.MAX_SAFE_INTEGER,
		info: {
			costPerMillionTokens: { input: 0, output: 0 },
			reasoning: 0,
			speed: 0,
			url: "https://openrouter.ai/models",
		},
	},
} as const; // `as const` needed for type inference
