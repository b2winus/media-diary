import { requestUrl } from "obsidian";
import { MediaItem, SearchOptions, emptyItem } from "../types";
import { errorDetail, hasHangul, readJson, toHttps, uniq } from "./utils";
import { t } from "../i18n";

const API = "https://itunes.apple.com";

export interface ITunesEntry {
	wrapperType?: string;
	collectionId?: number;
	collectionName?: string;
	artistName?: string;
	collectionViewUrl?: string;
	artworkUrl100?: string;
	artworkUrl60?: string;
	trackCount?: number;
	copyright?: string;
	releaseDate?: string;
	primaryGenreName?: string;
	trackName?: string;
	trackNumber?: number;
	discNumber?: number;
}

/** 앨범 형태 키: album(정규) · ep(미니) · single(싱글) · ost */
export function releaseTypeOf(name: string, genre: string): { type: string; title: string } {
	let title = name.trim();
	let type = "album";
	const suffix = title.match(/\s+-\s+(Single|EP)$/i);
	if (suffix) {
		type = suffix[1].toLowerCase() === "ep" ? "ep" : "single";
		title = title.slice(0, suffix.index).trim();
	}
	if (/\bO\.?S\.?T\b|original (motion picture )?soundtrack|사운드트랙/i.test(title) || /soundtrack/i.test(genre)) type = "ost";
	return { type, title };
}

function artwork(url: string | undefined, size: number): string {
	if (!url) return "";
	return toHttps(url).replace(/\/\d+x\d+bb\./, `/${size}x${size}bb.`);
}

export function mapITunesAlbum(e: ITunesEntry): MediaItem {
	const item = emptyItem("album", "itunes", String(e.collectionId ?? ""));
	const { type, title } = releaseTypeOf(e.collectionName ?? "", e.primaryGenreName ?? "");
	item.title = title;
	item.titleOriginal = title;
	if (hasHangul(title)) item.titleKo = title;
	else item.titleEn = title;
	item.releaseType = type;
	item.artists = uniq([e.artistName]);
	item.date = (e.releaseDate ?? "").slice(0, 10);
	item.genres = uniq([e.primaryGenreName]);
	item.label = (e.copyright ?? "").replace(/^[℗©]\s*(\d{4}\s*)?/, "").trim();
	item.coverUrl = artwork(e.artworkUrl100, 600);
	item.thumbnailUrl = artwork(e.artworkUrl100 ?? e.artworkUrl60, 100);
	item.link = toHttps(e.collectionViewUrl ?? "").replace(/[?&]uo=\d+/, "");
	item.trackCount = typeof e.trackCount === "number" ? e.trackCount : null;
	return item;
}

async function itunesGet(path: string, params: Record<string, string>): Promise<ITunesEntry[]> {
	const res = await requestUrl({ url: `${API}${path}?${new URLSearchParams(params).toString()}`, throw: false });
	const body = readJson(res);
	if (res.status >= 400 || !body || typeof body !== "object") {
		throw new Error(t("err.itunes", { status: res.status, detail: errorDetail(body) }));
	}
	const results = (body as { results?: unknown }).results;
	return Array.isArray(results) ? (results as ITunesEntry[]) : [];
}

/** 음악을 파는 스토어 (설정 드롭다운의 선택지) */
export const MUSIC_STORES = ["US", "JP", "GB", "CA", "AU"] as const;
export const DEFAULT_MUSIC_STORE = "US";

/**
 * 실제로 검색할 스토어.
 * 한국(KR) 스토어는 음악을 팔지 않아 앨범·노래 검색 결과가 항상 비어 있다.
 * 미국 스토어는 한글 검색어로도 한국 가수와 노래를 잘 찾는다.
 */
export function musicStore(opts: SearchOptions): string {
	const s = (opts.musicStore || "").trim().toUpperCase();
	return (MUSIC_STORES as readonly string[]).includes(s) ? s : DEFAULT_MUSIC_STORE;
}

/** 노래 검색 결과 → 그 노래가 실린 앨범 */
export function mapITunesSong(e: ITunesEntry): MediaItem {
	const item = mapITunesAlbum(e);
	// 노래 링크(…/album/곡이름/앨범ID?i=곡ID)에서 곡 부분을 떼어 앨범 링크로 만든다.
	item.link = toHttps(e.collectionViewUrl ?? "").replace(/\?.*$/, "");
	item.matchedTrack = e.trackName ?? "";
	// 노래 결과의 저작권 정보는 없다: 상세 조회 때 앨범 정보로 채운다.
	item.label = "";
	return item;
}

/**
 * 앨범 검색과 노래 검색을 함께 돌려 하나의 앨범 목록으로 합친다.
 * 노래 결과와 앨범 결과를 번갈아 놓고 (각각 Apple이 정한 순서대로), 같은 앨범은 한 번만 넣는다.
 * 노래 결과를 먼저 두는 이유: Apple의 노래 검색은 인기 순으로 정렬돼 있어, 노래 제목이나
 * 가수 이름으로 찾을 때 원곡이 커버곡보다 앞에 온다 (예: '홀씨' → 아이유 The Winning,
 * 'Anti-Hero' → Taylor Swift Midnights). 제목이 똑같은 결과를 앞으로 올리면 오히려
 * 같은 제목의 커버 싱글이 원곡보다 먼저 나와서 그렇게 하지 않는다.
 */
export function mergeAlbumAndSongResults(albums: ITunesEntry[], songs: ITunesEntry[], max: number): MediaItem[] {
	const out: MediaItem[] = [];
	const seen = new Set<string>();
	const push = (item: MediaItem) => {
		if (!item.sourceId || seen.has(item.sourceId)) return;
		seen.add(item.sourceId);
		out.push(item);
	};
	const albumItems = albums.filter((a) => a.collectionId).map(mapITunesAlbum);
	const songItems = songs.filter((s) => s.collectionId && s.wrapperType === "track").map(mapITunesSong);
	for (let i = 0; i < Math.max(albumItems.length, songItems.length); i++) {
		const song = songItems.at(i);
		const album = albumItems.at(i);
		if (song) push(song);
		if (album) push(album);
	}
	return out.slice(0, max);
}

export async function searchITunes(query: string, opts: SearchOptions): Promise<MediaItem[]> {
	const country = musicStore(opts);
	const limit = String(Math.min(opts.maxResults, 50));
	const base = { term: query, country, media: "music", limit };
	const [albums, songs] = await Promise.all([
		itunesGet("/search", { ...base, entity: "album" }),
		itunesGet("/search", { ...base, entity: "song" }),
	]);
	return mergeAlbumAndSongResults(albums, songs, opts.maxResults);
}

/** 수록곡 목록과 앨범 정보(발매일·레이블·곡 수)를 덧붙인다. */
export function withTracks(item: MediaItem, entries: ITunesEntry[]): MediaItem {
	const album = entries.find((e) => e.wrapperType === "collection");
	const tracks = entries
		.filter((e) => e.wrapperType === "track" && e.trackName)
		.sort((a, b) => (a.discNumber ?? 1) - (b.discNumber ?? 1) || (a.trackNumber ?? 0) - (b.trackNumber ?? 0))
		.map((e) => e.trackName as string);
	const next: MediaItem = { ...item, tracks, detailed: true };
	if (album) {
		const a = mapITunesAlbum(album);
		next.date = a.date || next.date;
		next.label = a.label || next.label;
		next.trackCount = a.trackCount ?? next.trackCount;
		next.link = a.link || next.link;
	}
	return next;
}

export async function detailITunes(item: MediaItem, opts: SearchOptions): Promise<MediaItem> {
	const entries = await itunesGet("/lookup", { id: item.sourceId, entity: "song", country: musicStore(opts) });
	return withTracks(item, entries);
}
