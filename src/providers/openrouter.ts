import { Notice, type RequestUrlResponse, requestUrl } from "obsidian";
import type { ProviderAdapter } from "src/providers/adapter";
import { logError } from "src/utils";

export const openRouterRequest: ProviderAdapter = async (settings, oldText) => {
	if (!settings.openRouterApiKey) {
		new Notice("Please set your OpenRouter API key in the plugin settings.");
		return;
	}
	if (!settings.openRouterModel) {
		new Notice("Please set an OpenRouter model name in the plugin settings.");
		return;
	}

	let response: RequestUrlResponse;
	try {
		// DOCS https://openrouter.ai/docs/api-reference/chat-completion
		response = await requestUrl({
			url: "https://openrouter.ai/api/v1/chat/completions",
			method: "POST",
			contentType: "application/json",
			// biome-ignore lint/style/useNamingConvention: not by me
			headers: { Authorization: "Bearer " + settings.openRouterApiKey },
			body: JSON.stringify({
				model: settings.openRouterModel,
				messages: [
					{ role: "system", content: settings.staticPrompt },
					{ role: "user", content: oldText },
				],
			}),
		});
		console.debug("[Proofreader plugin] OpenRouter response", response);
	} catch (error) {
		const status = (error as { status: number }).status;
		if (status === 401) {
			new Notice(
				"OpenRouter API key is not valid. Please verify the key in the plugin settings.",
				6_000,
			);
			return;
		}
		if (status === 429) {
			new Notice(
				"OpenRouter API rate limit reached. Please wait a moment before trying again.",
				6_000,
			);
			return;
		}
		logError("OpenRouter request failed.", error);
		return;
	}

	// DOCS https://openrouter.ai/docs/api-reference/chat-completion
	const newText = response.json?.choices?.[0]?.message?.content;
	if (!newText) {
		logError("Invalid structure of OpenRouter response.", response);
		return;
	}

	return { newText: newText, isOverlength: false };
};
