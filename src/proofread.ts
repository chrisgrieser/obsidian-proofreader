import { Change, diffWords } from "diff";
import { Editor, Notice, getFrontMatterInfo } from "obsidian";
import Proofreader from "./main";
import { openAiRequest } from "./openai-request";
import { lmStudioRequest } from "./lmstudio-request";
import { ProofreaderSettings } from "./settings";

// DOCS https://github.com/kpdecker/jsdiff#readme
function getDiffMarkdown(
	settings: ProofreaderSettings,
	oldText: string,
	newText: string,
	isOverlength?: boolean,
): { textWithSuggestions: string; changeCount: number } {
	const diff = diffWords(oldText, newText);

	// do not remove text after cutoff-length
	if (isOverlength) {
		(diff.at(-1) as Change).removed = false;
		const cutOffCallout =
			"\n\n" +
			"> [!INFO] End of proofreading\n" +
			"> The input text was too long. Text after this point is unchanged." +
			"\n\n";
		diff.splice(-2, 0, { added: false, removed: false, value: cutOffCallout });
	}

	// convert diff to text with ==highlights== and ~~strikethrough~~ as suggestions
	let textWithSuggestions = diff
		.map((part) => {
			if (!part.added && !part.removed) return part.value;
			return part.added ? `==${part.value}==` : `~~${part.value}~~`;
		})
		.join("");

	// cleanup
	textWithSuggestions = textWithSuggestions
		.replace(/~~"~~==[""]==/g, '"') // preserve non-smart quotes
		.replace(/~~'~~==['']==/g, "'")
		.replace(/(==|~~) /g, " $1") // prevent leading spaces in markup, as they make it invalid
		.replace(/~~(.+?)(.)~~==(\1)==/g, "$1~~$2~~") // only removal of one char, e.g. plural-s
		.replace(/~~(.+?)~~==(?:\1)(.)==/g, "$1==$2=="); // only addition of one char
	if (settings.preserveTextInsideQuotes) {
		textWithSuggestions = textWithSuggestions.replace(/"([^"]+)"/g, (_, inside) => {
			const originalText = inside.replace(/~~/g, "").replace(/==.*?==/g, "");
			return `"${originalText}"`;
		});
	}

	const changeCount = (textWithSuggestions.match(/==|~~/g)?.length || 0) / 2;
	return { textWithSuggestions: textWithSuggestions, changeCount: changeCount };
}

async function validateAndGetChangesAndNotify(
	plugin: Proofreader,
	oldText: string,
	scope: string,
): Promise<string | undefined> {
	const { app, settings } = plugin;

	// GUARD valid start-text
	if (oldText.trim() === "") {
		new Notice(`${scope} is empty.`);
		return;
	}
	if (oldText.match(/==|~~/)) {
		const warnMsg =
			`${scope} already has highlights or strikethroughs.\n\n` +
			"Please accept/reject the changes before making another proofreading request.";
		new Notice(warnMsg, 6000);
		return;
	}

	// parameters
	const fileBefore = app.workspace.getActiveFile()?.path;
	const longInput = oldText.length > 1500;
	const veryLongInput = oldText.length > 15000;
	// Proofreading a document likely takes longer, we want to keep the finishing
	// message in case the user went afk. (In the Notice API, duration 0 means
	// keeping the notice until the user dismisses it.)
	const notifDuration = longInput ? 0 : 4_000;

	// notify on start
	let msg = `🤖 ${scope} is being proofread…`;
	if (longInput) {
		msg += "\n\nDue to the length of the text, this may take a moment.";
		if (veryLongInput) msg += " (A minute or longer.)";
		msg += "\n\nDo not go to a different file or change the original text in the meantime.";
	}
	const notice = new Notice(msg, 0);

	// perform request, check that file is still the same
	let requestPromise;
	if (settings.llmProvider === "openai") {
		requestPromise = openAiRequest(settings, oldText);
	} else if (settings.llmProvider === "lmstudio") {
		requestPromise = lmStudioRequest(settings, oldText);
	} else {
		new Notice(`Unknown LLM provider: ${settings.llmProvider}`);
		notice.hide();
		return;
	}

	const result = await requestPromise;
	notice.hide();
	if (!result || !result.newText) return;

	const { newText, isOverlength, cost } = result;

	const fileAfter = app.workspace.getActiveFile()?.path;
	if (fileBefore !== fileAfter) {
		const errmsg = "⚠️ The active file changed since the proofread has been triggered. Aborting.";
		new Notice(errmsg, notifDuration);
		return;
	}

	// check if diff is even needed
	const { textWithSuggestions, changeCount } = getDiffMarkdown(
		settings,
		oldText,
		newText,
		isOverlength,
	);
	if (newText === oldText || textWithSuggestions === oldText) {
		new Notice("✅ Text is good, nothing to change.", notifDuration);
		return;
	}

	// notify on changes
	const pluralS = changeCount === 1 ? "" : "s";
	const costString = settings.llmProvider === "openai" && cost ? `est. cost: $${cost.toFixed(4)}` : "";
	const msg2 = [
		`🤖 ${changeCount} change${pluralS} made.`,
		costString,
	].filter(Boolean).join("\n\n");
	new Notice(msg2, notifDuration);

	return textWithSuggestions;
}

//──────────────────────────────────────────────────────────────────────────────

export async function proofreadDocument(plugin: Proofreader, editor: Editor): Promise<void> {
	const noteWithFrontmatter = editor.getValue();
	const bodyStart = getFrontMatterInfo(noteWithFrontmatter).contentStart || 0;
	const bodyEnd = noteWithFrontmatter.length;
	const oldText = noteWithFrontmatter.slice(bodyStart);

	const changes = await validateAndGetChangesAndNotify(plugin, oldText, "Document");
	if (!changes) return;

	const bodyStartPos = editor.offsetToPos(bodyStart);
	const bodyEndPos = editor.offsetToPos(bodyEnd);
	editor.replaceRange(changes, bodyStartPos, bodyEndPos);
	editor.setCursor(bodyStartPos); // to start of doc
}

export async function proofreadText(plugin: Proofreader, editor: Editor): Promise<void> {
	const hasMultipleSelections = editor.listSelections().length > 1;
	if (hasMultipleSelections) {
		new Notice("Multiple selections are not supported.");
		return;
	}

	const cursor = editor.getCursor("from"); // `from` gives start if selection
	const selection = editor.getSelection();
	const oldText = selection || editor.getLine(cursor.line);
	const scope = selection ? "Selection" : "Paragraph";

	const changes = await validateAndGetChangesAndNotify(plugin, oldText, scope);
	if (!changes) return;

	if (selection) {
		editor.replaceSelection(changes);
		editor.setCursor(cursor); // to start of selection
	} else {
		editor.setLine(cursor.line, changes);
		editor.setCursor({ line: cursor.line, ch: 0 }); // to start of paragraph
	}
}
