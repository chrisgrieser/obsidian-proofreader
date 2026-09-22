import { Notice, type RequestUrlResponse, requestUrl } from "obsidian";
import type { ProviderAdapter } from "src/providers/adapter";
import { logError } from "src/utils";

export const ollamaRequest: ProviderAdapter = async (settings, oldText) => {
	if (!settings.ollamaModel) {
		new Notice("Please set an Ollama model name in the plugin settings.");
		return;
	}

	const baseUrl = (settings.ollamaEndpoint || "http://localhost:11434").replace(/\/+$/, "");

	let response: RequestUrlResponse;
	try {
		// DOCS https://docs.ollama.com/api/openai-compatibility
		response = await requestUrl({
			url: `${baseUrl}/v1/chat/completions`,
			method: "POST",
			contentType: "application/json",
			body: JSON.stringify({
				model: settings.ollamaModel,
				// biome-ignore lint/style/useNamingConvention: API field name
				reasoning_effort: settings.ollamaReasoningEffort,
				messages: [
					{ role: "system", content: settings.staticPrompt },
					{ role: "user", content: oldText },
				],
			}),
		});
		console.debug("[Proofreader plugin] Ollama response", response);
	} catch (error) {
		const status = (error as { status: number }).status;
		if (status === 404) {
			new Notice(
				"Ollama model not found. Please verify that the model is pulled and the name in the plugin settings is correct.",
				6_000,
			);
			return;
		}
		logError("Ollama request failed. Is the Ollama server running?", error);
		return;
	}

	// DOCS https://docs.ollama.com/api/openai-compatibility
	const newText = response.json?.choices?.[0]?.message?.content;
	if (!newText) {
		logError("Invalid structure of Ollama response.", response);
		return;
	}

	const isOverlength = response.json?.choices?.[0]?.finish_reason === "length";

	return { newText: newText, isOverlength: isOverlength };
};
