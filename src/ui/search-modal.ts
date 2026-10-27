import { App, ButtonComponent, DropdownComponent, Modal, Notice, TextComponent } from "obsidian";
import { MEDIA_TYPES, MediaItem, MediaType, SearchOptions, providerOf } from "../types";
import { detailMedia, providerName, searchMedia } from "../providers";
import { Key, t, tMaybe } from "../i18n";

export interface SearchModalConfig {
	initialQuery: string;
	type: MediaType;
	options: SearchOptions;
	/** 유형을 바꾸면 다음에도 그 유형으로 시작하도록 알린다. */
	onTypeChange?: (type: MediaType) => void;
	/** 상세 정보까지 채운 항목을 넘긴다. */
	onChoose: (item: MediaItem) => void | Promise<void>;
}

/**
 * 유형 선택 → 검색어 입력 → 결과 목록 → 선택까지 한 화면에서 처리한다.
 * ↑/↓로 이동, Enter로 검색(입력창) 또는 선택(결과).
 */
export class MediaSearchModal extends Modal {
	private cfg: SearchModalConfig;
	private type: MediaType;
	private input!: TextComponent;
	private statusEl!: HTMLElement;
	private listEl!: HTMLElement;
	private results: MediaItem[] = [];
	private selected = -1;
	private busy = false;

	constructor(app: App, cfg: SearchModalConfig) {
		super(app);
		this.cfg = cfg;
		this.type = cfg.type;
	}

	onOpen(): void {
		const { contentEl } = this;
		this.modalEl.addClass("media-diary-modal");
		this.titleEl.setText(t("modal.title"));

		const bar = contentEl.createDiv({ cls: "media-diary-search-bar" });
		const dd = new DropdownComponent(bar);
		for (const type of MEDIA_TYPES) dd.addOption(type, t(`type.${type}` as Key));
		dd.setValue(this.type);
		dd.onChange((v) => {
			this.type = v as MediaType;
			this.input.setPlaceholder(this.placeholder());
			this.cfg.onTypeChange?.(this.type);
			if (this.input.getValue().trim()) void this.runSearch();
			else this.input.inputEl.focus();
		});

		this.input = new TextComponent(bar);
		this.input.setPlaceholder(this.placeholder()).setValue(this.cfg.initialQuery);
		this.input.inputEl.addClass("media-diary-search-input");

		new ButtonComponent(bar).setButtonText(t("modal.search")).setCta().onClick(() => void this.runSearch());

		this.statusEl = contentEl.createDiv({ cls: "media-diary-status" });
		this.listEl = contentEl.createDiv({ cls: "media-diary-results" });

		this.input.inputEl.addEventListener("keydown", (e) => this.onKey(e));
		window.setTimeout(() => this.input.inputEl.focus(), 0);

		if (this.cfg.initialQuery.trim()) void this.runSearch();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private onKey(e: KeyboardEvent): void {
		if (e.isComposing) return; // 한글 조합 중 Enter 무시
		if (e.key === "ArrowDown" && this.results.length) {
			e.preventDefault();
			this.select(Math.min(this.selected + 1, this.results.length - 1));
		} else if (e.key === "ArrowUp" && this.results.length) {
			e.preventDefault();
			this.select(Math.max(this.selected - 1, 0));
		} else if (e.key === "Enter") {
			e.preventDefault();
			const item = this.results[this.selected];
			if (this.selected >= 0 && item) void this.choose(item);
			else void this.runSearch();
		}
	}

	private async runSearch(): Promise<void> {
		const query = this.input.getValue().trim();
		if (!query || this.busy) return;
		this.busy = true;
		this.results = [];
		this.selected = -1;
		this.listEl.empty();
		this.statusEl.setText(t("modal.searching", { provider: providerName(providerOf(this.type)) }));
		try {
			const items = await searchMedia(this.type, query, this.cfg.options);
			this.results = items;
			if (!items.length) {
				this.statusEl.setText(t("modal.none"));
			} else {
				this.statusEl.setText(t("modal.count", { count: items.length }));
				this.renderResults();
			}
		} catch (err) {
			this.statusEl.setText(err instanceof Error ? err.message : String(err));
			console.error("[Media Diary]", err);
		} finally {
			this.busy = false;
		}
	}

	private placeholder(): string {
		return t(this.type === "album" ? "modal.placeholderMusic" : "modal.placeholder");
	}

	private metaLine(item: MediaItem): string {
		const year = item.date.slice(0, 4);
		if (item.type === "album") {
			const kind = item.releaseType ? tMaybe(`release.${item.releaseType}`) : "";
			const tracks = item.trackCount ? t("modal.tracks", { count: item.trackCount }) : "";
			const song = item.matchedTrack ? t("modal.matchedTrack", { name: item.matchedTrack }) : "";
			return [item.artists.join(", "), kind, year, tracks, song].filter(Boolean).join(" · ");
		}
		const people = [...item.writers, ...item.studios].slice(0, 2).join(", ");
		const original = item.titleOriginal && item.titleOriginal !== item.title ? item.titleOriginal : "";
		return [original, year, item.countries.join(", "), people].filter(Boolean).join(" · ");
	}

	private renderResults(): void {
		this.listEl.empty();
		this.results.forEach((item, i) => {
			const row = this.listEl.createDiv({ cls: "media-diary-result" });
			const coverBox = row.createDiv({ cls: "media-diary-cover" });
			if (item.type === "album") coverBox.addClass("is-square");
			if (item.thumbnailUrl) {
				coverBox.createEl("img", { attr: { src: item.thumbnailUrl, alt: "", loading: "lazy" } });
			}
			const info = row.createDiv({ cls: "media-diary-info" });
			info.createDiv({ cls: "media-diary-title", text: item.title || item.titleOriginal });
			info.createDiv({ cls: "media-diary-meta", text: this.metaLine(item) });
			if (item.overview) {
				info.createDiv({ cls: "media-diary-meta media-diary-faint", text: item.overview.replace(/\s+/g, " ").slice(0, 120) });
			}
			row.addEventListener("mouseenter", () => this.select(i, false));
			row.addEventListener("click", () => void this.choose(item));
		});
	}

	private select(i: number, scroll = true): void {
		const rows = Array.from(this.listEl.children) as HTMLElement[];
		rows.forEach((r, idx) => r.toggleClass("is-selected", idx === i));
		this.selected = i;
		if (scroll) rows[i]?.scrollIntoView({ block: "nearest" });
	}

	private async choose(item: MediaItem): Promise<void> {
		if (this.busy) return;
		this.busy = true;
		this.statusEl.setText(t("modal.loading"));
		let full: MediaItem;
		try {
			full = await detailMedia(item, this.cfg.options);
		} catch (err) {
			// 상세 정보를 못 받아도 검색 결과만으로 노트를 만든다.
			console.error("[Media Diary]", err);
			full = item;
		} finally {
			this.busy = false;
		}
		this.close();
		try {
			await this.cfg.onChoose(full);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			new Notice(t("modal.failed", { error: msg }));
			console.error("[Media Diary]", err);
		}
	}
}
