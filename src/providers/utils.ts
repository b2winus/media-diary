import type { RequestUrlResponse } from "obsidian";

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/;

export function hasHangul(s: string): boolean {
	return HANGUL.test(s);
}

/** HTML 태그와 엔티티를 걷어낸 평문 */
export function stripHtml(html: string): string {
	return html
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/p>/gi, "\n\n")
		.replace(/<[^>]+>/g, "")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;/g, "'")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

export function toHttps(url: string): string {
	return url.replace(/^http:\/\//, "https://");
}

/** Parsed JSON body as unknown (the caller narrows it), or null if the body isn't JSON. */
export function readJson(res: RequestUrlResponse): unknown {
	try {
		return JSON.parse(res.text) as unknown;
	} catch {
		return null;
	}
}

/** 빈 값과 중복을 뺀 목록 (순서 유지) */
export function uniq(list: (string | null | undefined)[]): string[] {
	const out: string[] = [];
	for (const v of list) {
		const s = (v ?? "").trim();
		if (s && !out.includes(s)) out.push(s);
	}
	return out;
}

/** 한국 작품을 앞으로 (같은 그룹 안에서는 원래 순서 유지) */
export function koreanFirst<T>(list: T[], isKorean: (item: T) => boolean): T[] {
	return [...list.filter(isKorean), ...list.filter((x) => !isKorean(x))];
}

/** {year, month, day} → YYYY-MM-DD / YYYY-MM / YYYY */
export function fuzzyDate(d: { year?: number | null; month?: number | null; day?: number | null } | null | undefined): string {
	if (!d?.year) return "";
	const pad = (n: number) => String(n).padStart(2, "0");
	if (!d.month) return String(d.year);
	if (!d.day) return `${d.year}-${pad(d.month)}`;
	return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
}

export function errorDetail(body: unknown): string {
	if (body && typeof body === "object") {
		const o = body as Record<string, unknown>;
		const msg = o["status_message"] ?? o["errorMessage"] ?? o["message"];
		if (typeof msg === "string") return msg;
		const errs = o["errors"];
		if (Array.isArray(errs) && errs.length) {
			const first = errs[0] as Record<string, unknown>;
			if (typeof first?.["message"] === "string") return first["message"];
		}
	}
	return "";
}
