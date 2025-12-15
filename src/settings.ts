import { PluginSettingTab, Setting } from "obsidian";
import type Proofreader from "src/main";
import type { ModelName } from "src/providers/adapter";
import { MODEL_SPECS } from "src/providers/model-info";

// https://platform.openai.com/docs/api-reference/responses/object#responses/object-reasoning
const reasoningEffortOptions = ["minimal", "low", "medium", "high"] as const;
type ReasoningEffort = (typeof reasoningEffortOptions)[number];

export const DEFAULT_SETTINGS = {
	openAiApiKey: "",
	model: "gpt-5-nano" as ModelName,
	reasoningEffort: "minimal" as ReasoningEffort,
	openAiEndpoint: "",

	preserveItalicAndBold: false,
	preserveTextInsideQuotes: false,
	preserveBlockquotes: false,
	preserveNonSmartPuncation: false,
	diffWithSpace: false,

	staticPrompt:
		"Act as a professional editor. Please make suggestions how to improve clarity, readability, grammar, and language of the following text. Preserve the original meaning and any technical jargon. Suggest structural changes only if they significantly improve flow or understanding. Avoid unnecessary expansion or major reformatting (e.g., no unwarranted lists). Try to make as little changes as possible, refrain from doing any changes when the writing is already sufficiently clear and concise. Output only the revised text and nothing else. The text may contain Markdown formatting, which should be preserved when appropriate. The text is:",
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

		//────────────────────────────────────────────────────────────────────────
		// OpenAI settings
		new Setting(containerEl).setName("OpenAI").setHeading();

		// API KEYS
		new Setting(containerEl)
			.setName("API key")
			.setDesc("Get your API key from https://platform.openai.com/api-keys")
			.addText((input) => {
				input.inputEl.type = "password"; // obfuscates the field
				input.inputEl.setCssProps({ width: "100%" });
				input
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- PENDING https://github.com/obsidianmd/eslint-plugin/issues/71
					.setPlaceholder("sk-123456789…")
					.setValue(settings.openAiApiKey)
					.onChange(async (value) => {
						settings.openAiApiKey = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Model")
			.setDesc(
				"The nano model is slightly quicker and cheaper. " +
					"The mini model is more slightly more accurate, but also more expensive. ",
			)
			.addDropdown((dropdown) => {
				for (const key in MODEL_SPECS) {
					const model = MODEL_SPECS[key as ModelName];
					dropdown.addOption(key, model.displayText);
				}
				dropdown.setValue(settings.model).onChange(async (value) => {
					settings.model = value as ModelName;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Reasoning effort")
			.setDesc("Higher uses more tokens and is slower, but produces better results.")
			.addDropdown((dropdown) => {
				for (const option of reasoningEffortOptions) {
					dropdown.addOption(option, option);
				}
				dropdown.setValue(settings.reasoningEffort).onChange(async (value) => {
					settings.reasoningEffort = value as ReasoningEffort;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Advanced: URL endpoint")
			.setDesc(
				"Endpoint for OpenAi-compatible models, using the API key from above. " +
					"Leave empty to use the regular OpenAI API. " +
					"Most users do not need to change this setting, only change this if you know what you are doing. ",
			)
			.addText((input) => {
				input.inputEl.setCssProps({ width: "100%" });
				input
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- PENDING https://github.com/obsidianmd/eslint-plugin/issues/71
					.setPlaceholder("https://...")
					.setValue(settings.openAiEndpoint)
					.onChange(async (value) => {
						settings.openAiApiKey = value.trim();
						await this.plugin.saveSettings();
					});
			});

		//────────────────────────────────────────────────────────────────────────
		// DIFF OPTIONS
		new Setting(containerEl).setName("Diff").setHeading();

		new Setting(containerEl)
			.setName("Space-sensitive diff")
			.setDesc(
				"Processes spaces more accurately, but results in smaller, more numerous changes.",
			)
			.addToggle((toggle) =>
				toggle.setValue(settings.diffWithSpace).onChange(async (value) => {
					settings.diffWithSpace = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Preserve text inside quotes")
			.setDesc(
				'No changes will be made to text inside quotation marks (""). ' +
					"(This is not flawless, as the AI sometimes suggests changes across quotes.)",
			)
			.addToggle((toggle) =>
				toggle.setValue(settings.preserveTextInsideQuotes).onChange(async (value) => {
					settings.preserveTextInsideQuotes = value;
					await this.plugin.saveSettings();
				}),
			);
		new Setting(containerEl)
			.setName("Preserve bold and italic formatting")
			.setDesc(
				"Preserve **bold**, and *italic* formatting." +
					"(This is not flawless, as the AI occasionally rewrite text alongside formatting changes.)",
			)
			.addToggle((toggle) =>
				toggle.setValue(settings.preserveItalicAndBold).onChange(async (value) => {
					settings.preserveItalicAndBold = value;
					await this.plugin.saveSettings();
				}),
			);
		new Setting(containerEl)
			.setName("Preserve text in blockquotes and callouts")
			.setDesc(
				"No changes will be made to lines beginning with `>`. " +
					"(This is not flawless, as the AI sometimes proposes changes across paragraphs.)",
			)
			.addToggle((toggle) =>
				toggle.setValue(settings.preserveBlockquotes).onChange(async (value) => {
					settings.preserveBlockquotes = value;
					await this.plugin.saveSettings();
				}),
			);
		new Setting(containerEl)
			.setName("Preserve non-smart punctuation")
			.setDesc(
				"Prevent changing non-smart punctuation to their smart counterparts, " +
					' for instance changing " to “ or 1-2 to 1–2. ' +
					"This can be relevant for tools like pandoc, which automatically convert " +
					"non-smart punctuation based on how they are configured. ",
			)
			.addToggle((toggle) =>
				toggle.setValue(settings.preserveNonSmartPuncation).onChange(async (value) => {
					settings.preserveNonSmartPuncation = value;
					await this.plugin.saveSettings();
				}),
			);

		//────────────────────────────────────────────────────────────────────────
		// ADVANCED
		new Setting(containerEl).setName("Advanced").setHeading();

		new Setting(containerEl)
			.setName("System prompt")
			.setDesc(
				"The LLM must respond ONLY with the updated text for this plugin to work. Leave the text field empty to reset to the default prompt. " +
					"Most users do not need to change this setting, only change this if you know what you are doing. ",
			)
			.addTextArea((textarea) => {
				textarea.inputEl.setCssProps({ width: "25vw", height: "15em" });
				textarea
					.setValue(settings.staticPrompt)
					.setPlaceholder("Make suggestions based on…")
					.onChange(async (value) => {
						settings.staticPrompt = value.trim() || DEFAULT_SETTINGS.staticPrompt;
						await this.plugin.saveSettings();
					});
			});
	}
}
