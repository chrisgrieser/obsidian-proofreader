import { Notice, Platform, RequestUrlResponse, requestUrl } from "obsidian";
import { ProofreaderSettings } from "./settings"; // Assuming ProofreaderSettings includes lmStudioServerUrl and selected model for lmstudio

function logError(obj: unknown): void {
	if (Platform.isMobileApp) {
		new Notice("Error. For details, run the respective function on the desktop.");
	} else {
		const hotkey = Platform.isMacOS ? "cmd+opt+i" : "ctrl+shift+i";
		new Notice(`Error. Check the console for more details (${hotkey}).`);
		console.error("[Proofreader plugin] LM Studio error", obj);
	}
}

export async function lmStudioRequest(
	settings: ProofreaderSettings,
	oldText: string,
): Promise<{ newText: string; isOverlength: boolean; cost: number } | undefined> {
	// GUARD: Check for LM Studio Server URL
	if (!settings.lmStudioServerUrl) {
		new Notice("Please set your LM Studio Server URL in the plugin settings.");
		return;
	}
	// GUARD: Check for selected model (reusing openAiModel for now, as discussed)
	if (!settings.openAiModel) {
		new Notice("Please select a model in the plugin settings for LM Studio.");
		return;
	}

	const serverUrl = settings.lmStudioServerUrl.replace(/\/$/, ""); // Remove trailing slash if any

	// SEND REQUEST
	let response: RequestUrlResponse;
	try {
		// LM Studio uses an OpenAI-compatible endpoint
		response = await requestUrl({
			url: `${serverUrl}/v1/chat/completions`,
			method: "POST",
			contentType: "application/json",
			// LM Studio API doesn't typically require an API key for local servers,
			// but it might depend on user's specific LM Studio setup.
			// headers: { Authorization: "Bearer " + settings.lmStudioApiKey }, // If needed
			body: JSON.stringify({
				model: settings.openAiModel, // Using openAiModel as placeholder for LM Studio model
				messages: [
					// Consider if "developer" role is appropriate or if it should be "system"
					{ role: "system", content: settings.staticPrompt },
					{ role: "user", content: oldText },
				],
				// LM Studio might not support all OpenAI parameters like temperature, max_tokens directly here
				// or might have different defaults. For now, keeping it simple.
				// temperature: 0.5, // Example: Adjust creativity. LM Studio might ignore this.
				// max_tokens: 2048, // Example: Limit response length. LM Studio might ignore this or have its own limits.
			}),
		});
		console.debug("[Proofreader plugin] LM Studio response", response);
	} catch (error) {
		// Handle common errors like connection refused, server not found, etc.
		if (error instanceof Error && error.message.includes("Failed to fetch")) {
			new Notice("Failed to connect to LM Studio server. Ensure it's running and the URL is correct.");
		} else if ((error as { status: number }).status === 401) {
			new Notice("LM Studio server returned an authentication error (401). Check your server setup if it requires a key.");
		} else {
			logError(error);
		}
		return;
	}

	// GUARD: Check for response content
	let newText = response.json?.choices?.[0].message.content;
	if (!newText) {
		logError(response);
		new Notice("LM Studio returned an empty or invalid response.");
		return;
	}

	// Ensure same amount of surrounding whitespace
	const leadingWhitespace = oldText.match(/^(\s*)/)?.[0] || "";
	const trailingWhitespace = oldText.match(/(\s*)$/)?.[0] || "";
	newText = newText.replace(/^(\s*)/, leadingWhitespace).replace(/(\s*)$/, trailingWhitespace);

	// If reasoning mode is enabled, remove <think>...</think> blocks
	if (settings.lmStudioReasoningEnabled) {
		newText = newText.replace(/<think>[\s\S]*?<\/think>\s*/i, "").trim();
	}

	// Overlength and cost calculation might be different or not applicable for LM Studio
	// For now, returning false for isOverlength and 0 for cost.
	// This needs to be adjusted if LM Studio provides token usage details in its response.
	const isOverlength = false; // Placeholder
	const cost = 0; // Placeholder, as local models don't have direct per-token costs like OpenAI

	// Check if LM Studio response includes usage data
	const usage = response.json?.usage;
	if (usage) {
		console.log("[Proofreader plugin] LM Studio usage data:", usage);
		// Potentially use usage.prompt_tokens and usage.completion_tokens if available
		// For 'isOverlength', one might need to know the model's context window if not checking tokens.
	}


	return { newText: newText, isOverlength: isOverlength, cost: cost };
} 