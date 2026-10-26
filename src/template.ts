import { Key, Lang, t, tMaybe } from "./i18n";
import { MediaGroup, MediaItem } from "./types";
import { providerName } from "./providers";
import { uniq } from "./providers/utils";

type Value = string | number | string[] | null;

/** 템플릿에서 쓸 수 있는 변수 이름 (설명은 i18n의 var.* 키) */
export const TEMPLATE_VARIABLES = [
	"type", "typeLabel", "title", "titleKo", "titleEn", "titleOriginal", "aliases", "summary",
	"year", "date", "endDate", "countries", "genres", "overview", "coverUrl", "link", "externalRating",
	"directors", "cast", "networks", "ott", "ageRating", "episodes", "seasons", "runtime", "studios", "season",
	"writers", "illustrators", "serialStatus", "chapters", "volumes",
	"artists", "label", "releaseType", "trackCount", "tracklist",
	"source", "sourceKey", "status", "today",
] as const;

export interface RenderExtras {
	/** 새 노트에 넣을 상태 값 (언어에 맞춘 문구) */
	status: string;
}

export function todayString(): string {
	const d = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function sourceKey(item: MediaItem): string {
	if (item.source === "tmdb") return `tmdb:${item.type === "movie" ? "movie" : "tv"}:${item.sourceId}`;
	return `${item.source}:${item.sourceId}`;
}

function externalRating(item: MediaItem): string {
	return item.externalRating === null ? "" : `${providerName(item.source)} ${item.externalRating}`;
}

function animeSeason(season: string): string {
	const [year, name] = season.split(" ");
	if (!year || !name) return season;
	return `${year} ${tMaybe(`season.${name}`) || name}`;
}

export function itemToValues(item: MediaItem, extras: RenderExtras): Record<string, Value> {
	const year = item.date.slice(0, 4);
	const typeLabel = t(`type.${item.type}` as Key);
	const releaseType = item.releaseType ? tMaybe(`release.${item.releaseType}`) || item.releaseType : "";
	return {
		type: item.type,
		typeLabel,
		title: item.title,
		titleKo: item.titleKo,
		titleEn: item.titleEn,
		titleOriginal: item.titleOriginal,
		aliases: uniq([item.titleKo, item.titleEn, item.titleOriginal]).filter((x) => x !== item.title),
		summary: uniq([
			item.titleOriginal !== item.title ? item.titleOriginal : "",
			year,
			item.type === "album" ? [item.artists.join(", "), releaseType].filter(Boolean).join(" · ") : typeLabel,
			item.genres.slice(0, 3).join(", "),
		]).join(" · "),
		year: year || null,
		date: item.date,
		endDate: item.endDate,
		countries: item.countries,
		genres: item.genres,
		overview: item.overview,
		coverUrl: item.coverUrl,
		link: item.link,
		externalRating: externalRating(item),
		directors: item.directors,
		cast: item.cast,
		networks: item.networks,
		ott: item.ott,
		ageRating: item.ageRating,
		episodes: item.episodes,
		seasons: item.seasons,
		runtime: item.runtime,
		studios: item.studios,
		season: animeSeason(item.season),
		writers: item.writers,
		illustrators: item.illustrators,
		serialStatus: item.serialStatus ? tMaybe(`serial.${item.serialStatus}`) || item.serialStatus : "",
		chapters: item.chapters,
		volumes: item.volumes,
		artists: item.artists,
		label: item.label,
		releaseType,
		trackCount: item.trackCount ?? (item.tracks.length || null),
		tracklist: item.tracks.map((name, i) => `${i + 1}. ${name}`).join("\n"),
		source: item.source,
		sourceKey: sourceKey(item),
		status: extras.status,
		today: todayString(),
	};
}

function isEmpty(v: Value): boolean {
	return v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

function applyFilter(value: Value, filter: string | undefined): string {
	switch (filter) {
		case "json":
			// JSON은 YAML의 부분집합이라 프런트매터에 그대로 넣어도 안전하다.
			if (value === null || value === "") return '""';
			return JSON.stringify(value);
		case "link":
			if (Array.isArray(value)) return value.map((v) => `[[${v}]]`).join(", ");
			return value === null || value === "" ? "" : `[[${value}]]`;
		case "linkjson":
			if (Array.isArray(value)) return JSON.stringify(value.map((v) => `[[${v}]]`));
			return value === null || value === "" ? '""' : JSON.stringify(`[[${value}]]`);
		default:
			if (value === null) return "";
			if (Array.isArray(value)) return value.join(", ");
			return String(value);
	}
}

const PLACEHOLDER = /\{\{\s*(\w+)(?::(\w+))?\s*\}\}/g;

/**
 * {{변수}} 또는 {{변수:필터}}를 치환한다.
 * 한 줄에 든 변수가 모두 비어 있으면 그 줄을 통째로 뺀다.
 * 그래서 영화 노트에는 방송사 줄이, 드라마 노트에는 상영 시간 줄이 빠진다.
 */
export function renderTemplate(template: string, item: MediaItem, extras: RenderExtras): string {
	const values = itemToValues(item, extras);
	const out: string[] = [];
	for (const line of template.split("\n")) {
		let known = 0;
		let filled = 0;
		const rendered = line.replace(PLACEHOLDER, (whole, name: string, filter?: string) => {
			if (!(name in values)) return whole;
			known++;
			if (!isEmpty(values[name])) filled++;
			return applyFilter(values[name], filter);
		});
		if (known > 0 && filled === 0) continue;
		out.push(rendered);
	}
	return out.join("\n");
}

/** 파일 이름에 쓸 수 없는 문자를 걷어낸다. */
export function sanitizeFileName(name: string): string {
	return name
		.replace(/[\\/:*?"<>|#^[\]]/g, " ")
		.replace(/\(\s*\)/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 180);
}

export function makeFileName(template: string, item: MediaItem, extras: RenderExtras): string {
	const name = sanitizeFileName(renderTemplate(template, item, extras));
	return name || sanitizeFileName(item.title) || "Untitled";
}

/** '작품 정보 채우기'가 프런트매터에 넣는 값. 별점·상태·한줄평은 건드리지 않는다. */
export function frontmatterFields(item: MediaItem, extras: RenderExtras): Record<string, unknown> {
	const v = itemToValues(item, extras);
	const common: Record<string, unknown> = {
		type: v.type,
		title: v.title,
		title_ko: v.titleKo,
		title_en: v.titleEn,
		title_original: v.titleOriginal,
		aliases: v.aliases,
		year: v.year === null ? null : Number(v.year),
		genres: v.genres,
		country: v.countries,
		cover: v.coverUrl,
		link: v.link,
		external_rating: v.externalRating,
		source_id: v.sourceKey,
	};
	if (item.type === "album") {
		return { ...common, artist: v.artists, release: v.date, release_type: v.releaseType, label: v.label, tracks: v.trackCount };
	}
	if (item.type === "webtoon" || item.type === "manga") {
		return {
			...common,
			started: v.date,
			ended: v.endDate,
			writer: v.writers,
			illustrator: v.illustrators,
			platform: v.networks,
			serial_status: v.serialStatus,
			chapters: v.chapters,
			volumes: v.volumes,
		};
	}
	return {
		...common,
		release: v.date,
		ended: v.endDate,
		director: v.directors,
		cast: v.cast,
		studio: v.studios,
		network: v.networks,
		ott: v.ott,
		season: v.season,
		episodes: v.episodes,
		runtime: v.runtime,
		age_rating: v.ageRating,
	};
}

// ── 기본 템플릿 ─────────────────────────────

const KO_VIDEO = `---
type: {{type}}
title: {{title:json}}
title_ko: {{titleKo:json}}
title_en: {{titleEn:json}}
title_original: {{titleOriginal:json}}
aliases: {{aliases:json}}
year: {{year}}
release: {{date:json}}
ended: {{endDate:json}}
country: {{countries:json}}
genres: {{genres:json}}
director: {{directors:json}}
cast: {{cast:json}}
studio: {{studios:json}}
network: {{networks:json}}
ott: {{ott:json}}
season: {{season:json}}
episodes: {{episodes}}
runtime: {{runtime}}
age_rating: {{ageRating:json}}
cover: {{coverUrl:json}}
link: {{link:json}}
external_rating: {{externalRating:json}}
source_id: {{sourceKey:json}}
status: {{status}}
my_rating:
stars:
one_liner:
watched_dates: []
created: {{today}}
tags:
  - media/{{type}}
---

![포스터|180]({{coverUrl}})

# {{title}}

> {{summary}}

## 줄거리

{{overview}}

## 감상

## 좋았던 장면

## 명대사·문구

## 다시 볼 이유

## 메모
`;

const EN_VIDEO = KO_VIDEO.replace("![포스터|180]", "![poster|180]")
	.replace("## 줄거리", "## Synopsis")
	.replace("## 감상", "## Thoughts")
	.replace("## 좋았던 장면", "## Favorite scenes")
	.replace("## 명대사·문구", "## Quotes")
	.replace("## 메모", "## Memo")
	.replace("## 다시 볼 이유", "## Why I'd watch it again");

const KO_COMIC = `---
type: {{type}}
title: {{title:json}}
title_ko: {{titleKo:json}}
title_en: {{titleEn:json}}
title_original: {{titleOriginal:json}}
aliases: {{aliases:json}}
year: {{year}}
started: {{date:json}}
ended: {{endDate:json}}
country: {{countries:json}}
genres: {{genres:json}}
writer: {{writers:json}}
illustrator: {{illustrators:json}}
platform: {{networks:json}}
serial_status: {{serialStatus:json}}
chapters: {{chapters}}
volumes: {{volumes}}
cover: {{coverUrl:json}}
link: {{link:json}}
external_rating: {{externalRating:json}}
source_id: {{sourceKey:json}}
status: {{status}}
my_rating:
stars:
one_liner:
last_chapter:
watched_dates: []
created: {{today}}
tags:
  - media/{{type}}
---

![표지|160]({{coverUrl}})

# {{title}}

> {{summary}}

## 소개

{{overview}}

## 감상

## 인상 깊은 장면

## 명대사·문구

## 메모
`;

const EN_COMIC = KO_COMIC.replace("![표지|160]", "![cover|160]")
	.replace("## 소개", "## About")
	.replace("## 감상", "## Thoughts")
	.replace("## 인상 깊은 장면", "## Memorable moments")
	.replace("## 명대사·문구", "## Quotes")
	.replace("## 메모", "## Memo");

const KO_MUSIC = `---
type: {{type}}
title: {{title:json}}
title_ko: {{titleKo:json}}
title_en: {{titleEn:json}}
aliases: {{aliases:json}}
artist: {{artists:json}}
year: {{year}}
release: {{date:json}}
release_type: {{releaseType:json}}
label: {{label:json}}
genres: {{genres:json}}
tracks: {{trackCount}}
cover: {{coverUrl:json}}
link: {{link:json}}
source_id: {{sourceKey:json}}
status: {{status}}
my_rating:
stars:
one_liner:
title_track:
fav_tracks: []
watched_dates: []
created: {{today}}
tags:
  - media/{{type}}
---

![앨범 커버|200]({{coverUrl}})

# {{title}}

> {{summary}}

## 수록곡

{{tracklist}}

## 감상

## 가사·문구

## 메모
`;

const EN_MUSIC = KO_MUSIC.replace("![앨범 커버|200]", "![album cover|200]")
	.replace("## 수록곡", "## Tracks")
	.replace("## 감상", "## Thoughts")
	.replace("## 가사·문구", "## Lyrics & lines")
	.replace("## 메모", "## Memo");

const DEFAULTS: Record<Lang, Record<MediaGroup, string>> = {
	ko: { video: KO_VIDEO, comic: KO_COMIC, music: KO_MUSIC },
	en: { video: EN_VIDEO, comic: EN_COMIC, music: EN_MUSIC },
};

export const DEFAULT_FILENAME_TEMPLATE = "{{title}} ({{year}})";

export function defaultTemplate(group: MediaGroup, lang: Lang): string {
	return DEFAULTS[lang][group];
}

/** 사용자가 손대지 않은 기본 템플릿인지 */
export function isDefaultTemplate(value: string): boolean {
	return Object.values(DEFAULTS).some((g) => Object.values(g).includes(value));
}
