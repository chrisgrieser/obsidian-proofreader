import type { ProviderAdapter, ProviderName } from "src/providers/adapter";
import { openAiRequest } from "src/providers/openai";

export const PROVIDER_REQUEST_MAP: Record<ProviderName, ProviderAdapter> = {
	openai: openAiRequest,
};

export const MODEL_SPECS = {
	"gpt-4.1-nano": {
		provider: "openai",
		displayText: "GPT 4.1 nano (recommended)",
		maxOutputTokens: 32_768,
		// `info` key is not actively used, just informational
		info: {
			costPerMillionTokens: { input: 0.1, output: 0.4 },
			intelligence: 2,
			speed: 5,
			url: "https://platform.openai.com/docs/models/gpt-4.1-nano",
		},
	},
	"gpt-4.1-mini": {
		provider: "openai",
		displayText: "GPT 4.1 mini",
		maxOutputTokens: 32_768,
		info: {
			costPerMillionTokens: { input: 0.4, output: 1.6 },
			intelligence: 3,
			speed: 4,
			url: "https://platform.openai.com/docs/models/gpt-4.1-mini",
		},
	},
	"gpt-4.1": {
		provider: "openai",
		displayText: "GPT 4.1 (for tasks beyond proofreading)",
		maxOutputTokens: 32_768,
		info: {
			costPerMillionTokens: { input: 2.0, output: 8.0 },
			intelligence: 4,
			speed: 3,
			url: "https://platform.openai.com/docs/models/gpt-4.1",
		},
	},
} as const; // `as const` needed for type inference
