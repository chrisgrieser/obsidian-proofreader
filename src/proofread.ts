import { Change, diffWords } from "diff";
import { Editor, Notice, getFrontMatterInfo, Platform, EditorPosition, Menu, MenuItem } from "obsidian";
import Proofreader from "./main";
import { openAiRequest } from "./openai-request";
import { lmStudioRequest } from "./lmstudio-request";
import { geminiRequest } from "./gemini-request";
import { ProofreaderSettings } from "./settings";
import { acceptOrRejectNextSuggestion } from "./accept-reject-suggestions";

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

// Structure to be returned by validateAndGetSuggestions
interface SuggestionGenerationResult {
	textWithSuggestions: string;
	oldText: string;
	changeCount: number;
	cost?: number;
	isOverlength?: boolean;
	originalRange?: { from: EditorPosition; to: EditorPosition };
}

// Renamed and refactored: This function now only gets suggestions and does not notify or show UI.
async function generateSuggestions(
	plugin: Proofreader,
	editor: Editor,
	oldText: string,
	scope: string,
	originalRange?: { from: EditorPosition; to: EditorPosition } 
): Promise<SuggestionGenerationResult | undefined> {
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

	const fileBefore = app.workspace.getActiveFile()?.path;
	const longInput = oldText.length > 1500;
	const veryLongInput = oldText.length > 15000;
	const initialNotifDuration = longInput ? 0 : 4_000;

	let msg = `🤖 ${scope} is being proofread…`;
	if (longInput) {
		msg += "\n\nDue to the length of the text, this may take a moment.";
		if (veryLongInput) msg += " (A minute or longer.)";
		msg += "\n\nDo not go to a different file or change the original text in the meantime.";
	}
	const notice = new Notice(msg, 0);

	let requestPromise;
	if (settings.llmProvider === "openai") {
		requestPromise = openAiRequest(settings, oldText);
	} else if (settings.llmProvider === "lmstudio") {
		requestPromise = lmStudioRequest(settings, oldText);
	} else if (settings.llmProvider === "gemini") {
		requestPromise = geminiRequest(settings, oldText);
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
		new Notice(errmsg, initialNotifDuration);
		return;
	}

	const { textWithSuggestions, changeCount } = getDiffMarkdown(
		settings,
		oldText,
		newText,
		isOverlength,
	);

	if (newText === oldText || textWithSuggestions === oldText || changeCount === 0) {
		new Notice("✅ Text is good, nothing to change.", initialNotifDuration);
		return;
	}

	// Basic notification that changes are ready (no buttons here)
	const pluralS = changeCount === 1 ? "" : "s";
	const costString = settings.llmProvider === "openai" && cost && cost > 0 ? `est. cost: $${cost.toFixed(4)}` : "";
	const infoMsg = [`🤖 ${changeCount} suggestion${pluralS} ready.`, costString].filter(Boolean).join("\n\n");
	new Notice(infoMsg, initialNotifDuration);

	const returnPayload: SuggestionGenerationResult = {
		textWithSuggestions,
		oldText,
		changeCount,
		cost,
		isOverlength,
	};
	if (originalRange) {
		returnPayload.originalRange = originalRange;
	}
	return returnPayload;
}

// Helper function (removeMarkup remains the same)
function removeMarkup(text: string, mode: "accept" | "reject"): string {
	return mode === "accept"
		? text.replace(/==/g, "").replace(/~~.*?~~/g, "")
		: text.replace(/~~/g, "").replace(/==.*?==/g, "");
}

// New function to show the suggestion menu
function showSuggestionMenu(
	plugin: Proofreader,
	editor: Editor,
	currentScopeTextWithMarkup: string, // Current text of the scope in the editor, with markup
	originalUntouchedText: string,    // Original text of the scope before any proofreading
	scopeStartPos: EditorPosition,      // Fixed start of the scope in the editor
	scopeEndPos: EditorPosition,        // Fixed end of the scope in the editor (after initial suggestions were applied)
	scopeType: string // "Document", "Selection", or "Paragraph"
) {
	if (Platform.isMobile) return; 

	const menu = new Menu();

	// Helper to re-evaluate and show menu or notice
	const reEvaluateAndShowMenu = () => {
		const updatedScopeText = editor.getRange(scopeStartPos, scopeEndPos);
		if (/==|~~/.test(updatedScopeText)) {
			// Ensure the menu appears near the original spot, not where the mouse just clicked the previous menu
			const coords = editor.cm.coordsAtPos(editor.posToOffset(scopeStartPos));
			const position = coords ? { x: coords.left, y: coords.bottom + 5 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
			// Timeout to allow editor to update and menu to close before showing new one
			setTimeout(() => showSuggestionMenu(plugin, editor, updatedScopeText, originalUntouchedText, scopeStartPos, scopeEndPos, scopeType), 50);
		} else {
			new Notice("✅ All suggestions handled in this block.");
		}
	};

	menu.addItem((item: MenuItem) => {
		item.setTitle("Accept All Suggestions")
			.setIcon("check-check")
			.onClick(() => {
				const acceptedText = removeMarkup(currentScopeTextWithMarkup, "accept");
				editor.replaceRange(acceptedText, scopeStartPos, scopeEndPos);
				new Notice("✅ All suggestions accepted.");
			});
	});

	menu.addItem((item: MenuItem) => {
		item.setTitle("Reject All Suggestions")
			.setIcon("x")
			.onClick(() => {
				editor.replaceRange(originalUntouchedText, scopeStartPos, scopeEndPos);
				new Notice("❌ All suggestions rejected.");
			});
	});

	menu.addSeparator();

	menu.addItem((item: MenuItem) => {
		item.setTitle("Accept Next Suggestion")
			.setIcon("chevron-right") 
			.onClick(() => {
				acceptOrRejectNextSuggestion(editor, "accept");
				reEvaluateAndShowMenu();
			});
	});

	menu.addItem((item: MenuItem) => {
		item.setTitle("Reject Next Suggestion")
			.setIcon("chevron-left") // Changed icon for visual difference
			.onClick(() => {
				acceptOrRejectNextSuggestion(editor, "reject");
				reEvaluateAndShowMenu();
			});
	});

	const coords = editor.cm.coordsAtPos(editor.posToOffset(scopeStartPos));
	if (coords) {
		menu.showAtPosition({ x: coords.left, y: coords.bottom + 5 });
	} else {
		menu.showAtPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
	}
}

//──────────────────────────────────────────────────────────────────────────────

export async function proofreadDocument(plugin: Proofreader, editor: Editor): Promise<void> {
	const noteWithFrontmatter = editor.getValue();
	const bodyStartOffset = getFrontMatterInfo(noteWithFrontmatter).contentStart || 0;
	const originalDocBodyText = noteWithFrontmatter.slice(bodyStartOffset);

	const initialScopeStartPos = editor.offsetToPos(bodyStartOffset);
	// Use the end of the original document body for the initial replacement range
	const initialScopeEndPos = editor.offsetToPos(bodyStartOffset + originalDocBodyText.length);
	const docOriginalRange = { from: initialScopeStartPos, to: initialScopeEndPos };

	const result = await generateSuggestions(plugin, editor, originalDocBodyText, "Document", docOriginalRange);
	if (!result || !result.textWithSuggestions) return;

	// Apply the suggestions to the editor first
	editor.replaceRange(result.textWithSuggestions, docOriginalRange.from, docOriginalRange.to);
	editor.setCursor(docOriginalRange.from); 

	// The new end position of the block containing suggestions
	const actualSuggestionBlockEndOffset = bodyStartOffset + result.textWithSuggestions.length;
	const actualSuggestionBlockEndPos = editor.offsetToPos(actualSuggestionBlockEndOffset);

	showSuggestionMenu(
		plugin,
		editor,
		result.textWithSuggestions, // This is the text now in the editor
		originalDocBodyText,        // Original pre-suggestion text for this scope
		docOriginalRange.from,      // Start of the scope
		actualSuggestionBlockEndPos, // End of the current suggestion block in editor
		"Document"
	);
}

export async function proofreadText(plugin: Proofreader, editor: Editor): Promise<void> {
	const hasMultipleSelections = editor.listSelections().length > 1;
	if (hasMultipleSelections) {
		new Notice("Multiple selections are not supported.");
		return;
	}

	const cursor = editor.getCursor("from");
	const selection = editor.getSelection();
	const originalScopedText = selection || editor.getLine(cursor.line);
	const scopeType = selection ? "Selection" : "Paragraph";

	let initialScopeStartPos: EditorPosition;
	let initialScopeEndPos: EditorPosition;
	let originalContentOffsetStart: number; // To calculate end pos after inserting suggestions

	if (selection) {
		initialScopeStartPos = editor.getCursor("from");
		initialScopeEndPos = editor.getCursor("to");
		originalContentOffsetStart = editor.posToOffset(initialScopeStartPos);
	} else { // Paragraph
		initialScopeStartPos = { line: cursor.line, ch: 0 };
		initialScopeEndPos = { line: cursor.line, ch: originalScopedText.length };
		originalContentOffsetStart = editor.posToOffset(initialScopeStartPos);
	}
	const textOriginalRange = { from: initialScopeStartPos, to: initialScopeEndPos };

	const result = await generateSuggestions(plugin, editor, originalScopedText, scopeType, textOriginalRange);
	if (!result || !result.textWithSuggestions) return;

	// Apply the suggestions to the editor first
	if (selection) {
		editor.replaceSelection(result.textWithSuggestions);
	} else {
		editor.setLine(cursor.line, result.textWithSuggestions);
	}
	editor.setCursor(textOriginalRange.from);

	// The new end position of the block containing suggestions
	const actualSuggestionBlockEndOffset = originalContentOffsetStart + result.textWithSuggestions.length;
	const actualSuggestionBlockEndPos = editor.offsetToPos(actualSuggestionBlockEndOffset);

	showSuggestionMenu(
		plugin,
		editor,
		result.textWithSuggestions, // This is the text now in the editor
		originalScopedText,         // Original pre-suggestion text for this scope
		textOriginalRange.from,     // Start of the scope
		actualSuggestionBlockEndPos,  // End of the current suggestion block in editor
		scopeType
	);
}
