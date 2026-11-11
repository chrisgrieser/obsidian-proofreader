import { Notice, type RequestUrlResponse, requestUrl } from "obsidian";
import type { ProviderAdapter } from "src/providers/adapter";
import { MODEL_SPECS } from "src/providers/model-info";
import { logError } from "src/utils";

export const mistralRequest: ProviderAdapter = async (settings, oldText) => {
	if (!settings.mistralApiKey) {
		new Notice("Please set your Mistral API key in the plugin settings.");
		return;
	}

	let response: RequestUrlResponse;
	try {
		// DOCS https://docs.mistral.ai/api/#tag/chat/operation/chat_completion_v1_chat_completions_post
		response = await requestUrl({
			url: "https://api.mistral.ai/v1/chat/completions",
			method: "POST",
			contentType: "application/json",
			// biome-ignore lint/style/useNamingConvention: not by me
			headers: { Authorization: "Bearer " + settings.mistralApiKey },
			body: JSON.stringify({
				model: settings.model,
				messages: [
					{ role: "system", content: settings.staticPrompt },
					{ role: "user", content: oldText },
				],
			}),
		});
		console.debug("[Proofreader plugin] Mistral response", response);
	} catch (error) {
		const status = (error as { status: number }).status;
		if (status === 401) {
			new Notice(
				"Mistral API key is not valid. Please verify the key in the plugin settings.",
				6_000,
			);
			return;
		}
		if (status === 429) {
			new Notice(
				"Mistral API rate limit reached. Please wait a moment before trying again.",
				6_000,
			);
			return;
		}
		logError("Mistral request failed.", error);
		return;
	}

	// DOCS https://docs.mistral.ai/api/#tag/chat/operation/chat_completion_v1_chat_completions_post
	const newText = response.json?.choices?.[0]?.message?.content;
	if (!newText) {
		logError("Invalid structure of Mistral response.", response);
		return;
	}

	const outputTokensUsed = response.json?.usage?.completion_tokens || 0;
	const isOverlength = outputTokensUsed >= MODEL_SPECS[settings.model].maxOutputTokens;

	return { newText: newText, isOverlength: isOverlength };
};
