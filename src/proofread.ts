import { type Change, diffWords, diffWordsWithSpace } from "diff";
import { type Editor, getFrontMatterInfo, Notice } from "obsidian";
import { rejectChanges } from "src/accept-reject-suggestions";
import type Proofreader from "src/main";
import type { ModelName, ProviderAdapter } from "src/providers/adapter";
import { MODEL_SPECS, PROVIDER_REQUEST_MAP } from "src/providers/model-info";
import type { ProofreaderSettings } from "src/settings";

function getDiffMarkdown(
	settings: ProofreaderSettings,
	oldText: string,
	newText: string,
	isOverlength?: boolean,
): { textWithSuggestions: string; changeCount: number } {
	console.debug("[Proofreader plugin] old text:", oldText);
	console.debug("[Proofreader plugin] new text:", newText);

	// ENSURE SAME AMOUNT OF SURROUNDING WHITESPACE
	// (A selection can have surrounding whitespace, but the AI response usually
	// removes those. This results in the text effectively being trimmed.)
	const leadingWhitespace = oldText.match(/^(\s*)/)?.[0] || "";
	const trailingWhitespace = oldText.match(/(\s*)$/)?.[0] || "";
	newText = newText.replace(/^(\s*)/, leadingWhitespace).replace(/(\s*)$/, trailingWhitespace);

	// GET DIFF https://github.com/kpdecker/jsdiff#readme
	const diffWithSpace = diffWordsWithSpace(oldText, newText);
	const diffRegular = diffWords(oldText, newText);
	const diff = settings.diffWithSpace ? diffWithSpace : diffRegular;
	console.debug("[Proofreader plugin] regular diff:", diffRegular);
	console.debug("[Proofreader plugin] diff with space:", diffWithSpace);
	const use = settings.diffWithSpace ? "diff with space" : "regular diff";
	console.debug("[Proofreader plugin] using:", use);

	if (isOverlength) {
		// do not remove text after cutoff-length
		(diff.at(-1) as Change).removed = false;
		const cutOffCallout =
			"\n\n" +
			"> [!INFO] End of proofreading\n" +
			"> The input text was too long. Text after this point is unchanged." +
			"\n\n";
		diff.splice(-2, 0, {
			added: false,
			removed: false,
			value: cutOffCallout,
			count: cutOffCallout.length,
		});
	}

	// CONVERT DIFF TO TEXT
	// with ==highlights== and ~~strikethrough~~ as suggestions
	let textWithChanges = diff
		.map((part) => {
			if (!part.added && !part.removed) return part.value;
			const withMarkup = part.added ? `==${part.value}==` : `~~${part.value}~~`;

			// FIX for Obsidian live preview: leading spaces result in missing markup
			const fixedForObsidian = withMarkup.replace(/^(==|~~)( )/, "$2$1");
			return fixedForObsidian;
		})
		.join("");
	console.debug("[Proofreader plugin] text with changes:", textWithChanges);

	// FIX for Obsidian live preview: isolated trailing markup rendered wrong
	textWithChanges = textWithChanges.replace(/(==|~~)([^=~]+) \1 /g, "$1$2$1 ");

	// CLEANUP
	textWithChanges = textWithChanges
		.replace(/~~\[\^\w+\]~~/g, "$1") // preserve footnotes
		.replace(/~~(.+?)(.{1,2})~~==(\1)==/g, "$1~~$2~~") // only removal of 1-2 char, e.g. plural-s
		.replace(/~~(.+?)~~==(?:\1)(.{1,2})==/g, "$1==$2==") // only addition of 1-2 char
		.replace(/ {2}(?!$)/gm, " "); // rare double spaces created by diff (not EoL due to 2-space-rule)

	// PRESERVE SPECIAL CONTENT
	if (settings.preserveItalicAndBold) {
		// bold/italic can be via * or _
		textWithChanges = textWithChanges.replace(/~~(\*\*?|__?)~~/g, "$1");
	}
	if (settings.preserveNonSmartPuncation) {
		textWithChanges = textWithChanges
			.replace(/~~"~~==[“”]==/g, '"') // preserve non-smart quotes
			.replace(/~~'~~==[‘’]==/g, "'")
			.replace(/(\d)~~-~~==–==(\d)/g, "$1-$2"); // preserve non-smart dashes in number ranges
	}
	if (settings.preserveBlockquotes) {
		textWithChanges = textWithChanges
			.replace(/^~~>~~/gm, ">") // if AI removes blockquote marker
			.replace(/^~~(>[^~=]*)~~$/gm, "$1") // if AI removes blockquote itself
			.replace(/^>.*/gm, (blockquote) => rejectChanges(blockquote));
	}
	if (settings.preserveTextInsideQuotes) {
		textWithChanges = textWithChanges.replace(/"[^"]+"/g, (quote) => rejectChanges(quote));
	}
	console.debug("[Proofreader plugin] text after cleanup:", textWithChanges);

	const changeCount = (textWithChanges.match(/==|~~/g)?.length || 0) / 2;
	return { textWithSuggestions: textWithChanges, changeCount: changeCount };
}

async function validateAndGetChangesAndNotify(
	plugin: Proofreader,
	oldText: string,
	scope: string,
): Promise<string | undefined> {
	const { app, settings } = plugin;

	// GUARD outdated model
	const model = MODEL_SPECS[settings.model as ModelName];
	if (!model) {
		const errmsg = `! The model "${settings.model}" is outdated. Please select a more recent one in the settings.`;
		new Notice(errmsg, 10_000);
		return;
	}
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
	let msgBeforeRequest = `🤖 ${scope} is being proofread…`;
	if (longInput) {
		msgBeforeRequest += "\n\nDue to the length of the text, this may take a moment.";
		if (veryLongInput) msgBeforeRequest += " (A minute or longer.)";
		msgBeforeRequest +=
			"\n\nDo not go to a different file or change the original text in the meantime.";
	}
	const notice = new Notice(msgBeforeRequest, 0);

	// perform request
	const requestFunc: ProviderAdapter = PROVIDER_REQUEST_MAP[model.provider];
	const { newText, isOverlength } = (await requestFunc(settings, oldText)) || {};
	notice.hide();
	if (!newText) return;

	// check if active file changed
	const fileAfter = app.workspace.getActiveFile()?.path;
	if (fileBefore !== fileAfter) {
		const errmsg = "! The active file changed since the proofread has been triggered. Aborting.";
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
	if (textWithSuggestions === oldText) {
		// eslint-disable-next-line obsidianmd/ui/sentence-case -- PENDING https://github.com/obsidianmd/eslint-plugin/issues/71
		new Notice("✅ Text is good, nothing to change.", notifDuration);
		return;
	}

	// notify on changes
	if (isOverlength) {
		const msg =
			"Text is longer than the maximum output supported by the AI model.\n\n" +
			"Suggestions are thus only made until the cut-off point.";
		new Notice(msg, 10_000);
	}
	const pluralS = changeCount === 1 ? "" : "s";
	new Notice(`🤖 ${changeCount} change${pluralS} made.`, notifDuration);

	return textWithSuggestions;
}

//──────────────────────────────────────────────────────────────────────────────

// prevent multiple requests, e.g., when accidentally using hotkey twice
let isProofreading = false;

export async function proofreadDocument(plugin: Proofreader, editor: Editor): Promise<void> {
	if (isProofreading) {
		new Notice("Already processing a proofreading request.");
		return;
	}
	isProofreading = true;
	const noteWithFrontmatter = editor.getValue();
	const bodyStart = getFrontMatterInfo(noteWithFrontmatter).contentStart || 0;
	const bodyEnd = noteWithFrontmatter.length;
	const oldText = noteWithFrontmatter.slice(bodyStart);

	const changes = await validateAndGetChangesAndNotify(plugin, oldText, "Document");
	isProofreading = false;
	if (!changes) return;

	const bodyStartPos = editor.offsetToPos(bodyStart);
	const bodyEndPos = editor.offsetToPos(bodyEnd);
	editor.replaceRange(changes, bodyStartPos, bodyEndPos);
	editor.setCursor(bodyStartPos); // to start of doc
}

export async function proofreadText(plugin: Proofreader, editor: Editor): Promise<void> {
	if (isProofreading) {
		new Notice("Already processing a proofreading request.");
		return;
	}
	isProofreading = true;
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
	isProofreading = false;
	if (!changes) return;

	if (selection) {
		editor.replaceSelection(changes);
		editor.setCursor(cursor); // to start of selection
	} else {
		editor.setLine(cursor.line, changes);
		editor.setCursor({ line: cursor.line, ch: 0 }); // to start of paragraph
	}
}
