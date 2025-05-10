import { Notice, Platform, RequestUrlResponse, requestUrl } from "obsidian";
import { ProofreaderSettings } from "./settings";

function logError(obj: unknown): void {
	if (Platform.isMobileApp) {
		new Notice("Error. For details, run the respective function on the desktop.");
	} else {
		const hotkey = Platform.isMacOS ? "cmd+opt+i" : "ctrl+shift+i";
		new Notice(`Error. Check the console for more details (${hotkey}).`);
		console.error("[Proofreader plugin] Gemini API error", obj);
	}
}

export async function geminiRequest(
	settings: ProofreaderSettings,
	oldText: string,
): Promise<{ newText: string; isOverlength: boolean; cost: number } | undefined> {
	// GUARD
	if (!settings.geminiApiKey) {
		new Notice("Please set your Gemini API key in the plugin settings.");
		return;
	}

	// SEND REQUEST
	let response: RequestUrlResponse;
	try {
		// DOCS https://ai.google.dev/gemini-api/docs/openai-compatibility
		response = await requestUrl({
			url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
			method: "POST",
			contentType: "application/json",
			headers: { Authorization: `Bearer ${settings.geminiApiKey}` },
			body: JSON.stringify({
				model: settings.geminiModel,
				messages: [
					// Using "system" role for static prompt, similar to OpenAI examples
					{ role: "system", content: settings.staticPrompt },
					{ role: "user", content: oldText },
				],
				// TODO: Add other parameters like temperature, max_tokens if needed
				// For now, keeping it simple like the openai-request.ts
			}),
		});
		console.debug("[Proofreader plugin] Gemini API response", response);
	} catch (error) {
		const errorResponse = error as {
			status?: number;
			message?: string;
			response?: {
				text?: string;
				headers?: Record<string, string>;
				status?: number;
				json?: any;
			};
		};
		if (errorResponse.status === 401 || errorResponse.response?.status === 401) {
			new Notice("Gemini API key is not valid or has insufficient permissions. Please verify the key in the plugin settings.");
			return;
		}
		if (errorResponse.status === 400 || errorResponse.response?.status === 400) {
			let detail = "Bad request. Check model compatibility or request format.";
			if (errorResponse.response?.json?.error?.message) {
				detail = errorResponse.response.json.error.message;
			}
			new Notice(`Gemini API error: ${detail}`);
			console.error("[Proofreader plugin] Gemini API 400 error", errorResponse.response?.json || error);
			return;
		}
		logError(error);
		return;
	}

	// GUARD
	let newText = response.json?.choices?.[0]?.message?.content;
	if (typeof newText !== "string") {
		logError({ message: "Unexpected response structure from Gemini API.", response: response.json });
		return;
	}

	// Ensure same amount of surrounding whitespace
	const leadingWhitespace = oldText.match(/^(\s*)/)?.[0] || "";
	const trailingWhitespace = oldText.match(/(\s*)$/)?.[0] || "";
	newText = newText.replace(/^(\s*)/, leadingWhitespace).replace(/(\s*)$/, trailingWhitespace);

	// determine if overlength (finish_reason might be 'MAX_TOKENS' or similar)
	// The Gemini API (via OpenAI compatibility) should provide `usage` data.
	const finishReason = response.json?.choices?.[0]?.finish_reason;
	const outputTokensUsed = response.json?.usage?.completion_tokens || 0;
	
	let isOverlength = false;
	if (finishReason === "max_tokens" || finishReason === "length") { // "length" is OpenAI's reason
		isOverlength = true;
	}

	if (isOverlength) {
		const msg =
			"Text is longer than the maximum output supported by the AI model, or the output was truncated.\n\n" +
			"Suggestions may be incomplete.";
		new Notice(msg, 10_000);
	}

	// inform about cost (placeholder if token usage or costs are not accurately available)
	const inputTokensUsed = response.json?.usage?.prompt_tokens || 0;
	let cost = 0;

	return { newText: newText, isOverlength: isOverlength, cost: cost };
} 