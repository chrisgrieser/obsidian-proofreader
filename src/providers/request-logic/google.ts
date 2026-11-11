import { Notice, type RequestUrlResponse, requestUrl } from "obsidian";
import type { ProviderAdapter } from "src/providers/adapter";
import { MODEL_SPECS } from "src/providers/model-info";
import { logError } from "src/utils";

export const googleRequest: ProviderAdapter = async (settings, oldText) => {
	if (!settings.googleApiKey) {
		new Notice("Please set your Google API key in the plugin settings.");
		return;
	}

	const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${settings.googleApiKey}`;

	let response: RequestUrlResponse;
	try {
		// DOCS https://ai.google.dev/api/generate-content
		response = await requestUrl({
			url: endpoint,
			method: "POST",
			contentType: "application/json",
			body: JSON.stringify({
				// biome-ignore lint/style/useNamingConvention: API field name
				system_instruction: { parts: [{ text: settings.staticPrompt }] },
				contents: [{ role: "user", parts: [{ text: oldText }] }],
			}),
		});
		console.debug("[Proofreader plugin] Google response", response);
	} catch (error) {
		const status = (error as { status: number }).status;
		if (status === 403) {
			new Notice(
				"Google API key is not valid. Please verify the key in the plugin settings.",
				6_000,
			);
			return;
		}
		if (status === 429) {
			new Notice(
				"Google API rate limit reached. Please wait a moment before trying again.",
				6_000,
			);
			return;
		}
		logError("Google request failed.", error);
		return;
	}

	// DOCS https://ai.google.dev/api/generate-content#v1beta.GenerateContentResponse
	const newText = response.json?.candidates?.[0]?.content?.parts?.[0]?.text;
	if (!newText) {
		logError("Invalid structure of Google response.", response);
		return;
	}

	const outputTokensUsed = response.json?.usageMetadata?.candidatesTokenCount || 0;
	const isOverlength = outputTokensUsed >= MODEL_SPECS[settings.model].maxOutputTokens;

	return { newText: newText, isOverlength: isOverlength };
};
