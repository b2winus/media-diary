import { Key, allLabels, t } from "./i18n";
import { MEDIA_TYPES, MediaGroup, MediaType, groupOf } from "./types";

export type StatusKey = "want" | "doing" | "done" | "dropped";

const STATUS_KEYS: Record<MediaGroup, StatusKey[]> = {
	video: ["want", "doing", "done", "dropped"],
	comic: ["want", "doing", "done", "dropped"],
	music: ["want", "done"],
};

export function statusKeys(group: MediaGroup): StatusKey[] {
	return STATUS_KEYS[group];
}

function statusKey(group: MediaGroup, key: StatusKey): Key {
	return `status.${group}.${key}` as Key;
}

export function statusLabel(group: MediaGroup, key: StatusKey): string {
	return t(statusKey(group, key));
}

/** 저장된 상태 값(어느 언어든)을 키로 바꾼다. 모르는 값이면 null. */
export function parseStatus(group: MediaGroup, value: unknown): StatusKey | null {
	if (typeof value !== "string") return null;
	const v = value.trim().toLowerCase();
	for (const k of STATUS_KEYS[group]) {
		if (allLabels(statusKey(group, k)).some((l) => l.toLowerCase() === v)) return k;
	}
	return null;
}

export function asMediaType(value: unknown): MediaType | null {
	return typeof value === "string" && (MEDIA_TYPES as string[]).includes(value) ? (value as MediaType) : null;
}

export function defaultStatusLabel(type: MediaType, pref: "done" | "want"): string {
	return statusLabel(groupOf(type), pref);
}
