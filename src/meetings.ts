// Pure parsing and grouping of the meeting pages the Shadow Mac app writes.
// No Obsidian imports here so the logic can be unit tested in Node.
//
// Shadow's layout inside its folder (see SHADOW.md in that folder):
//   SHADOW.md                      frontmatter `type: shadow-vault`
//   Meetings/<YYYY>/<MM>/<YYYY-MM-DD title>/<title>.md   the meeting page
//   People/<name> (<email>).md
//   Unsynced Files/, Archived Vaults/   copies Shadow set aside, never listed
//
// Meeting page frontmatter: type: meeting, title, date (local calendar day),
// createdAt, startedAt, endedAt. Timestamps look like
// "2026-10-15 15:36:01 UTC" or "2026-10-15 15:36 GMT+09:00", or null.
// Attendees are a `## Attendees` table whose names link to People pages;
// `## Materials` links the Transcript, Notes, Screenshots and Skill results.

import { addPerson, PersonRef, samePerson } from './people';

export interface Meeting {
	path: string;
	title: string;
	/** Local calendar day, `YYYY-MM-DD`, or null when unknown. */
	date: string | null;
	startedAt: Date | null;
	endedAt: Date | null;
	/** Attendee names, for display. */
	attendees: string[];
	people: PersonRef[];
}

export interface MeetingGroup {
	/** `YYYY-MM-DD`, or `undated`. */
	key: string;
	meetings: Meeting[];
}

export interface HeadingRef {
	heading: string;
	level: number;
	offset: number;
}

export interface LinkRef {
	link: string;
	displayText?: string;
	offset: number;
}

export const UNDATED_KEY = 'undated';

const GUIDE_FILE_NAMES = ['SHADOW.md', 'README.md'];
const SET_ASIDE_FOLDERS = ['Unsynced Files', 'Archived Vaults'];
const MEETING_ANCHOR_PATTERN = /^(?:(.*)\/)?Meetings\/\d{4}\/\d{2}\/[^/]+\/[^/]+\.md$/u;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const TIMESTAMP_PATTERN =
	/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(UTC|Z|GMT\s*[+-]\d{2}:?\d{2}|[+-]\d{2}:?\d{2})?$/iu;

function pad2(value: number): string {
	return String(value).padStart(2, '0');
}

export function localDateKey(date: Date): string {
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function offsetMinutes(zone: string | undefined): number | null {
	if (!zone) return null;
	const normalized = zone.toUpperCase().replace(/^GMT\s*/u, '');
	if (normalized === 'UTC' || normalized === 'Z') return 0;
	const match = /^([+-])(\d{2}):?(\d{2})$/u.exec(normalized);
	if (!match) return null;
	const minutes = Number(match[2]) * 60 + Number(match[3]);
	return match[1] === '-' ? -minutes : minutes;
}

/** Parses Shadow's readable timestamps. A value without a zone is local time. */
export function parseShadowTimestamp(value: unknown): Date | null {
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
	if (typeof value !== 'string') return null;
	const raw = value.trim();
	if (!raw) return null;
	const match = TIMESTAMP_PATTERN.exec(raw);
	if (match) {
		const [year, month, day, hour, minute] = match.slice(1, 6).map(Number) as [
			number,
			number,
			number,
			number,
			number,
		];
		const second = match[6] ? Number(match[6]) : 0;
		const offset = offsetMinutes(match[7]);
		if (offset === null) {
			return new Date(year, month - 1, day, hour, minute, second);
		}
		return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - offset * 60_000);
	}
	if (DATE_ONLY_PATTERN.test(raw)) return null;
	const parsed = new Date(raw);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Returns a `YYYY-MM-DD` calendar day, or null. */
export function parseDateKey(value: unknown): string | null {
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
	}
	if (typeof value !== 'string') return null;
	const match = DATE_ONLY_PATTERN.exec(value.trim());
	return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

export function isMeetingFrontmatter(frontmatter: Record<string, unknown> | null | undefined): boolean {
	const type = frontmatter?.['type'];
	return typeof type === 'string' && type.trim().toLowerCase() === 'meeting';
}

/** Links inside the section under the heading named `heading`, in order. */
export function linksInSection(headings: HeadingRef[], links: LinkRef[], heading: string): LinkRef[] {
	const wanted = heading.trim().toLowerCase();
	const start = headings.find((h) => h.heading.trim().toLowerCase() === wanted);
	if (!start) return [];
	const end = headings.find((h) => h.offset > start.offset && h.level <= start.level);
	return links.filter((link) => link.offset > start.offset && (!end || link.offset < end.offset));
}

/** People from an `attendees` property, if a page has one: names, links or {name, email}. */
function peopleFromFrontmatter(value: unknown): PersonRef[] {
	if (!Array.isArray(value)) return [];
	const people: PersonRef[] = [];
	for (const entry of value) {
		let name = '';
		let email: string | null = null;
		if (typeof entry === 'string') name = entry;
		else if (entry && typeof entry === 'object') {
			const record = entry as Record<string, unknown>;
			if (typeof record['name'] === 'string') name = record['name'];
			if (typeof record['email'] === 'string') email = record['email'];
		}
		name = name.replace(/^\[\[(?:[^\]|]*\|)?([^\]]*)\]\]$/u, '$1').trim();
		if (name) addPerson(people, { name, email, path: null });
	}
	return people;
}

function fileBaseName(path: string): string {
	return (path.split('/').pop() ?? path).replace(/\.md$/iu, '');
}

/** Builds a meeting from a page's frontmatter, or null if it is not a Shadow meeting page. */
export function meetingFromPage(
	path: string,
	frontmatter: Record<string, unknown> | null | undefined,
	bodyPeople: PersonRef[] = [],
): Meeting | null {
	if (!frontmatter || !isMeetingFrontmatter(frontmatter)) return null;
	const rawTitle = frontmatter['title'];
	const title = typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle.trim() : fileBaseName(path);
	const startedAt =
		parseShadowTimestamp(frontmatter['startedAt']) ?? parseShadowTimestamp(frontmatter['createdAt']);
	const endedAt = parseShadowTimestamp(frontmatter['endedAt']);
	const date = parseDateKey(frontmatter['date']) ?? (startedAt ? localDateKey(startedAt) : null);
	const people = peopleFromFrontmatter(frontmatter['attendees']);
	for (const person of bodyPeople) addPerson(people, person);
	return { path, title, date, startedAt, endedAt, attendees: people.map((p) => p.name), people };
}

function trimSlashes(folder: string): string {
	return folder.trim().replace(/^\/+|\/+$/gu, '');
}

/** True when `path` is a page directly inside `<shadowFolder>/Meetings/`. */
export function isInMeetingsFolder(path: string, shadowFolder: string): boolean {
	const folder = trimSlashes(shadowFolder);
	const prefix = folder ? `${folder}/Meetings/` : 'Meetings/';
	return path.startsWith(prefix);
}

function isSetAside(folder: string): boolean {
	return folder.split('/').some((part) => SET_ASIDE_FOLDERS.includes(part));
}

/**
 * Finds Shadow folders in a vault. A folder holding a Shadow guide
 * (`SHADOW.md`, or `README.md` from earlier versions, with `type: shadow-vault`)
 * wins. Without a guide, the folder above `Meetings/<YYYY>/<MM>/` of a
 * meeting page is used. `''` means the vault root.
 */
export function detectShadowFolders(
	files: Array<{ path: string; frontmatter: Record<string, unknown> | null | undefined }>,
): string[] {
	const fromGuides = new Set<string>();
	const fromMeetings = new Set<string>();
	for (const { path, frontmatter } of files) {
		const name = path.split('/').pop() ?? '';
		const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
		if (isSetAside(folder)) continue;
		const type = frontmatter?.['type'];
		if (GUIDE_FILE_NAMES.includes(name) && typeof type === 'string' && type.trim() === 'shadow-vault') {
			fromGuides.add(folder);
			continue;
		}
		if (!isMeetingFrontmatter(frontmatter)) continue;
		const match = MEETING_ANCHOR_PATTERN.exec(path);
		if (match) fromMeetings.add(match[1] ?? '');
	}
	const found = fromGuides.size > 0 ? fromGuides : fromMeetings;
	return [...found].sort((a, b) => a.localeCompare(b));
}

function sortTime(meeting: Meeting): number {
	if (meeting.startedAt) return meeting.startedAt.getTime();
	if (meeting.date) {
		const [y, m, d] = meeting.date.split('-').map(Number) as [number, number, number];
		return new Date(y, m - 1, d).getTime();
	}
	return Number.NEGATIVE_INFINITY;
}

/** Sorts newest first. */
export function sortMeetings(meetings: Meeting[]): Meeting[] {
	return [...meetings].sort((a, b) => {
		const diff = sortTime(b) - sortTime(a);
		if (diff !== 0 && !Number.isNaN(diff)) return diff;
		return a.title.localeCompare(b.title);
	});
}

/** Groups meetings by calendar day, newest day first, undated last. */
export function groupMeetingsByDate(meetings: Meeting[]): MeetingGroup[] {
	const groups = new Map<string, Meeting[]>();
	for (const meeting of sortMeetings(meetings)) {
		const key = meeting.date ?? UNDATED_KEY;
		const list = groups.get(key);
		if (list) list.push(meeting);
		else groups.set(key, [meeting]);
	}
	return [...groups.entries()]
		.sort(([a], [b]) => {
			if (a === UNDATED_KEY) return 1;
			if (b === UNDATED_KEY) return -1;
			return b.localeCompare(a);
		})
		.map(([key, list]) => ({ key, meetings: list }));
}

/**
 * Meetings a person attended, newest first: the person is in the Attendees,
 * or the meeting is linked from the person's own page.
 */
export function meetingsWithPerson(
	meetings: Meeting[],
	person: PersonRef,
	linkedPaths: ReadonlySet<string> = new Set(),
): Meeting[] {
	return sortMeetings(
		meetings.filter((m) => linkedPaths.has(m.path) || m.people.some((p) => samePerson(p, person))),
	);
}

/** The latest meeting with this person before `current`, or null. */
export function previousMeetingWith(meetings: Meeting[], person: PersonRef, current: Meeting): Meeting | null {
	const before = sortTime(current);
	return (
		meetingsWithPerson(meetings, person).find((m) => m.path !== current.path && sortTime(m) < before) ?? null
	);
}

const AUDIO_FILE_NAMES = ['audio.m4a', 'audio.wav', 'mergedaudio.m4a', 'mergedaudio.wav'];

/** Shadow names a meeting's recording `Audio.m4a`, `Audio.wav` or `MergedAudio.*`. */
export function isMeetingAudio(fileName: string): boolean {
	return AUDIO_FILE_NAMES.includes(fileName.toLowerCase());
}

export function meetingsOnDate(meetings: Meeting[], dateKey: string): Meeting[] {
	return sortMeetings(meetings.filter((m) => m.date === dateKey)).reverse();
}

function addDays(dateKey: string, days: number): string {
	const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number];
	return localDateKey(new Date(y, m - 1, d + days));
}

/** "Today", "Yesterday", or a readable date such as "Thu, Oct 16, 2026". */
export function formatGroupHeading(key: string, todayKey: string, locale?: string): string {
	if (key === UNDATED_KEY) return 'No date';
	if (key === todayKey) return 'Today';
	if (key === addDays(todayKey, -1)) return 'Yesterday';
	const [y, m, d] = key.split('-').map(Number) as [number, number, number];
	return new Date(y, m - 1, d).toLocaleDateString(locale, {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	});
}

/** "1 hr 5 min", "12 min", or null when the length is unknown. */
export function formatDuration(startedAt: Date | null, endedAt: Date | null): string | null {
	if (!startedAt || !endedAt) return null;
	const minutes = Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000);
	if (minutes < 0) return null;
	if (minutes < 1) return 'Under 1 min';
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	if (hours === 0) return `${rest} min`;
	return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

export function formatAttendees(names: string[], max = 3): string | null {
	if (names.length === 0) return null;
	const shown = names.slice(0, max).join(', ');
	const more = names.length - max;
	return more > 0 ? `${shown} +${more}` : shown;
}
