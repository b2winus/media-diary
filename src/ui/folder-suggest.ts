import { AbstractInputSuggest, App, FuzzySuggestModal, TFolder } from "obsidian";
import { t } from "../i18n";

/** 보관소의 모든 폴더 (루트 포함), 경로순 정렬 */
export function listFolders(app: App): TFolder[] {
	return app.vault
		.getAllLoadedFiles()
		.filter((f): f is TFolder => f instanceof TFolder)
		.sort((a, b) => a.path.localeCompare(b.path));
}

export function folderLabel(folder: TFolder): string {
	return folder.isRoot() ? t("folder.root") : folder.path;
}

/** 설정의 폴더 입력칸에 붙는 자동완성 목록 */
export class FolderSuggest extends AbstractInputSuggest<TFolder> {
	private inputEl: HTMLInputElement;
	private onPick: (path: string) => void;

	constructor(app: App, inputEl: HTMLInputElement, onPick: (path: string) => void) {
		super(app, inputEl);
		this.inputEl = inputEl;
		this.onPick = onPick;
	}

	getSuggestions(query: string): TFolder[] {
		const q = query.toLowerCase();
		return listFolders(this.app).filter((f) => f.path.toLowerCase().includes(q));
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folderLabel(folder));
	}

	selectSuggestion(folder: TFolder): void {
		const path = folder.isRoot() ? "" : folder.path;
		this.inputEl.value = path;
		this.inputEl.trigger("input");
		this.onPick(path);
		this.close();
	}
}

/**
 * Asks for a folder each time a note is created. The default folder is listed first.
 * onDone receives the chosen path, or null if the user cancelled.
 */
export class FolderPickModal extends FuzzySuggestModal<TFolder> {
	private defaultPath: string;
	private onDone: (path: string | null) => void;
	private chosen: string | null = null;

	constructor(app: App, defaultPath: string, onDone: (path: string | null) => void) {
		super(app);
		this.defaultPath = defaultPath;
		this.onDone = onDone;
		this.setPlaceholder(t("folder.placeholder"));
		this.setInstructions([
			{ command: "↑↓", purpose: t("folder.move") },
			{ command: "↵", purpose: t("folder.choose") },
			{ command: "esc", purpose: t("folder.cancel") },
		]);
	}

	getItems(): TFolder[] {
		const folders = listFolders(this.app);
		const i = folders.findIndex((f) => (f.isRoot() ? "" : f.path) === this.defaultPath);
		if (i > 0) folders.unshift(folders.splice(i, 1)[0]);
		return folders;
	}

	getItemText(folder: TFolder): string {
		const label = folderLabel(folder);
		const path = folder.isRoot() ? "" : folder.path;
		return path === this.defaultPath ? `${label}  ${t("folder.default")}` : label;
	}

	onChooseItem(folder: TFolder): void {
		this.chosen = folder.isRoot() ? "" : folder.path;
	}

	onClose(): void {
		super.onClose();
		// onChooseItem runs right after close, so wait a tick before reporting.
		window.setTimeout(() => this.onDone(this.chosen), 0);
	}
}
