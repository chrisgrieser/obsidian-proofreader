import type { MODEL_SPECS } from "src/providers/model-info.ts";
import type { ProofreaderSettings } from "src/settings.ts";

type ProviderResponse = {
	newText: string; // output text from LLM
	isOverlength: boolean; // whether output hit token limit, i.e., output is truncated
};

export type ProviderAdapter = (
	settings: ProofreaderSettings,
	oldText: string,
) => Promise<ProviderResponse | undefined>;

export type ModelName = keyof typeof MODEL_SPECS;
export type ProviderName = (typeof MODEL_SPECS)[ModelName]["provider"];
