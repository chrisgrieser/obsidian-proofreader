import { Plugin } from "obsidian";
import { acceptOrRejectInText, acceptOrRejectNextSuggestion } from "./accept-reject-suggestions";
import { proofreadDocument, proofreadText } from "./proofread";
import {
	DEFAULT_SETTINGS,
	MODEL_SPECS,
	ProofreaderSettings,
	ProofreaderSettingsMenu,
} from "./settings";

// biome-ignore lint/style/noDefaultExport: required for Obsidian plugins to work
export default class Proofreader extends Plugin {
	settings: ProofreaderSettings = DEFAULT_SETTINGS;

	override async onload(): Promise<void> {
		// settings
		await this.loadSettings();
		this.addSettingTab(new ProofreaderSettingsMenu(this));

		// commands
		this.addCommand({
			id: "proofread-selection-paragraph",
			name: "Proofread selection/paragraph",
			editorCallback: (editor): Promise<void> => proofreadText(this, editor),
			icon: "bot-message-square",
		});
		this.addCommand({
			id: "proofread-full-document",
			name: "Proofread full document",
			editorCallback: (editor): Promise<void> => proofreadDocument(this, editor),
			icon: "bot-message-square",
		});
		this.addCommand({
			id: "accept-suggestions-in-text",
			name: "Accept suggestions in selection/paragraph",
			editorCallback: (editor): void => acceptOrRejectInText(editor, "accept"),
			icon: "check-check",
		});
		this.addCommand({
			id: "reject-suggestions-in-text",
			name: "Reject suggestions in selection/paragraph",
			editorCallback: (editor): void => acceptOrRejectInText(editor, "reject"),
			icon: "x",
		});
		this.addCommand({
			id: "accept-next-suggestion",
			name: "Accept next suggestion (or go to suggestion if outside viewport)",
			editorCallback: (editor): void => acceptOrRejectNextSuggestion(editor, "accept"),
			icon: "check-check",
		});
		this.addCommand({
			id: "reject-next-suggestion",
			name: "Reject next suggestion (or go to suggestion if outside viewport)",
			editorCallback: (editor): void => acceptOrRejectNextSuggestion(editor, "reject"),
			icon: "x",
		});

		// Add context menu item for editor
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor) => {
				menu.addItem((item) => {
					item
						.setTitle("Proofread selection/paragraph")
						.setIcon("bot-message-square")
						.onClick(async () => {
							await proofreadText(this, editor);
						});
				});
			})
		);

		console.info(this.manifest.name + " Plugin loaded.");
	}

	override onunload(): void {
		console.info(this.manifest.name + " Plugin unloaded.");
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

		// In case the plugin updates to newer models, ensure the user will not be
		// left with an outdated model from the settings.
		const outdatedModel = !Object.keys(MODEL_SPECS).includes(this.settings.openAiModel);
		if (outdatedModel) {
			this.settings.openAiModel = DEFAULT_SETTINGS.openAiModel;
			await this.saveSettings();
		}
	}
}
