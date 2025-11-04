import { Notice, Platform } from "obsidian";

export function logError(msg: string, obj: unknown): void {
	if (Platform.isMobileApp) {
		// No issue way of checking the logs on mobile, thus recommending to
		// retrieve error via running on desktop instead.
		new Notice(`Error: ${msg}\n\nFor details, run the respective function on the desktop.`);
	} else {
		const hotkey = Platform.isMacOS ? "cmd+opt+i" : "ctrl+shift+i";
		new Notice(
			`[Proofreader plugin] Error: ${msg}\n\n Check the console for more details (${hotkey}).`,
		);
		console.error("[Proofreader plugin] error", obj);
	}
}
