import { requestUrl } from "obsidian";
import { MediaItem, MediaType, SearchOptions, emptyItem } from "../types";
import { errorDetail, fuzzyDate, hasHangul, readJson, stripHtml, uniq } from "./utils";
import { t } from "../i18n";

const API = "https://graphql.anilist.co";

const FIELDS = `
	id type format status countryOfOrigin
	title { romaji english native }
	synonyms
	description(asHtml: false)
	startDate { year month day }
	endDate { year month day }
	season seasonYear episodes chapters volumes genres averageScore
	coverImage { extraLarge large medium }
	siteUrl
	studios(isMain: true) { nodes { name } }
	staff(perPage: 10, sort: [RELEVANCE, ROLE]) { edges { role node { name { full native } } } }
	externalLinks { site url language }
`;

function buildQuery(withCountry: boolean): string {
	const countryVar = withCountry ? ", $country: CountryCode" : "";
	const countryArg = withCountry ? ", countryOfOrigin: $country" : "";
	return `query ($search: String, $type: MediaType, $perPage: Int${countryVar}) {
	Page(page: 1, perPage: $perPage) {
		media(search: $search, type: $type, sort: SEARCH_MATCH, isAdult: false${countryArg}) { ${FIELDS} }
	}
}`;
}

/** 한국 웹툰 플랫폼 이름 (AniList externalLinks의 site 값 일부) */
const KOREAN_PLATFORMS = /naver|kakao|lezhin|ridi|bomtoon|toptoon|toomics|mrblue|bufftoon/i;

export interface AniListMedia {
	id: number;
	type?: string;
	format?: string | null;
	status?: string | null;
	countryOfOrigin?: string | null;
	title?: { romaji?: string | null; english?: string | null; native?: string | null };
	synonyms?: string[] | null;
	description?: string | null;
	startDate?: { year?: number | null; month?: number | null; day?: number | null } | null;
	endDate?: { year?: number | null; month?: number | null; day?: number | null } | null;
	season?: string | null;
	seasonYear?: number | null;
	episodes?: number | null;
	chapters?: number | null;
	volumes?: number | null;
	genres?: string[] | null;
	averageScore?: number | null;
	coverImage?: { extraLarge?: string | null; large?: string | null; medium?: string | null } | null;
	siteUrl?: string | null;
	studios?: { nodes?: { name?: string | null }[] | null } | null;
	staff?: { edges?: { role?: string | null; node?: { name?: { full?: string | null; native?: string | null } | null } | null }[] | null } | null;
	externalLinks?: { site?: string | null; url?: string | null; language?: string | null }[] | null;
}

function staffName(name: { full?: string | null; native?: string | null } | null | undefined, opts: SearchOptions): string {
	const native = name?.native ?? "";
	const full = name?.full ?? "";
	if (opts.contentLang === "ko" && hasHangul(native)) return native;
	return full || native;
}

export function mapAniList(type: MediaType, m: AniListMedia, opts: SearchOptions): MediaItem {
	const item = emptyItem(type, "anilist", String(m.id));
	const romaji = m.title?.romaji ?? "";
	const english = m.title?.english ?? "";
	const native = m.title?.native ?? "";

	item.titleKo = hasHangul(native) ? native : (m.synonyms ?? []).find(hasHangul) ?? "";
	item.titleEn = english || romaji;
	item.titleOriginal = native || romaji;
	item.title =
		opts.contentLang === "ko"
			? item.titleKo || item.titleEn || item.titleOriginal
			: item.titleEn || item.titleKo || item.titleOriginal;

	item.date = fuzzyDate(m.startDate);
	if (m.status === "FINISHED") item.endDate = fuzzyDate(m.endDate);
	item.countries = uniq([m.countryOfOrigin]);
	item.genres = m.genres ?? [];
	item.overview = stripHtml(m.description ?? "");
	item.coverUrl = m.coverImage?.extraLarge || m.coverImage?.large || "";
	item.thumbnailUrl = m.coverImage?.medium || item.coverUrl;
	item.link = m.siteUrl ?? `https://anilist.co/${type === "anime" ? "anime" : "manga"}/${m.id}`;
	item.externalRating = typeof m.averageScore === "number" ? m.averageScore : null;
	item.serialStatus = m.status ?? "";

	const edges = m.staff?.edges ?? [];
	const byRole = (re: RegExp) => uniq(edges.filter((e) => re.test(e.role ?? "")).map((e) => staffName(e.node?.name, opts)));

	if (type === "anime") {
		item.episodes = m.episodes ?? null;
		item.studios = uniq((m.studios?.nodes ?? []).map((n) => n.name));
		item.directors = byRole(/^Director\b/);
		item.season = m.season && m.seasonYear ? `${m.seasonYear} ${m.season}` : "";
	} else {
		item.chapters = m.chapters ?? null;
		item.volumes = m.volumes ?? null;
		item.writers = byRole(/^(Original )?(Story|Creator)/i);
		item.illustrators = byRole(/Art\b/i);
		item.networks = uniq(
			(m.externalLinks ?? [])
				.filter((l) => KOREAN_PLATFORMS.test(l.site ?? "") || (l.language ?? "") === "Korean")
				.map((l) => l.site),
		);
	}
	item.detailed = true;
	return item;
}

export async function searchAniList(type: MediaType, query: string, opts: SearchOptions): Promise<MediaItem[]> {
	const isWebtoon = type === "webtoon";
	const variables: Record<string, unknown> = {
		search: query,
		type: type === "anime" ? "ANIME" : "MANGA",
		perPage: Math.min(opts.maxResults, 50),
	};
	if (isWebtoon) variables["country"] = "KR";

	const res = await requestUrl({
		url: API,
		method: "POST",
		contentType: "application/json",
		headers: { Accept: "application/json" },
		body: JSON.stringify({ query: buildQuery(isWebtoon), variables }),
		throw: false,
	});
	const body = readJson(res);
	if (res.status === 429) throw new Error(t("err.anilist429"));
	if (res.status >= 400 || !body || typeof body !== "object") {
		throw new Error(t("err.anilist", { status: res.status, detail: errorDetail(body) }));
	}
	const media = ((body as { data?: { Page?: { media?: AniListMedia[] } } }).data?.Page?.media ?? []).filter(Boolean);
	// 만화 검색에서는 한국 웹툰도 함께 나오므로 그대로 두되, 웹툰 검색은 이미 KR로 걸러져 있다.
	return media.map((m) => mapAniList(type, m, opts));
}
