import { App, ButtonComponent, Modal, Notice, Setting, TFile, TextAreaComponent } from "obsidian";
import { MediaGroup, MediaType, groupOf } from "../types";
import { StatusKey, asMediaType, parseStatus, statusKeys, statusLabel } from "../status";
import { todayString } from "../template";
import { addToBody, starString } from "../note-body";
import { Key, t } from "../i18n";

export interface ReviewDefaults {
	type?: MediaType;
	status?: StatusKey;
	/** "full": 상태·별점·한줄평·문구·메모 / "note": 문구·메모만 */
	mode?: "full" | "note";
}

/** 0.5 단위로 맞추고 0~5 사이로 자른다. */
export function clampRating(v: number): number {
	if (!isFinite(v)) return 0;
	return Math.min(5, Math.max(0, Math.round(v * 2) / 2));
}

/** 별 줄의 가로 위치(0~1)를 별점으로 바꾼다. 별 하나의 왼쪽 절반은 반 개. */
export function ratingAt(fraction: number): number {
	return clampRating(Math.ceil(Math.min(1, Math.max(0, fraction)) * 10) / 2) || 0.5;
}

/** 저장된 별점(숫자 또는 ★ 문자열)을 숫자로 */
export function parseRating(value: unknown): number {
	if (typeof value === "number") return clampRating(value);
	if (typeof value === "string") {
		const v = value.trim();
		if (!v) return 0;
		if (/^[★☆½\s]+$/.test(v)) return clampRating((v.match(/★/g) ?? []).length + (v.includes("½") ? 0.5 : 0));
		const n = Number(v);
		return isFinite(n) ? clampRating(n) : 0;
	}
	return 0;
}

/**
 * 별점(5점 만점, 0.5 단위)·상태·한줄평·남기고 싶은 문구·메모·감상 날짜를 한 번에 남기는 창.
 * 별점·상태·한줄평·날짜는 프런트매터에, 문구와 메모는 본문 섹션에 저장한다.
 */
export class ReviewModal extends Modal {
	private file: TFile;
	private type: MediaType;
	private group: MediaGroup;
	private mode: "full" | "note";
	private status: StatusKey;
	private rating = 0;
	private oneLiner = "";
	private quote = "";
	private source = "";
	private memo = "";
	private date = todayString();
	private addDate = true;
	private starsEl: HTMLElement | null = null;
	private ratingText: HTMLElement | null = null;
	private toggleSetter: ((v: boolean) => void) | null = null;

	constructor(app: App, file: TFile, defaults: ReviewDefaults = {}) {
		super(app);
		this.file = file;
		const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
		this.type = asMediaType(fm["type"]) ?? defaults.type ?? "movie";
		this.group = groupOf(this.type);
		this.mode = defaults.mode ?? "full";
		this.status = parseStatus(this.group, fm["status"]) ?? defaults.status ?? "done";
		this.rating = parseRating(fm["my_rating"]);
		this.oneLiner = typeof fm["one_liner"] === "string" ? fm["one_liner"] : "";
	}

	onOpen(): void {
		const { contentEl } = this;
		const full = this.mode === "full";
		this.modalEl.addClass("media-diary-review");
		this.titleEl.setText(`${t(full ? "review.title" : "review.noteTitle")} · ${this.file.basename}`);

		if (full) {
			new Setting(contentEl).setName(t("review.status")).addDropdown((dd) => {
				for (const k of statusKeys(this.group)) dd.addOption(k, statusLabel(this.group, k));
				dd.setValue(this.status).onChange((v) => {
					this.status = v as StatusKey;
					this.addDate = this.status === "done";
					this.toggleSetter?.(this.addDate);
				});
			});

			const ratingSetting = new Setting(contentEl).setName(t("review.rating")).setDesc(t("review.ratingDesc"));
			ratingSetting.settingEl.addClass("media-diary-rating-setting");
			this.renderStars(ratingSetting.controlEl);

			new Setting(contentEl).setName(t("review.oneLiner")).addText((tx) => {
				tx.setPlaceholder(t("review.oneLinerPlaceholder"))
					.setValue(this.oneLiner)
					.onChange((v) => (this.oneLiner = v));
				tx.inputEl.addClass("media-diary-oneliner");
			});
		}

		let quoteArea: TextAreaComponent | null = null;
		this.textArea(contentEl, t("review.quote"), t(`review.quoteDesc.${this.group}` as Key), t(`review.quotePlaceholder.${this.group}` as Key), 3, (v) => (this.quote = v), (ta) => (quoteArea = ta));
		new Setting(contentEl).setName(t("review.source")).addText((tx) => {
			tx.setPlaceholder(t(`review.sourcePlaceholder.${this.group}` as Key)).onChange((v) => (this.source = v));
			tx.inputEl.addClass("media-diary-oneliner");
		});
		this.textArea(contentEl, t("review.memo"), t("review.memoDesc"), t("review.memoPlaceholder"), 4, (v) => (this.memo = v));

		new Setting(contentEl).setName(t("review.date")).addText((tx) => {
			tx.inputEl.type = "date";
			tx.setValue(this.date).onChange((v) => (this.date = v));
		});

		if (full) {
			new Setting(contentEl)
				.setName(t("review.addDate"))
				.setDesc(t("review.addDateDesc"))
				.addToggle((tg) => {
					this.toggleSetter = (v: boolean) => tg.setValue(v);
					this.addDate = this.status === "done";
					tg.setValue(this.addDate).onChange((v) => (this.addDate = v));
				});
		}

		const footer = contentEl.createDiv({ cls: "modal-button-container" });
		footer.createSpan({ cls: "media-diary-hint", text: t("review.saveHint") });
		new ButtonComponent(footer).setButtonText(t("review.save")).setCta().onClick(() => void this.save());

		this.scope.register(["Mod"], "Enter", (e) => {
			e.preventDefault();
			void this.save();
			return false;
		});

		window.setTimeout(() => {
			if (full) this.starsEl?.focus();
			else (quoteArea as TextAreaComponent | null)?.inputEl.focus();
		}, 0);
	}

	private textArea(
		el: HTMLElement,
		name: string,
		desc: string,
		placeholder: string,
		rows: number,
		onChange: (v: string) => void,
		onCreate?: (ta: TextAreaComponent) => void,
	): void {
		const s = new Setting(el).setName(name).setDesc(desc);
		s.settingEl.addClass("media-diary-textarea-setting");
		s.addTextArea((ta) => {
			ta.setPlaceholder(placeholder).onChange(onChange);
			ta.inputEl.rows = rows;
			ta.inputEl.addClass("media-diary-textarea");
			onCreate?.(ta);
		});
	}

	private renderStars(el: HTMLElement): void {
		const wrap = el.createDiv({ cls: "media-diary-stars-wrap" });
		const stars = wrap.createDiv({
			cls: "media-diary-stars",
			attr: { tabindex: "0", role: "slider", "aria-valuemin": "0", "aria-valuemax": "5", "aria-label": t("review.rating") },
		});
		this.starsEl = stars;
		for (let i = 0; i < 5; i++) stars.createSpan({ cls: "media-diary-star", text: "★" });
		this.ratingText = wrap.createSpan({ cls: "media-diary-rating-text" });

		const fractionOf = (e: MouseEvent) => {
			const rect = stars.getBoundingClientRect();
			return rect.width ? (e.clientX - rect.left) / rect.width : 0;
		};
		stars.addEventListener("mousemove", (e) => this.paint(ratingAt(fractionOf(e))));
		stars.addEventListener("mouseleave", () => this.paint(this.rating));
		stars.addEventListener("click", (e) => {
			this.rating = ratingAt(fractionOf(e));
			this.paint(this.rating);
		});
		stars.addEventListener("keydown", (e) => {
			if (e.key === "ArrowRight" || e.key === "ArrowUp") this.rating = clampRating(this.rating + 0.5);
			else if (e.key === "ArrowLeft" || e.key === "ArrowDown") this.rating = clampRating(this.rating - 0.5);
			else if (e.key === "0" || e.key === "Backspace" || e.key === "Delete") this.rating = 0;
			else if (/^[1-5]$/.test(e.key)) this.rating = Number(e.key);
			else return;
			e.preventDefault();
			this.paint(this.rating);
		});

		const clear = wrap.createEl("button", { cls: "clickable-icon media-diary-clear", attr: { "aria-label": t("review.clear") } });
		clear.setText("×");
		clear.addEventListener("click", () => {
			this.rating = 0;
			this.paint(0);
		});

		this.paint(this.rating);
	}

	private paint(value: number): void {
		if (!this.starsEl || !this.ratingText) return;
		const stars = Array.from(this.starsEl.children) as HTMLElement[];
		stars.forEach((s, i) => {
			s.toggleClass("is-full", value >= i + 1);
			s.toggleClass("is-half", value === i + 0.5);
		});
		this.starsEl.setAttr("aria-valuenow", String(value));
		this.ratingText.setText(value ? `${starString(value)}  ${value}` : t("review.noRating"));
	}

	private async save(): Promise<void> {
		const full = this.mode === "full";
		const date = /^\d{4}-\d{2}-\d{2}$/.test(this.date) ? this.date : "";
		const hasBody = !!(this.quote.trim() || this.memo.trim());
		if (!full && !hasBody) {
			new Notice(t("review.nothing"));
			return;
		}

		if (full) {
			const statusText = statusLabel(this.group, this.status);
			const rating = this.rating;
			const oneLiner = this.oneLiner.trim();
			const addDate = this.addDate && !!date;
			await this.app.fileManager.processFrontMatter(this.file, (fm: Record<string, unknown>) => {
				fm["status"] = statusText;
				fm["my_rating"] = rating ? rating : null;
				fm["stars"] = rating ? starString(rating) : null;
				fm["one_liner"] = oneLiner || null;
				if (addDate) {
					const prev = Array.isArray(fm["watched_dates"]) ? (fm["watched_dates"] as unknown[]).map(String) : [];
					if (!prev.includes(date)) prev.push(date);
					fm["watched_dates"] = prev.sort();
				}
			});
		}

		if (hasBody) {
			const additions = { group: this.group, quote: this.quote, source: this.source, memo: this.memo, date };
			await this.app.vault.process(this.file, (content) => addToBody(content, additions));
		}

		new Notice(t("review.saved", { name: this.file.basename }));
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
