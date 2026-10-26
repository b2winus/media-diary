import { requestUrl } from "obsidian";
import { MediaItem, MediaType, SearchOptions, emptyItem } from "../types";
import { errorDetail, hasHangul, koreanFirst, readJson, uniq } from "./utils";
import { t } from "../i18n";

const API = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

type Json = Record<string, unknown>;

/** v4 읽기 액세스 토큰(eyJ…)은 헤더로, v3 API 키는 쿼리로 보낸다. */
function isBearer(key: string): boolean {
	return key.startsWith("eyJ") && key.includes(".");
}

async function tmdbGet(path: string, params: Record<string, string>, key: string): Promise<Json> {
	if (!key) throw new Error(t("err.tmdbNoKey"));
	const qs = new URLSearchParams(params);
	const headers: Record<string, string> = { Accept: "application/json" };
	if (isBearer(key)) headers["Authorization"] = `Bearer ${key}`;
	else qs.set("api_key", key);

	const res = await requestUrl({ url: `${API}${path}?${qs.toString()}`, headers, throw: false });
	const body = readJson(res);
	if (res.status === 401) throw new Error(t("err.tmdb401", { detail: errorDetail(body) }));
	if (res.status >= 400 || !body || typeof body !== "object") {
		throw new Error(t("err.tmdb", { status: res.status, detail: errorDetail(body) }));
	}
	return body as Json;
}

function str(v: unknown): string {
	return typeof v === "string" ? v : "";
}

function num(v: unknown): number | null {
	return typeof v === "number" && isFinite(v) && v > 0 ? v : null;
}

function arr(v: unknown): Json[] {
	return Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Json[]) : [];
}

function names(v: unknown): string[] {
	return uniq(arr(v).map((x) => str(x["name"])));
}

function poster(path: string, size: "w92" | "w500"): string {
	return path ? `${IMG}/${size}${path}` : "";
}

function langParam(opts: SearchOptions): string {
	return opts.contentLang === "ko" ? "ko-KR" : "en-US";
}

function regionParam(opts: SearchOptions): string {
	return opts.contentLang === "ko" ? "KR" : "US";
}

function isKoreanResult(r: Json): boolean {
	const origin = Array.isArray(r["origin_country"]) ? (r["origin_country"] as unknown[]) : [];
	return str(r["original_language"]) === "ko" || origin.includes("KR");
}

/** 검색 결과 한 줄 → 기본 정보만 담은 MediaItem */
export function mapTmdbResult(type: MediaType, r: Json, opts: SearchOptions): MediaItem {
	const movie = type === "movie";
	const item = emptyItem(type, "tmdb", String(r["id"] ?? ""));
	const title = str(movie ? r["title"] : r["name"]);
	const original = str(movie ? r["original_title"] : r["original_name"]);
	item.title = title || original;
	item.titleOriginal = original;
	if (opts.contentLang === "ko" && hasHangul(title)) item.titleKo = title;
	if (opts.contentLang === "en") item.titleEn = title;
	item.date = str(movie ? r["release_date"] : r["first_air_date"]);
	item.overview = str(r["overview"]);
	const p = str(r["poster_path"]);
	item.coverUrl = poster(p, "w500");
	item.thumbnailUrl = poster(p, "w92");
	item.link = `https://www.themoviedb.org/${movie ? "movie" : "tv"}/${item.sourceId}`;
	const origin = Array.isArray(r["origin_country"]) ? uniq(r["origin_country"] as string[]) : [];
	item.countries = origin;
	return item;
}

export async function searchTmdb(type: MediaType, query: string, opts: SearchOptions): Promise<MediaItem[]> {
	const path = type === "movie" ? "/search/movie" : "/search/tv";
	const body = await tmdbGet(path, { query, language: langParam(opts), include_adult: "false", page: "1" }, opts.tmdbKey);
	let results = arr(body["results"]);
	// 한글로 검색하면 한국 작품을 먼저 보여준다.
	if (hasHangul(query)) results = koreanFirst(results, isKoreanResult);
	return results.slice(0, opts.maxResults).map((r) => mapTmdbResult(type, r, opts));
}

/** translations 목록에서 언어에 맞는 제목·줄거리 */
function translation(body: Json, lang: string, preferRegion: string): { title: string; overview: string } {
	const list = arr((body["translations"] as Json | undefined)?.["translations"]).filter((x) => x["iso_639_1"] === lang);
	list.sort((a, b) => Number(b["iso_3166_1"] === preferRegion) - Number(a["iso_3166_1"] === preferRegion));
	for (const x of list) {
		const d = (x["data"] ?? {}) as Json;
		const title = str(d["title"]) || str(d["name"]);
		if (title || str(d["overview"])) return { title, overview: str(d["overview"]) };
	}
	return { title: "", overview: "" };
}

function movieCertification(body: Json, region: string): string {
	const results = arr((body["release_dates"] as Json | undefined)?.["results"]);
	for (const r of [region, "KR", "US"]) {
		const hit = results.find((x) => x["iso_3166_1"] === r);
		const cert = arr(hit?.["release_dates"])
			.map((d) => str(d["certification"]).trim())
			.find(Boolean);
		if (cert) return cert;
	}
	return "";
}

function tvRating(body: Json, region: string): string {
	const results = arr((body["content_ratings"] as Json | undefined)?.["results"]);
	for (const r of [region, "KR", "US"]) {
		const hit = results.find((x) => x["iso_3166_1"] === r);
		const rating = str(hit?.["rating"]).trim();
		if (rating) return rating;
	}
	return "";
}

function streaming(body: Json, region: string): string[] {
	const results = ((body["watch/providers"] as Json | undefined)?.["results"] ?? {}) as Json;
	const here = (results[region] ?? {}) as Json;
	return uniq(arr(here["flatrate"]).map((x) => str(x["provider_name"])));
}

/** 상세 정보 + 한·영 제목을 한 번의 요청으로 받아 MediaItem을 채운다. */
export function mapTmdbDetail(type: MediaType, body: Json, opts: SearchOptions): MediaItem {
	const movie = type === "movie";
	const region = regionParam(opts);
	const item = mapTmdbResult(type, body, opts);

	const originalLang = str(body["original_language"]);
	const ko = translation(body, "ko", "KR");
	const en = translation(body, "en", "US");
	item.titleKo = originalLang === "ko" ? item.titleOriginal : ko.title;
	item.titleEn = originalLang === "en" ? item.titleOriginal : en.title;
	item.title =
		opts.contentLang === "ko"
			? item.titleKo || item.titleEn || item.titleOriginal
			: item.titleEn || item.titleKo || item.titleOriginal;
	if (!item.overview) item.overview = (opts.contentLang === "ko" ? ko.overview || en.overview : en.overview || ko.overview) ?? "";

	item.genres = names(body["genres"]);
	if (!item.countries.length) {
		item.countries = uniq(arr(body["production_countries"]).map((c) => str(c["iso_3166_1"])));
	}
	const vote = num(body["vote_average"]);
	item.externalRating = vote !== null && num(body["vote_count"]) ? Math.round(vote * 10) / 10 : null;

	const credits = (body["credits"] ?? {}) as Json;
	item.cast = uniq(arr(credits["cast"]).slice(0, 6).map((c) => str(c["name"])));

	if (movie) {
		item.directors = uniq(arr(credits["crew"]).filter((c) => c["job"] === "Director").map((c) => str(c["name"])));
		item.runtime = num(body["runtime"]);
		item.ageRating = movieCertification(body, region);
	} else {
		item.directors = names(body["created_by"]);
		item.networks = names(body["networks"]);
		item.episodes = num(body["number_of_episodes"]);
		item.seasons = num(body["number_of_seasons"]);
		const runtimes = Array.isArray(body["episode_run_time"]) ? (body["episode_run_time"] as unknown[]) : [];
		item.runtime = num(runtimes[0]);
		item.ageRating = tvRating(body, region);
		const status = str(body["status"]);
		if (status === "Ended" || status === "Canceled") item.endDate = str(body["last_air_date"]);
	}
	item.ott = streaming(body, region);
	item.detailed = true;
	return item;
}

export async function detailTmdb(item: MediaItem, opts: SearchOptions): Promise<MediaItem> {
	const movie = item.type === "movie";
	const extra = movie ? "credits,release_dates,watch/providers,translations" : "credits,content_ratings,watch/providers,translations";
	const body = await tmdbGet(`/${movie ? "movie" : "tv"}/${item.sourceId}`, { language: langParam(opts), append_to_response: extra }, opts.tmdbKey);
	return mapTmdbDetail(item.type, body, opts);
}
