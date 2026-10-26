import { MediaItem, MediaType, ProviderId, SearchOptions, providerOf } from "../types";
import { detailTmdb, searchTmdb } from "./tmdb";
import { searchAniList } from "./anilist";
import { detailITunes, searchITunes } from "./itunes";

export function providerName(p: ProviderId): string {
	if (p === "tmdb") return "TMDB";
	if (p === "anilist") return "AniList";
	return "Apple Music";
}

export function searchMedia(type: MediaType, query: string, opts: SearchOptions): Promise<MediaItem[]> {
	const p = providerOf(type);
	if (p === "tmdb") return searchTmdb(type, query, opts);
	if (p === "itunes") return searchITunes(query, opts);
	return searchAniList(type, query, opts);
}

/** 고른 항목의 상세 정보를 채운다. AniList는 검색 결과에 이미 모두 들어 있다. */
export async function detailMedia(item: MediaItem, opts: SearchOptions): Promise<MediaItem> {
	if (item.detailed) return item;
	if (item.source === "tmdb") return detailTmdb(item, opts);
	if (item.source === "itunes") return detailITunes(item, opts);
	return item;
}
