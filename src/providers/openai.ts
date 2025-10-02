import { Notice, type RequestUrlResponse, requestUrl } from "obsidian";
import type { ProviderAdapter } from "src/providers/adapter";
import { MODEL_SPECS } from "src/providers/model-info";
import { logError } from "src/utils";

export const openAiRequest: ProviderAdapter = async (settings, oldText) => {
	if (!settings.openAiApiKey) {
		new Notice("Please set your OpenAI API key in the plugin settings.");
		return;
	}

	const endpoint = settings.openAiEndpoint || "https://api.openai.com/v1/responses";

	let response: RequestUrlResponse;
	try {
		// DOCS https://platform.openai.com/docs/api-reference/responses/create
		response = await requestUrl({
			url: endpoint,
			method: "POST",
			contentType: "application/json",
			// biome-ignore lint/style/useNamingConvention: not by me
			headers: { Authorization: "Bearer " + settings.openAiApiKey },
			body: JSON.stringify({
				model: settings.model,
				reasoning: { effort: settings.reasoningEffort },
				input: [
					{ role: "developer", content: settings.staticPrompt },
					{ role: "user", content: oldText },
				],
			}),
		});
		console.debug("[Proofreader plugin] OpenAI response", response);
	} catch (error) {
		if ((error as { status: number }).status === 401) {
			const msg = "OpenAI API key is not valid. Please verify the key in the plugin settings.";
			new Notice(msg, 6_000);
			return;
		}
		logError("OpenAI request failed.", error);
		return;
	}

	// DOCS https://platform.openai.com/docs/api-reference/responses/get
	// biome-ignore format: clearer this way
	const newText = response.json?.output
		?.find((item: { role: string; content: { text: string }[] }) => item.role === "assistant")
		?.content[0].text;
	if (!newText) {
		logError("Invalid structure of OpenAI response.", response);
		return;
	}

	// determine overlength
	// https://platform.openai.com/docs/guides/conversation-state?api-mode=responses#managing-context-for-text-generation
	const outputTokensUsed = response.json?.usage?.completion_tokens || 0;
	const isOverlength = outputTokensUsed >= MODEL_SPECS[settings.model].maxOutputTokens;

	return { newText: newText, isOverlength: isOverlength };
};
