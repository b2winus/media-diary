import {
	App,
	Notice,
	PluginSettingTab,
	Setting,
	SettingDefinition,
	SettingDefinitionGroup,
	SettingDefinitionItem,
	SettingGroup,
	requireApiVersion,
} from "obsidian";
import type MediaDiaryPlugin from "./main";
import { ContentLang, MEDIA_TYPES, MediaGroup, MediaType } from "./types";
import { searchTmdb } from "./providers/tmdb";
import { FolderSuggest } from "./ui/folder-suggest";
import { DEFAULT_FILENAME_TEMPLATE, TEMPLATE_VARIABLES, defaultTemplate } from "./template";
import { Key, LangSetting, detectObsidianLanguage, getLang, t } from "./i18n";

export interface MediaDiarySettings {
	language: LangSetting;
	contentLang: "auto" | ContentLang;
	tmdbKey: string;
	musicStore: string;
	maxResults: number;
	folder: string;
	useSubfolders: boolean;
	/** 비어 있으면 화면 언어의 기본 이름을 쓴다. */
	subfolders: Record<MediaType, string>;
	askFolderEachTime: boolean;
	fileNameTemplate: string;
	defaultStatus: "done" | "want";
	openAfterCreate: boolean;
	reviewAfterCreate: boolean;
	/** 비어 있으면 화면 언어의 기본 템플릿을 쓴다. */
	templates: Record<MediaGroup, string>;
	overwriteFrontmatter: boolean;
	lastType: MediaType;
}

export const DEFAULT_SETTINGS: MediaDiarySettings = {
	language: "auto",
	contentLang: "auto",
	tmdbKey: "",
	musicStore: "KR",
	maxResults: 20,
	folder: "Media Diary",
	useSubfolders: true,
	subfolders: { movie: "", series: "", anime: "", webtoon: "", manga: "", album: "" },
	askFolderEachTime: false,
	fileNameTemplate: DEFAULT_FILENAME_TEMPLATE,
	defaultStatus: "done",
	openAfterCreate: true,
	reviewAfterCreate: true,
	templates: { video: "", comic: "", music: "" },
	overwriteFrontmatter: false,
	lastType: "movie",
};

const GROUP_LABEL: Record<MediaGroup, Key> = {
	video: "set.templateVideo",
	comic: "set.templateComic",
	music: "set.templateMusic",
};

/**
 * 설정은 getSettingDefinitions()에 한 번만 적는다.
 * Obsidian 1.13+는 이를 선언형으로 그리고(설정 검색에도 잡힘),
 * 그보다 낮은 버전은 display()가 같은 정의를 Setting API로 그린다.
 */
export class MediaDiarySettingTab extends PluginSettingTab {
	plugin: MediaDiaryPlugin;

	constructor(app: App, plugin: MediaDiaryPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	// ── Storage ─────────────────────────────

	getControlValue(key: string): unknown {
		const s = this.plugin.settings;
		if (key.startsWith("sub_")) {
			const type = key.slice(4) as MediaType;
			return s.subfolders[type] || this.plugin.defaultSubfolder(type);
		}
		return (s as unknown as Record<string, unknown>)[key];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const s = this.plugin.settings;
		let v = value;
		if (typeof v === "string") {
			if (key === "folder" || key.startsWith("sub_")) v = v.trim().replace(/^\/+|\/+$/g, "");
			else if (key === "fileNameTemplate") v = v.trim() ? v : DEFAULT_FILENAME_TEMPLATE;
			else if (key === "tmdbKey") v = v.trim();
			else if (key === "musicStore") v = v.trim().toUpperCase().slice(0, 2) || "KR";
		}
		if (key.startsWith("sub_")) {
			const type = key.slice(4) as MediaType;
			s.subfolders[type] = v === this.plugin.defaultSubfolder(type) ? "" : String(v);
		} else {
			(s as unknown as Record<string, unknown>)[key] = v;
		}
		await this.plugin.saveSettings();
		if (key === "language") this.redraw();
	}

	private redraw(): void {
		if (requireApiVersion("1.13.0")) this.update();
		else this.renderAll();
	}

	// ── Definitions ─────────────────────────

	getSettingDefinitions(): SettingDefinitionItem[] {
		const general: SettingDefinitionGroup = {
			type: "group",
			heading: t("set.general"),
			items: [
				{
					name: t("set.language"),
					desc: t("set.languageDesc"),
					control: {
						type: "dropdown",
						key: "language",
						options: {
							auto: t("set.languageAuto", { lang: detectObsidianLanguage() === "ko" ? "한국어" : "English" }),
							en: "English",
							ko: "한국어",
						},
					},
				},
				{
					name: t("set.contentLang"),
					desc: t("set.contentLangDesc"),
					control: {
						type: "dropdown",
						key: "contentLang",
						options: { auto: t("set.contentAuto"), ko: t("set.contentKo"), en: t("set.contentEn") },
					},
				},
			],
		};

		const keys: SettingDefinitionGroup = {
			type: "group",
			heading: t("set.keys"),
			items: [
				{
					name: t("set.tmdbKey"),
					desc: createFragment((f) => {
						f.appendText(t("set.tmdbKeyDesc"));
						f.createEl("a", { text: t("set.tmdbKeyLink"), href: "https://www.themoviedb.org/settings/api" });
					}),
					render: (setting: Setting) => this.renderTmdbKey(setting),
				},
			],
		};

		const search: SettingDefinitionGroup = {
			type: "group",
			heading: t("set.search"),
			items: [
				{
					name: t("set.maxResults"),
					desc: t("set.maxResultsDesc"),
					control: { type: "slider", key: "maxResults", min: 5, max: 40, step: 5 },
				},
				{
					name: t("set.musicStore"),
					desc: t("set.musicStoreDesc"),
					control: { type: "text", key: "musicStore", placeholder: "KR" },
				},
			],
		};

		const subfolderItems: SettingDefinition[] = MEDIA_TYPES.map((type) => ({
			name: `${t("set.subfolderNames")} · ${t(`type.${type}` as Key)}`,
			control: { type: "text", key: `sub_${type}`, placeholder: this.plugin.defaultSubfolder(type) },
		}));

		const newNote: SettingDefinitionGroup = {
			type: "group",
			heading: t("set.newNote"),
			items: [
				{
					name: t("set.folder"),
					desc: t("set.folderDesc"),
					control: { type: "folder", key: "folder", placeholder: "Media Diary", includeRoot: true },
				},
				{
					name: t("set.subfolders"),
					desc: t("set.subfoldersDesc"),
					control: { type: "toggle", key: "useSubfolders" },
				},
				...subfolderItems,
				{
					name: t("set.askFolder"),
					desc: t("set.askFolderDesc"),
					control: { type: "toggle", key: "askFolderEachTime" },
				},
				{
					name: t("set.fileName"),
					desc: t("set.fileNameDesc"),
					control: { type: "text", key: "fileNameTemplate", placeholder: DEFAULT_FILENAME_TEMPLATE },
				},
				{
					name: t("set.defaultStatus"),
					desc: t("set.defaultStatusDesc"),
					control: {
						type: "dropdown",
						key: "defaultStatus",
						options: { done: t("set.statusDone"), want: t("set.statusWant") },
					},
				},
				{
					name: t("set.openAfter"),
					control: { type: "toggle", key: "openAfterCreate" },
				},
				{
					name: t("set.reviewAfter"),
					desc: t("set.reviewAfterDesc"),
					control: { type: "toggle", key: "reviewAfterCreate" },
				},
			],
		};

		const groups: MediaGroup[] = ["video", "comic", "music"];
		const templates: SettingDefinitionGroup = {
			type: "group",
			heading: t("set.templates"),
			items: [
				{ name: t("set.templates"), desc: t("set.templatesDesc") },
				...groups.map(
					(g): SettingDefinition => ({
						name: t(GROUP_LABEL[g]),
						render: (setting: Setting) => this.renderTemplate(setting, g),
					}),
				),
			],
		};

		const currentNote: SettingDefinitionGroup = {
			type: "group",
			heading: t("set.currentNote"),
			items: [
				{
					name: t("set.overwrite"),
					desc: t("set.overwriteDesc"),
					control: { type: "toggle", key: "overwriteFrontmatter" },
				},
			],
		};

		const variables: SettingDefinitionGroup = {
			type: "group",
			heading: t("set.variables"),
			items: [
				{
					name: t("set.variables"),
					desc: createFragment((f) => {
						const help = f.createDiv({ cls: "media-diary-var-help" });
						help.createEl("p", { text: t("set.variablesHelp") });
						const table = help.createEl("table");
						for (const name of TEMPLATE_VARIABLES) {
							const tr = table.createEl("tr");
							tr.createEl("td").createEl("code", { text: `{{${name}}}` });
							tr.createEl("td", { text: t(`var.${name}` as Key) });
						}
					}),
				},
			],
		};

		const credits: SettingDefinitionGroup = {
			type: "group",
			heading: t("set.credits"),
			items: [
				{
					name: "TMDB",
					desc: createFragment((f) => {
						f.appendText(t("set.creditsTmdb") + " ");
						f.createEl("a", { text: "themoviedb.org", href: "https://www.themoviedb.org/" });
					}),
				},
				{
					name: "AniList · Apple Music",
					desc: t("set.creditsOthers"),
				},
			],
		};

		return [general, keys, search, newNote, templates, currentNote, variables, credits];
	}

	// ── Custom rows ─────────────────────────

	private renderTmdbKey(setting: Setting): void {
		setting.addText((tx) => {
			tx.inputEl.type = "password";
			tx.setPlaceholder(t("set.tmdbKeyPlaceholder"))
				.setValue(this.plugin.settings.tmdbKey)
				.onChange((v) => {
					void this.setControlValue("tmdbKey", v);
				});
		});
		setting.addButton((b) =>
			b.setButtonText(t("set.testConnection")).onClick(() => {
				void this.testTmdb();
			}),
		);
	}

	private async testTmdb(): Promise<void> {
		try {
			const r = await searchTmdb("movie", "기생충", this.plugin.searchOptions());
			new Notice(t("notice.tmdbOk", { count: r.length }));
		} catch (e) {
			new Notice(e instanceof Error ? e.message : String(e));
		}
	}

	/**
	 * 템플릿 입력칸 + 되돌리기 버튼. 비었거나 기본값과 같으면 ""로 저장해
	 * 기본 템플릿이 화면 언어를 따라가게 한다.
	 */
	private renderTemplate(setting: Setting, group: MediaGroup): void {
		let areaEl: HTMLTextAreaElement | null = null;
		const getDefault = () => defaultTemplate(group, getLang());
		const save = async (value: string) => {
			this.plugin.settings.templates[group] = value;
			await this.plugin.saveSettings();
		};
		setting.settingEl.addClass("media-diary-template-setting");
		setting.addExtraButton((b) =>
			b
				.setIcon("rotate-ccw")
				.setTooltip(t("set.reset"))
				.onClick(() => {
					if (areaEl) areaEl.value = getDefault();
					void save("");
				}),
		);
		setting.addTextArea((ta) => {
			areaEl = ta.inputEl;
			ta.inputEl.rows = 12;
			ta.inputEl.addClass("media-diary-template-area");
			ta.setValue(this.plugin.settings.templates[group] || getDefault()).onChange((v) => {
				void save(!v.trim() || v === getDefault() ? "" : v);
			});
		});
	}

	// ── Fallback for Obsidian < 1.13 ────────

	display(): void {
		this.renderAll();
	}

	private renderAll(): void {
		const el = this.containerEl;
		el.empty();
		for (const item of this.getSettingDefinitions()) {
			if (!("type" in item) || item.type !== "group") continue;
			if (item.heading) new Setting(el).setName(item.heading).setHeading();
			for (const def of item.items ?? []) {
				if (!("type" in def)) this.renderLegacy(el, def);
			}
		}
	}

	private renderLegacy(el: HTMLElement, def: SettingDefinition): void {
		const setting = new Setting(el).setName(def.name);
		if (def.desc) setting.setDesc(def.desc);

		if ("render" in def && def.render) {
			def.render(setting, undefined as unknown as SettingGroup);
			return;
		}
		if (!("control" in def) || !def.control) return;

		const c = def.control;
		const raw = this.getControlValue(c.key);
		const value = typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean" ? raw : "";
		const set = (v: unknown) => {
			void this.setControlValue(c.key, v);
		};

		switch (c.type) {
			case "dropdown":
				setting.addDropdown((dd) => {
					for (const [k, label] of Object.entries(c.options)) dd.addOption(k, label);
					dd.setValue(String(value)).onChange(set);
				});
				break;
			case "toggle":
				setting.addToggle((tg) => tg.setValue(Boolean(value)).onChange(set));
				break;
			case "slider":
				setting.addSlider((sl) => sl.setLimits(c.min, c.max, c.step).setValue(Number(value)).onChange(set));
				break;
			case "text":
				setting.addText((tx) =>
					tx
						.setPlaceholder(c.placeholder ?? "")
						.setValue(String(value))
						.onChange(set),
				);
				break;
			case "folder":
				setting.addSearch((sr) => {
					sr.setPlaceholder(c.placeholder ?? "")
						.setValue(String(value))
						.onChange(set);
					new FolderSuggest(this.app, sr.inputEl, set);
				});
				break;
		}
	}
}
