import { Change, diffWords } from "diff";
import { Editor, Notice, getFrontMatterInfo, Platform, EditorPosition } from "obsidian";
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
	editor: Editor,
	oldText: string,
	scope: string,
	originalRange?: { from: EditorPosition; to: EditorPosition }
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

	const noticeMessage = document.createDocumentFragment();
	noticeMessage.appendText(`🤖 ${changeCount} change${pluralS} made.`);
	if (costString) {
		noticeMessage.appendChild(document.createElement("br"));
		noticeMessage.appendChild(document.createElement("br"));
		noticeMessage.appendText(costString);
	}

	const noticeWithActions = new Notice(noticeMessage, 0);

	// Create action buttons if running in a desktop environment and originalRange is defined
	if (!Platform.isMobile && originalRange) {
		const suggestionStartPos = originalRange.from;

		// Calculate end position based on textWithSuggestions content and its start position
		let currentLineNum = suggestionStartPos.line;
		let currentCharPos = suggestionStartPos.ch;
		const linesInSuggestion = textWithSuggestions ? textWithSuggestions.split("\n") : [""];

		if (linesInSuggestion.length === 1) {
			currentCharPos = suggestionStartPos.ch + linesInSuggestion[0].length; 
		} else {
			currentLineNum = suggestionStartPos.line + linesInSuggestion.length - 1;
			// For the last line, ch is its length. If it started at ch 0 of that new line.
			// However, the original diff logic places it relative to the start of the *first* line of the suggestion.
			// The most robust way is to use offsets IF the initial text insertion is also done via offsets or if we can precisely get the range of that insertion.
			// Given the current replaceRange/setLine for initial insertion, let's stick to a simpler line/char calculation for now.
			// This part can be tricky if the original selection wasn't from ch: 0.
			// For simplicity, if multi-line, the char pos of the last line of suggestion is its length.
			currentCharPos = linesInSuggestion[linesInSuggestion.length - 1].length;
		}
		const actualSuggestionEndPos: EditorPosition = { line: currentLineNum, ch: currentCharPos };

		// DEBUGGING LOGS
		console.log("[Proofreader] Debug Info for Accept/Reject:");
		console.log("Original Text (oldText):", JSON.stringify(oldText));
		console.log("AI Output (newText from result):", JSON.stringify(result?.newText)); // Log the raw AI output
		console.log("Text with Suggestions (textWithSuggestions):", JSON.stringify(textWithSuggestions));
		console.log("Original Range From:", originalRange.from, "To:", originalRange.to);
		console.log("Calculated Suggestion End Position (actualSuggestionEndPos):", actualSuggestionEndPos);

		const actionsEl = noticeWithActions.noticeEl.createDiv({ cls: "proofreader-actions" });
		actionsEl.style.marginTop = "10px";

		const acceptBtn = actionsEl.createEl("button", { text: "Accept All" });
		acceptBtn.style.marginRight = "10px";
		acceptBtn.addEventListener("click", () => {
			const acceptedText = removeMarkup(textWithSuggestions, "accept");
			console.log("[Proofreader] Accepting - Accepted Text:", JSON.stringify(acceptedText));
			console.log("[Proofreader] Accepting - Replacing Range From:", suggestionStartPos, "To:", actualSuggestionEndPos);
			editor.replaceRange(acceptedText, suggestionStartPos, actualSuggestionEndPos);
			noticeWithActions.hide();
			new Notice("✅ Suggestions accepted.");
		});

		const rejectBtn = actionsEl.createEl("button", { text: "Reject All" });
		rejectBtn.addEventListener("click", () => {
			console.log("[Proofreader] Rejecting - Original Text:", JSON.stringify(oldText));
			console.log("[Proofreader] Rejecting - Replacing Range From:", suggestionStartPos, "To:", actualSuggestionEndPos);
			editor.replaceRange(oldText, suggestionStartPos, actualSuggestionEndPos);
			noticeWithActions.hide();
			new Notice("❌ Suggestions rejected.");
		});
	}

	return textWithSuggestions;
}

// Helper function (might need to be moved or imported from accept-reject-suggestions.ts if we refactor)
function removeMarkup(text: string, mode: "accept" | "reject"): string {
	return mode === "accept"
		? text.replace(/==/g, "").replace(/~~.*?~~/g, "")
		: text.replace(/~~/g, "").replace(/==.*?==/g, "");
}

//──────────────────────────────────────────────────────────────────────────────

export async function proofreadDocument(plugin: Proofreader, editor: Editor): Promise<void> {
	const noteWithFrontmatter = editor.getValue();
	const bodyStart = getFrontMatterInfo(noteWithFrontmatter).contentStart || 0;
	const bodyEnd = noteWithFrontmatter.length;
	const oldText = noteWithFrontmatter.slice(bodyStart);

	// Define the range for the entire document body for accept/reject actions
	const bodyStartPos = editor.offsetToPos(bodyStart);
	const bodyEndPos = editor.offsetToPos(bodyEnd);
	const docRange = { from: bodyStartPos, to: bodyEndPos };

	const changes = await validateAndGetChangesAndNotify(plugin, editor, oldText, "Document", docRange);
	if (!changes) return;

	editor.replaceRange(changes, docRange.from, docRange.to);
	editor.setCursor(docRange.from); // to start of doc body
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

	let originalRange: { from: EditorPosition; to: EditorPosition };
	if (selection) {
		originalRange = { from: editor.getCursor("from"), to: editor.getCursor("to") };
	} else {
		const lineStart = { line: cursor.line, ch: 0 };
		const lineEnd = { line: cursor.line, ch: editor.getLine(cursor.line).length };
		originalRange = { from: lineStart, to: lineEnd };
	}

	const changes = await validateAndGetChangesAndNotify(plugin, editor, oldText, scope, originalRange);
	if (!changes) return;

	if (selection) {
		editor.replaceSelection(changes);
		editor.setCursor(originalRange.from); 
	} else {
		editor.setLine(cursor.line, changes);
		editor.setCursor({ line: cursor.line, ch: 0 }); 
	}
}
