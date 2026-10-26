export type MediaType = "movie" | "series" | "anime" | "webtoon" | "manga" | "album";
export type ProviderId = "tmdb" | "anilist" | "itunes";

/** 템플릿 묶음: 영상 / 만화 / 음악 */
export type MediaGroup = "video" | "comic" | "music";

export const MEDIA_TYPES: MediaType[] = ["movie", "series", "anime", "webtoon", "manga", "album"];

export function groupOf(type: MediaType): MediaGroup {
	if (type === "webtoon" || type === "manga") return "comic";
	if (type === "album") return "music";
	return "video";
}

export function providerOf(type: MediaType): ProviderId {
	if (type === "movie" || type === "series") return "tmdb";
	if (type === "album") return "itunes";
	return "anilist";
}

/** 모든 콘텐츠가 같은 모양으로 담기는 결과. 해당 없는 칸은 빈 값으로 둔다. */
export interface MediaItem {
	type: MediaType;
	source: ProviderId;
	sourceId: string;
	/** 표시용 제목 (선택한 콘텐츠 언어 우선) */
	title: string;
	titleKo: string;
	titleEn: string;
	titleOriginal: string;
	/** YYYY-MM-DD, YYYY-MM 또는 YYYY */
	date: string;
	endDate: string;
	countries: string[];
	genres: string[];
	overview: string;
	coverUrl: string;
	thumbnailUrl: string;
	link: string;
	/** 외부 평점 (예: TMDB 8.6, AniList 85) */
	externalRating: number | null;

	// 영상
	directors: string[];
	cast: string[];
	networks: string[];
	ott: string[];
	ageRating: string;
	episodes: number | null;
	seasons: number | null;
	runtime: number | null;
	studios: string[];
	/** 애니 방영 분기 (예: 2026 SPRING) */
	season: string;

	// 웹툰·만화
	writers: string[];
	illustrators: string[];
	serialStatus: string;
	chapters: number | null;
	volumes: number | null;

	// 음악
	artists: string[];
	label: string;
	releaseType: string;
	trackCount: number | null;
	tracks: string[];

	/** 상세 정보를 이미 받아왔는지 (검색 결과만 있으면 false) */
	detailed: boolean;
}

export function emptyItem(type: MediaType, source: ProviderId, sourceId: string): MediaItem {
	return {
		type,
		source,
		sourceId,
		title: "",
		titleKo: "",
		titleEn: "",
		titleOriginal: "",
		date: "",
		endDate: "",
		countries: [],
		genres: [],
		overview: "",
		coverUrl: "",
		thumbnailUrl: "",
		link: "",
		externalRating: null,
		directors: [],
		cast: [],
		networks: [],
		ott: [],
		ageRating: "",
		episodes: null,
		seasons: null,
		runtime: null,
		studios: [],
		season: "",
		writers: [],
		illustrators: [],
		serialStatus: "",
		chapters: null,
		volumes: null,
		artists: [],
		label: "",
		releaseType: "",
		trackCount: null,
		tracks: [],
		detailed: false,
	};
}

/** 콘텐츠 언어: 제목·줄거리를 어느 언어로 먼저 보여줄지 */
export type ContentLang = "ko" | "en";

export interface SearchOptions {
	tmdbKey: string;
	contentLang: ContentLang;
	/** iTunes 스토어 국가 코드 (예: KR, US) */
	musicStore: string;
	maxResults: number;
}
