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

function store(opts: SearchOptions): string {
	return (opts.musicStore || "KR").trim().toUpperCase();
}

export async function searchITunes(query: string, opts: SearchOptions): Promise<MediaItem[]> {
	const results = await itunesGet("/search", {
		term: query,
		country: store(opts),
		media: "music",
		entity: "album",
		limit: String(Math.min(opts.maxResults, 50)),
	});
	return results.filter((r) => r.collectionId).map(mapITunesAlbum);
}

/** 수록곡 목록을 덧붙인다. */
export function withTracks(item: MediaItem, entries: ITunesEntry[]): MediaItem {
	const tracks = entries
		.filter((e) => e.wrapperType === "track" && e.trackName)
		.sort((a, b) => (a.discNumber ?? 1) - (b.discNumber ?? 1) || (a.trackNumber ?? 0) - (b.trackNumber ?? 0))
		.map((e) => e.trackName as string);
	return { ...item, tracks, detailed: true };
}

export async function detailITunes(item: MediaItem, opts: SearchOptions): Promise<MediaItem> {
	const entries = await itunesGet("/lookup", { id: item.sourceId, entity: "song", country: store(opts) });
	return withTracks(item, entries);
}
