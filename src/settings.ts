import { PluginSettingTab, Setting } from "obsidian";
import type Proofreader from "src/main";
import type { ModelName } from "src/providers/adapter";
import { MODEL_SPECS } from "src/providers/model-info";

export const DEFAULT_SETTINGS = {
	openAiApiKey: "",
	model: "gpt-5-nano" as ModelName,
	staticPrompt:
		"Act as a professional editor. Please make suggestions how to improve clarity, readability, grammar, and language of the following text. Preserve the original meaning and any technical jargon. Suggest structural changes only if they significantly improve flow or understanding. Avoid unnecessary expansion or major reformatting (e.g., no unwarranted lists). Try to make as little changes as possible, refrain from doing any changes when the writing is already sufficiently clear and concise. Output only the revised text and nothing else. The text is:",
	preserveTextInsideQuotes: false,
	preserveBlockquotes: false,
	preserveNonSmartPuncation: false,
	diffWithSpace: false,
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

		// API KEYS
		new Setting(containerEl).setName("OpenAI API key").addText((input) => {
			input.inputEl.type = "password"; // obfuscates the field
			input.inputEl.setCssProps({ width: "100%" });
			input
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
					"The mini model is slightly higher quality, but also more expensive. ",
			)
			.addDropdown((dropdown) => {
				for (const key in MODEL_SPECS) {
					if (!Object.hasOwn(MODEL_SPECS, key)) continue;
					const model = MODEL_SPECS[key as ModelName];
					dropdown.addOption(key, model.displayText);
				}
				dropdown.setValue(settings.model).onChange(async (value) => {
					settings.model = value as ModelName;
					await this.plugin.saveSettings();
				});
			});

		//────────────────────────────────────────────────────────────────────────
		// DIFF OPTIONS
		new Setting(containerEl).setName("Diff options").setHeading();

		new Setting(containerEl)
			.setName("Space-sensitive diff")
			.setDesc(
				"Space-sensitive diff processes spaces more accurately, but results in smaller, more numerous changes.",
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
					"Note that this is not perfect, as the AI will sometimes suggest changes across quotes.",
			)
			.addToggle((toggle) =>
				toggle.setValue(settings.preserveTextInsideQuotes).onChange(async (value) => {
					settings.preserveTextInsideQuotes = value;
					await this.plugin.saveSettings();
				}),
			);
		new Setting(containerEl)
			.setName("Preserve text in blockquotes and callouts")
			.setDesc(
				"No changes will be made to lines beginning with `>`. " +
					"Note that this is not perfect, as the AI will sometimes suggest changes across paragraphs.",
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
				"Prevent the AI from changing non-smart punctuation to their smart counterparts, " +
					' for instance changing `"` to `“` or `12-34` to `12–34`. ' +
					"This can be relevant when using tools like `pandoc`, which convert non-smart punctuation based on how they are configured.",
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
				"The LLM must respond ONLY with the updated text for this plugin to work. " +
					"Most users do not need to change this setting. " +
					"Only change this if you know what you are doing.",
			)
			.addTextArea((textarea) => {
				textarea.inputEl.setCssProps({ width: "25vw", height: "15em" });
				textarea
					.setValue(settings.staticPrompt)
					.setPlaceholder("Make suggestions based on…")
					.onChange(async (value) => {
						if (value.trim() === "") return;
						settings.staticPrompt = value.trim();
						await this.plugin.saveSettings();
					});
			});
	}
}
