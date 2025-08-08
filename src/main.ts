import { Plugin } from "obsidian";
import { acceptOrRejectInText, acceptOrRejectNextSuggestion } from "src/accept-reject-suggestions";
import { proofreadDocument, proofreadText } from "src/proofread";
import { DEFAULT_SETTINGS, type ProofreaderSettings, ProofreaderSettingsMenu } from "src/settings";

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

		console.info(this.manifest.name + " Plugin loaded.");
	}

	override onunload(): void {
		console.info(this.manifest.name + " Plugin unloaded.");
	}

	async saveSettings(): Promise<void> {
		// Ensure default values are not written, so the user will not load
		// outdated defaults when the default settings are changed.
		const settings = structuredClone(this.settings);
		for (const key in settings) {
			const name = key as keyof ProofreaderSettings;
			// @ts-expect-error intentional removal
			if (settings[name] === DEFAULT_SETTINGS[name]) settings[name] = undefined;
		}

		await this.saveData(settings);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}
}
