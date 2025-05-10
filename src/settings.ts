import { App, PluginSettingTab, Setting, requestUrl, DropdownComponent, TextComponent, TextAreaComponent, ButtonComponent } from "obsidian";
import Proofreader from "./main";

// The `nano` and `mini` models are sufficiently good sufficiently good output
// for the very focussed task of just fixing language
export const MODEL_SPECS = {
	"gpt-4.1-nano": {
		displayText: "GPT 4.1 nano (recommended)",
		maxOutputTokens: 32_768,
		costPerMillionTokens: { input: 0.1, output: 0.4 },
		info: {
			intelligence: 2,
			speed: 5,
			url: "https://platform.openai.com/docs/models/gpt-4.1-nano",
		},
	},
	"gpt-4.1-mini": {
		displayText: "GPT 4.1 mini",
		maxOutputTokens: 32_768,
		costPerMillionTokens: { input: 0.4, output: 1.6 },
		info: {
			intelligence: 3,
			speed: 4,
			url: "https://platform.openai.com/docs/models/gpt-4.1-mini",
		},
	},
	"gpt-4.1": {
		displayText: "GPT 4.1 (for tasks beyond proofreading)",
		maxOutputTokens: 32_768,
		costPerMillionTokens: { input: 2.0, output: 8.0 },
		info: {
			intelligence: 4,
			speed: 3,
			url: "https://platform.openai.com/docs/models/gpt-4.1",
		},
	},
};

type OpenAiModels = keyof typeof MODEL_SPECS;

//──────────────────────────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS = {
	llmProvider: "openai" as "openai" | "lmstudio" | "gemini",
	lmStudioServerUrl: "http://localhost:1234",
	lmStudioReasoningEnabled: false,
	openAiApiKey: "",
	openAiModel: "gpt-4.1-nano" as OpenAiModels,
	geminiApiKey: "",
	geminiModel: "gemini-1.5-flash-latest", // Default model, will be string
	staticPrompt:
		"Act as a professional editor. Please make suggestions how to improve clarity, readability, grammar, and language of the following text. Preserve the original meaning and any technical jargon. Suggest structural changes only if they significantly improve flow or understanding. Avoid unnecessary expansion or major reformatting (e.g., no unwarranted lists). Try to make as little changes as possible, refrain from doing any changes when the writing is already sufficiently clear and concise. Output only the revised text and nothing else. The text is:",
	preserveTextInsideQuotes: false,
};

export type ProofreaderSettings = typeof DEFAULT_SETTINGS;

//──────────────────────────────────────────────────────────────────────────────

// DOCS https://docs.obsidian.md/Plugins/User+interface/Settings
export class ProofreaderSettingsMenu extends PluginSettingTab {
	plugin: Proofreader;

	constructor(plugin: Proofreader) {
		super(plugin.app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		const settings = this.plugin.settings;

		containerEl.empty();

		// LLM Provider Setting
		new Setting(containerEl)
			.setName("LLM Provider")
			.setDesc("Select the LLM provider to use.")
			.addDropdown((dropdown: DropdownComponent) => {
				dropdown
					.addOption("openai", "OpenAI")
					.addOption("lmstudio", "LM Studio")
					.addOption("gemini", "Gemini")
					.setValue(settings.llmProvider)
					.onChange(async (value: string) => {
						settings.llmProvider = value as "openai" | "lmstudio" | "gemini";
						await this.plugin.saveSettings();
						this.display(); // Re-render the settings page
					});
			});

		if (settings.llmProvider === "openai") {
			// OpenAI Specific Settings
			new Setting(containerEl).setName("OpenAI API key").addText((input: TextComponent) => {
				input.inputEl.type = "password"; // obfuscates the field
				input.inputEl.setCssProps({ width: "100%" });
				input
					.setPlaceholder("sk-123456789...")
					.setValue(settings.openAiApiKey)
					.onChange(async (value: string) => {
						settings.openAiApiKey = value.trim();
						await this.plugin.saveSettings();
					});
			});

			new Setting(containerEl)
				.setName("Model")
				.setDesc(
					"The nano model is slightly quicker and cheaper. " +
						"The mini model is slightly higher quality, but also more expensive. " +
						"Other models are both slower and more expensive; they should only be selected " +
						"by advanced users who customize the prompt and intend to use this plugin for " +
						"tasks beyond proofreading.",
				)
				.addDropdown((dropdown: DropdownComponent) => {
					for (const key in MODEL_SPECS) {
						if (!Object.hasOwn(MODEL_SPECS, key)) continue;
						const display = MODEL_SPECS[key as OpenAiModels].displayText;
						dropdown.addOption(key, display);
					}
					dropdown.setValue(settings.openAiModel).onChange(async (value: string) => {
						settings.openAiModel = value as OpenAiModels;
						await this.plugin.saveSettings();
					});
				});
		} else if (settings.llmProvider === "lmstudio") {
			// LM Studio Specific Settings
			new Setting(containerEl)
				.setName("LM Studio Server URL")
				.setDesc("Enter the URL of your LM Studio server (e.g., http://localhost:1234).")
				.addText((text: TextComponent) =>
					text
						.setPlaceholder("http://localhost:1234")
						.setValue(settings.lmStudioServerUrl)
						.onChange(async (value: string) => {
							settings.lmStudioServerUrl = value.trim();
							await this.plugin.saveSettings();
							this.display(); // Re-render to update model list
						}),
				);

			const modelSetting = new Setting(containerEl)
				.setName("Model")
				.setDesc("Select a model from your LM Studio server. Ensure the server is running and accessible.");
			
			// Add a button to refresh the model list
			modelSetting.addButton((button: ButtonComponent) => {
				button
					.setButtonText("Refresh Models")
					.setCta()
					.onClick(async () => {
						this.display(); // Re-render to fetch and display models
					});
			});


			modelSetting.addDropdown(async (dropdown: DropdownComponent) => {
				try {
					const response = await requestUrl({ url: `${settings.lmStudioServerUrl}/v1/models` });
					if (response.status !== 200) {
						throw new Error(`Failed to fetch models: ${response.status}`);
					}
					const data = response.json;
					const models = data.data || [];

					if (models.length === 0) {
						dropdown.addOption("", "No models found or server offline");
						dropdown.setDisabled(true);
					} else {
						models.forEach((model: { id: string }) => {
							dropdown.addOption(model.id, model.id);
						});
						// Ensure openAiModel (which we'll reuse for lmstudio model) is set to a valid model if not already
						if (!models.some((m: {id: string}) => m.id === settings.openAiModel) && models.length > 0) {
							settings.openAiModel = models[0].id as OpenAiModels;
							await this.plugin.saveSettings();
						}
					}
				} catch (error) {
					console.error("Error fetching LM Studio models:", error);
					dropdown.addOption("", "Error fetching models. Check server URL and console.");
					dropdown.setDisabled(true);
				}
				dropdown.setValue(settings.openAiModel).onChange(async (value: string) => {
					settings.openAiModel = value as OpenAiModels;
					await this.plugin.saveSettings();
				});
			});

			// New Setting for LM Studio Reasoning Mode
			new Setting(containerEl)
				.setName("Reasoning Mode")
				.setDesc("Enable if your LM Studio model uses <think>...</think> tags for reasoning and you want to discard this part.")
				.addToggle((toggle: import("obsidian").ToggleComponent) =>  // Added explicit type
					toggle
						.setValue(settings.lmStudioReasoningEnabled)
						.onChange(async (value: boolean) => {
							settings.lmStudioReasoningEnabled = value;
							await this.plugin.saveSettings();
						}),
				);
		} else if (settings.llmProvider === "gemini") {
			// Gemini Specific Settings
			new Setting(containerEl).setName("Gemini API key").addText((input: TextComponent) => {
				input.inputEl.type = "password"; // obfuscates the field
				input.inputEl.setCssProps({ width: "100%" });
				input
					.setPlaceholder("Enter your Gemini API key")
					.setValue(settings.geminiApiKey)
					.onChange(async (value: string) => {
						settings.geminiApiKey = value.trim();
						await this.plugin.saveSettings();
						this.display(); // Re-render to update model list if API key changes
					});
			});

			const geminiModelSetting = new Setting(containerEl)
				.setName("Model")
				.setDesc("Select a Gemini model. Ensure your API key is set and valid. Models are fetched from the Gemini API.");

			geminiModelSetting.addButton((button: ButtonComponent) => {
				button
					.setButtonText("Refresh Models")
					.setCta()
					.onClick(async () => {
						this.display(); // Re-render to fetch and display models
					});
			});

			geminiModelSetting.addDropdown(async (dropdown: DropdownComponent) => {
				if (!settings.geminiApiKey) {
					dropdown.addOption("", "API Key required to list models");
					dropdown.setDisabled(true);
					return;
				}

				try {
					const response = await requestUrl({
						url: `https://generativelanguage.googleapis.com/v1beta/models?key=${settings.geminiApiKey}`,
						method: "GET",
					});

					if (response.status !== 200) {
						console.error("Gemini API error fetching models:", response);
						let errorMsg = `Failed to fetch models (Status: ${response.status})`;
						if (response.json?.error?.message) {
							errorMsg += `: ${response.json.error.message}`;
						}
						dropdown.addOption("", errorMsg);
						dropdown.setDisabled(true);
						return;
					}

					const data = response.json;
					const models = (data.models || [])
						.filter((model: any) => model.supportedGenerationMethods?.includes("generateContent") && model.name?.startsWith("models/gemini-"))
						.sort((a: any, b: any) => a.displayName.localeCompare(b.displayName));


					if (models.length === 0) {
						dropdown.addOption("", "No compatible Gemini models found or API key invalid.");
						dropdown.setDisabled(true);
					} else {
						models.forEach((model: { name: string; displayName: string }) => {
							const modelId = model.name.replace("models/", "");
							dropdown.addOption(modelId, model.displayName || modelId);
						});

						const currentModelIsValid = models.some((m: { name: string }) => m.name.replace("models/", "") === settings.geminiModel);
						if (!currentModelIsValid && models.length > 0) {
							const defaultModelId = models[0].name.replace("models/", "");
							settings.geminiModel = defaultModelId;
							await this.plugin.saveSettings();
						} else if (!settings.geminiModel && models.length > 0) {
							// if settings.geminiModel was empty string
							const defaultModelId = models[0].name.replace("models/", "");
							settings.geminiModel = defaultModelId;
							await this.plugin.saveSettings();
						}
					}
				} catch (error) {
					console.error("Error fetching Gemini models:", error);
					let errorText = "Error fetching models. Check API key, network, or console.";
					if (error instanceof Error) {
						// Check for specific error messages if needed, e.g. for 403 Forbidden
						if (error.message.includes("403")) {
							errorText = "Access denied. Check API key permissions.";
						}
					}
					dropdown.addOption("", errorText);
					dropdown.setDisabled(true);
				}
				dropdown.setValue(settings.geminiModel).onChange(async (value: string) => {
					settings.geminiModel = value;
					await this.plugin.saveSettings();
				});
			});
		}

		//────────────────────────────────────────────────────────────────────────
		// CLEANUP OPTIONS
		new Setting(containerEl)
			.setName("Preserve text inside quotes")
			.setDesc('No changes will be made to text inside quotation marks ("").')
			.addToggle((toggle) =>
				toggle.setValue(settings.preserveTextInsideQuotes).onChange(async (value) => {
					settings.preserveTextInsideQuotes = value;
					await this.plugin.saveSettings();
				}),
			);

		//────────────────────────────────────────────────────────────────────────
		// ADVANCED
		new Setting(containerEl).setName("Advanced").setHeading();

		new Setting(containerEl)
			.setName("System prompt")
			.setDesc(
				"The LLM must respond ONLY with the updated text for this plugin to work. " +
					"Most users do not need to change this setting. " +
					"Only change this if you know what you are doing.",
			)
			.addTextArea((textarea: TextAreaComponent) => {
				textarea.inputEl.setCssProps({ width: "25vw", height: "15em" });
				textarea
					.setValue(settings.staticPrompt)
					.setPlaceholder("Make suggestions based on...")
					.onChange(async (value) => {
						if (value.trim() === "") return;
						settings.staticPrompt = value.trim();
						await this.plugin.saveSettings();
					});
			});
	}
}
