import type { ProviderAdapter, ProviderName } from "src/providers/adapter";
import { googleRequest } from "src/providers/google";
import { openAiRequest } from "src/providers/openai";

export const PROVIDER_REQUEST_MAP: Record<ProviderName, ProviderAdapter> = {
	openai: openAiRequest,
	google: googleRequest,
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
} as const; // `as const` needed for type inference
