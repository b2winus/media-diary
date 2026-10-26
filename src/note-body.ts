import { allLabels, t } from "./i18n";
import { MediaGroup } from "./types";

/** 4.5 → "★★★★½", 3 → "★★★", 0 → "" */
export function starString(rating: number): string {
	if (!rating) return "";
	const full = Math.floor(rating);
	return "★".repeat(full) + (rating - full >= 0.5 ? "½" : "");
}

/** 문구 섹션 제목: 음악은 '가사·문구', 나머지는 '명대사·문구' */
export function quoteHeadingKey(group: MediaGroup): "body.quotesMusic" | "body.quotes" {
	return group === "music" ? "body.quotesMusic" : "body.quotes";
}

export function quoteHeadings(group: MediaGroup): string[] {
	// 어느 언어로 만든 노트든 찾을 수 있게 두 언어 제목을 모두 본다.
	return [...allLabels(quoteHeadingKey(group)), ...allLabels("body.quotes"), ...allLabels("body.quotesMusic")];
}

export function memoHeadings(): string[] {
	return allLabels("body.memo");
}

/** 문구를 인용 콜아웃으로. 출처가 있으면 콜아웃 제목에 넣는다. */
export function quoteBlock(text: string, source: string, date: string): string {
	const title = [source.trim(), date].filter(Boolean).join(" · ");
	const lines = text
		.trim()
		.split(/\r?\n/)
		.map((l) => (l.trim() ? `> ${l}` : ">"));
	return [`> [!quote]${title ? ` ${title}` : ""}`, ...lines].join("\n");
}

/** 메모: 날짜를 굵게 쓰고 그 아래에 내용 */
export function memoBlock(text: string, date: string): string {
	const body = text.trim();
	return date ? `**${date}**\n${body}` : body;
}

function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 프런트매터가 끝나는 줄 번호 (없으면 0) */
function bodyStart(lines: string[]): number {
	if (lines[0]?.trim() !== "---") return 0;
	for (let i = 1; i < lines.length; i++) if (lines[i].trim() === "---") return i + 1;
	return 0;
}

/**
 * 노트 본문의 해당 섹션 끝에 블록을 넣는다.
 * 섹션은 '## 제목' 줄부터 다음 '#'/'##' 제목 전까지. 섹션이 없으면 노트 끝에 새로 만든다.
 */
export function insertIntoSection(content: string, headings: string[], newHeading: string, block: string): string {
	const lines = content.split("\n");
	const start = bodyStart(lines);
	const re = new RegExp(`^##\\s+(${headings.map(escapeRe).join("|")})\\s*$`);
	let h = -1;
	for (let i = start; i < lines.length; i++) {
		if (re.test(lines[i])) {
			h = i;
			break;
		}
	}

	if (h === -1) {
		const trimmed = content.replace(/\s+$/, "");
		return `${trimmed}\n\n## ${newHeading}\n\n${block}\n`;
	}

	let end = lines.length;
	for (let i = h + 1; i < lines.length; i++) {
		if (/^#{1,2}\s/.test(lines[i])) {
			end = i;
			break;
		}
	}
	// 섹션 끝의 빈 줄은 걷어내고, 블록 앞뒤로 빈 줄 하나씩 둔다.
	let last = end;
	while (last > h + 1 && lines[last - 1].trim() === "") last--;
	const before = lines.slice(0, last);
	const after = lines.slice(end);
	const out = [...before, "", ...block.split("\n")];
	if (after.length) out.push("", ...after);
	else out.push("");
	return out.join("\n");
}

export interface BodyAdditions {
	group: MediaGroup;
	quote: string;
	source: string;
	memo: string;
	date: string;
}

/** 문구와 메모를 본문의 맞는 섹션에 넣은 새 내용 */
export function addToBody(content: string, a: BodyAdditions): string {
	let out = content;
	if (a.quote.trim()) {
		out = insertIntoSection(out, quoteHeadings(a.group), t(quoteHeadingKey(a.group)), quoteBlock(a.quote, a.source, a.date));
	}
	if (a.memo.trim()) {
		out = insertIntoSection(out, memoHeadings(), t("body.memo"), memoBlock(a.memo, a.date));
	}
	return out;
}
