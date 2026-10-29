// Pure layout for the Shadow timeline view: which meetings fall in a week,
// where each block sits in its day column, and how overlapping meetings share
// the column. No Obsidian imports so it can be unit tested in Node.

import { localDateKey, Meeting, sortMeetings } from './meetings';
import type { PersonRef } from './people';

/** Height given to a meeting that has no `endedAt` yet. */
export const OPEN_ENDED_MINUTES = 30;
/** Hours always shown, so a quiet week still looks like a working week. */
export const DEFAULT_HOURS: [number, number] = [9, 18];

export interface TimelineBlock {
	meeting: Meeting;
	/** Minutes after local midnight. */
	start: number;
	end: number;
	/** True when Shadow wrote no `endedAt`; the block uses OPEN_ENDED_MINUTES. */
	openEnded: boolean;
	/** Column within the day for overlapping meetings, and how many share it. */
	lane: number;
	lanes: number;
}

export interface TimelineDay {
	/** `YYYY-MM-DD`, local. */
	key: string;
	date: Date;
	blocks: TimelineBlock[];
	/** Meetings with a date but no start time. */
	untimed: Meeting[];
}

export interface TimelineWeek {
	start: Date;
	days: TimelineDay[];
	/** First and last hour row to draw, `[from, to)`. */
	hours: [number, number];
	meetingCount: number;
	/** Total recorded minutes, from meetings that have both times. */
	minutes: number;
}

/** Local midnight of the first day of the week holding `date`. `firstDay` 0 is Sunday. */
export function weekStart(date: Date, firstDay: number): Date {
	const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	const back = (day.getDay() - firstDay + 7) % 7;
	return new Date(day.getFullYear(), day.getMonth(), day.getDate() - back);
}

export function addDaysTo(date: Date, days: number): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function minutesOfDay(date: Date): number {
	return date.getHours() * 60 + date.getMinutes();
}

function dayKeyOf(meeting: Meeting): string | null {
	return meeting.startedAt ? localDateKey(meeting.startedAt) : meeting.date;
}

/**
 * Gives each block a lane. Blocks that overlap, directly or through a chain,
 * form a cluster and split the column evenly between the cluster's lanes.
 */
export function assignLanes<T extends { start: number; end: number }>(items: T[]): Array<T & { lane: number; lanes: number }> {
	const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
	const placed: Array<T & { lane: number; lanes: number }> = [];
	let cluster: Array<T & { lane: number; lanes: number }> = [];
	let laneEnds: number[] = [];
	let clusterEnd = -Infinity;
	const close = () => {
		for (const item of cluster) item.lanes = laneEnds.length;
		placed.push(...cluster);
		cluster = [];
		laneEnds = [];
	};
	for (const item of sorted) {
		if (item.start >= clusterEnd) close();
		let lane = laneEnds.findIndex((end) => end <= item.start);
		if (lane === -1) {
			lane = laneEnds.length;
			laneEnds.push(item.end);
		} else {
			laneEnds[lane] = item.end;
		}
		cluster.push({ ...item, lane, lanes: 1 });
		clusterEnd = Math.max(clusterEnd, item.end);
	}
	close();
	return placed;
}

/** The meetings of the week starting at `start`, laid out by day and time. */
export function buildWeek(meetings: Meeting[], start: Date): TimelineWeek {
	const days: TimelineDay[] = [];
	for (let i = 0; i < 7; i++) {
		const date = addDaysTo(start, i);
		days.push({ key: localDateKey(date), date, blocks: [], untimed: [] });
	}
	const byKey = new Map(days.map((day) => [day.key, day]));
	let [fromHour, toHour] = DEFAULT_HOURS;
	let meetingCount = 0;
	let minutes = 0;
	const timed = new Map<TimelineDay, Array<Omit<TimelineBlock, 'lane' | 'lanes'>>>();

	for (const meeting of [...sortMeetings(meetings)].reverse()) {
		const key = dayKeyOf(meeting);
		const day = key ? byKey.get(key) : undefined;
		if (!day) continue;
		meetingCount++;
		if (!meeting.startedAt) {
			day.untimed.push(meeting);
			continue;
		}
		const begin = minutesOfDay(meeting.startedAt);
		const length =
			meeting.endedAt && meeting.endedAt > meeting.startedAt
				? Math.round((meeting.endedAt.getTime() - meeting.startedAt.getTime()) / 60_000)
				: null;
		if (length !== null) minutes += length;
		const end = Math.min(24 * 60, begin + Math.max(length ?? OPEN_ENDED_MINUTES, 1));
		const list = timed.get(day) ?? [];
		list.push({ meeting, start: begin, end, openEnded: length === null });
		timed.set(day, list);
		fromHour = Math.min(fromHour, Math.floor(begin / 60));
		toHour = Math.max(toHour, Math.ceil(end / 60));
	}
	for (const [day, list] of timed) day.blocks = assignLanes(list);
	return { start, days, hours: [fromHour, toHour], meetingCount, minutes };
}

/** The start of the latest week that has a meeting, or null. */
export function latestMeetingWeek(meetings: Meeting[], firstDay: number): Date | null {
	const latest = sortMeetings(meetings).find((m) => dayKeyOf(m));
	const key = latest ? dayKeyOf(latest) : null;
	if (!key) return null;
	const [y, m, d] = key.split('-').map(Number) as [number, number, number];
	return weekStart(new Date(y, m - 1, d), firstDay);
}

/** Up to `max` names, then "+N" for the rest. */
export function chipLabels(names: string[], max = 3): string[] {
	if (names.length <= max) return [...names];
	return [...names.slice(0, max), `+${names.length - max}`];
}

/** "2 hr 10 min" for a week's total. */
export function formatTotal(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	if (hours === 0) return `${rest} min`;
	return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

export interface PersonCard {
	person: PersonRef;
	path: string;
	/** Newest first. */
	meetings: Meeting[];
}

function cardTime(card: PersonCard): number {
	const latest = card.meetings[0];
	if (!latest) return -Infinity;
	if (latest.startedAt) return latest.startedAt.getTime();
	if (!latest.date) return -Infinity;
	const [y, m, d] = latest.date.split('-').map(Number) as [number, number, number];
	return new Date(y, m - 1, d).getTime();
}

/** People met most recently first; people with no meetings last, by name. */
export function sortPeopleCards(cards: PersonCard[]): PersonCard[] {
	return [...cards].sort((a, b) => {
		const diff = cardTime(b) - cardTime(a);
		if (diff !== 0 && !Number.isNaN(diff)) return diff;
		return b.meetings.length - a.meetings.length || a.person.name.localeCompare(b.person.name);
	});
}

/** "PR" for "Priya Raman", "K" for "Kim". */
export function initials(name: string): string {
	const parts = name.trim().split(/\s+/u).filter(Boolean);
	const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts.slice(0, 1);
	return letters.map((p) => Array.from(p ?? '')[0]?.toUpperCase() ?? '').join('') || '?';
}

/** A stable hue for a person, so their avatar keeps its color. */
export function hueFor(key: string): number {
	let hash = 0;
	for (const char of key) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 360;
	return hash;
}
