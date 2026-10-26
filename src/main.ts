import { MarkdownView, Notice, Plugin, TFile, TFolder, normalizePath } from "obsidian";
import { DEFAULT_SETTINGS, MediaDiarySettingTab, MediaDiarySettings } from "./settings";
import { MediaSearchModal } from "./ui/search-modal";
import { ReviewModal } from "./ui/review-modal";
import { FolderPickModal } from "./ui/folder-suggest";
import { ContentLang, MediaItem, MediaType, SearchOptions, groupOf } from "./types";
import { RenderExtras, defaultTemplate, frontmatterFields, isDefaultTemplate, makeFileName, renderTemplate } from "./template";
import { asMediaType, defaultStatusLabel } from "./status";
import { Key, Lang, getLang, setLanguage, t } from "./i18n";

/** 사용자가 직접 기록하는 값: '작품 정보 채우기'가 절대 덮어쓰지 않는다. */
const PERSONAL_FIELDS = ["status", "my_rating", "stars", "one_liner", "watched_dates", "title_track", "fav_tracks", "last_chapter"];

export default class MediaDiaryPlugin extends Plugin {
	settings!: MediaDiarySettings;
	private ribbonEl: HTMLElement | null = null;
	private appliedLang: Lang | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.ribbonEl = this.addRibbonIcon("clapperboard", t("cmd.create"), () =>
			this.openSearch("", this.settings.lastType, (item) => this.createNote(item)),
		);
		this.registerCommands();

		this.addSettingTab(new MediaDiarySettingTab(this.app, this));
	}

	/** 명령은 등록할 때의 이름으로 남으므로, 언어가 바뀌면 지우고 새 이름으로 다시 등록한다. */
	private registerCommands(): void {
		for (const id of ["add-to-diary", "review-current-note", "add-quote-or-memo", "fill-current-note"]) this.removeCommand(id);

		this.addCommand({
			id: "add-to-diary",
			name: t("cmd.create"),
			callback: () => this.openSearch("", this.settings.lastType, (item) => this.createNote(item)),
		});

		this.addCommand({
			id: "review-current-note",
			name: t("cmd.review"),
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
				if (!file) return false;
				if (!checking) new ReviewModal(this.app, file).open();
				return true;
			},
		});

		this.addCommand({
			id: "add-quote-or-memo",
			name: t("cmd.note"),
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
				if (!file) return false;
				if (!checking) new ReviewModal(this.app, file, { mode: "note" }).open();
				return true;
			},
		});

		this.addCommand({
			id: "fill-current-note",
			name: t("cmd.fill"),
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
				if (!file) return false;
				if (!checking) {
					const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
					const type = asMediaType(fm?.["type"]) ?? this.settings.lastType;
					this.openSearch(this.guessQuery(file), type, (item) => this.fillFrontmatter(file, item));
				}
				return true;
			},
		});
		this.appliedLang = getLang();
	}

	/** 화면 언어를 지금 바로 적용한다: 명령 이름, 리본 아이콘 설명. */
	private applyLanguage(): void {
		setLanguage(this.settings.language);
		if (this.appliedLang === getLang()) return;
		this.ribbonEl?.setAttr("aria-label", t("cmd.create"));
		this.registerCommands();
	}

	contentLang(): ContentLang {
		const c = this.settings.contentLang;
		return c === "auto" ? getLang() : c;
	}

	searchOptions(): SearchOptions {
		return {
			tmdbKey: this.settings.tmdbKey,
			contentLang: this.contentLang(),
			musicStore: this.settings.musicStore,
			maxResults: this.settings.maxResults,
		};
	}

	defaultSubfolder(type: MediaType): string {
		return t(`sub.${type}` as Key);
	}

	private openSearch(initialQuery: string, type: MediaType, onChoose: (item: MediaItem) => void | Promise<void>): void {
		new MediaSearchModal(this.app, {
			initialQuery,
			type,
			options: this.searchOptions(),
			onTypeChange: (next) => {
				this.settings.lastType = next;
				void this.saveSettings();
			},
			onChoose,
		}).open();
	}

	/** 프런트매터의 title_ko → title → 파일 이름 순으로 검색어를 추정 */
	private guessQuery(file: TFile): string {
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		for (const key of ["title_ko", "title", "title_en"]) {
			const v: unknown = fm?.[key];
			if (typeof v === "string" && v.trim()) return v.trim();
		}
		return file.basename.replace(/\s*\(\d{4}\)\s*$/, "");
	}

	private extras(item: MediaItem): RenderExtras {
		return { status: defaultStatusLabel(item.type, this.settings.defaultStatus) };
	}

	private targetFolder(type: MediaType): string {
		const base = this.settings.folder.trim();
		if (!this.settings.useSubfolders) return base;
		const sub = this.settings.subfolders[type] || this.defaultSubfolder(type);
		return [base, sub].filter(Boolean).join("/");
	}

	async createNote(item: MediaItem): Promise<void> {
		const folder = this.settings.askFolderEachTime ? await this.pickFolder(this.targetFolder(item.type)) : this.targetFolder(item.type);
		if (folder === null) return; // 폴더 선택 취소
		if (folder) await this.ensureFolder(folder);

		const extras = this.extras(item);
		const fileName = makeFileName(this.settings.fileNameTemplate, item, extras);
		const path = normalizePath(folder ? `${folder}/${fileName}.md` : `${fileName}.md`);

		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			new Notice(t("notice.exists", { name: existing.basename }));
			await this.app.workspace.getLeaf(false).openFile(existing);
			return;
		}

		const content = renderTemplate(this.noteTemplate(item.type), item, extras);
		const file = await this.app.vault.create(path, content);
		new Notice(t("notice.created", { name: file.basename }));
		if (this.settings.openAfterCreate) {
			await this.app.workspace.getLeaf(false).openFile(file);
		}
		if (this.settings.reviewAfterCreate) {
			new ReviewModal(this.app, file, { type: item.type, status: this.settings.defaultStatus }).open();
		}
	}

	/** 폴더 선택 창을 띄워 경로를 돌려준다. 취소하면 null */
	private pickFolder(defaultPath: string): Promise<string | null> {
		return new Promise((resolve) => {
			new FolderPickModal(this.app, defaultPath, resolve).open();
		});
	}

	async fillFrontmatter(file: TFile, item: MediaItem): Promise<void> {
		const fields = frontmatterFields(item, this.extras(item));
		const overwrite = this.settings.overwriteFrontmatter;
		let changed = 0;
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			for (const [key, value] of Object.entries(fields)) {
				if (PERSONAL_FIELDS.includes(key) || isEmpty(value)) continue;
				if (!overwrite && !isEmpty(fm[key])) continue;
				fm[key] = value;
				changed++;
			}
			if (isEmpty(fm["status"])) {
				fm["status"] = this.extras(item).status;
				changed++;
			}
		});
		new Notice(changed ? t("notice.filled", { count: changed }) : t("notice.nothingToFill"));
	}

	private async ensureFolder(folder: string): Promise<void> {
		const path = normalizePath(folder);
		const f = this.app.vault.getAbstractFileByPath(path);
		if (f instanceof TFolder) return;
		if (f) throw new Error(t("notice.notFolder", { path }));
		// 중간 폴더까지 한 번에 만든다.
		const parts = path.split("/");
		for (let i = 1; i <= parts.length; i++) {
			const p = parts.slice(0, i).join("/");
			if (!this.app.vault.getAbstractFileByPath(p)) await this.app.vault.createFolder(p);
		}
	}

	noteTemplate(type: MediaType): string {
		const group = groupOf(type);
		return this.settings.templates[group] || defaultTemplate(group, getLang());
	}

	async loadSettings(): Promise<void> {
		const saved = (await this.loadData()) as Partial<MediaDiarySettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved ?? {});
		// 중첩 객체는 빠진 키가 없도록 기본값과 합친다.
		this.settings.subfolders = Object.assign({}, DEFAULT_SETTINGS.subfolders, saved?.subfolders ?? {});
		this.settings.templates = Object.assign({}, DEFAULT_SETTINGS.templates, saved?.templates ?? {});
		for (const g of ["video", "comic", "music"] as const) {
			if (isDefaultTemplate(this.settings.templates[g])) this.settings.templates[g] = "";
		}
		if (!asMediaType(this.settings.lastType)) this.settings.lastType = "movie";
		setLanguage(this.settings.language);
	}

	async saveSettings(): Promise<void> {
		this.applyLanguage();
		await this.saveData(this.settings);
	}
}

function isEmpty(v: unknown): boolean {
	return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}
