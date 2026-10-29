import { describe, expect, it } from 'vitest';
import type { Meeting } from '../src/meetings';
import {
	assignLanes,
	buildWeek,
	chipLabels,
	formatTotal,
	initials,
	latestMeetingWeek,
	OPEN_ENDED_MINUTES,
	sortPeopleCards,
	weekStart,
} from '../src/timeline';

// vitest.config.ts sets TZ to Asia/Seoul, so local times below are KST.
function meeting(title: string, start: string | null, end: string | null, extra: Partial<Meeting> = {}): Meeting {
	const startedAt = start ? new Date(start) : null;
	return {
		path: `Shadow/Meetings/${title}.md`,
		title,
		date: start ? start.slice(0, 10) : null,
		startedAt,
		endedAt: end ? new Date(end) : null,
		attendees: [],
		people: [],
		...extra,
	};
}

const SUNDAY = new Date(2026, 9, 25);

describe('weekStart', () => {
	it('starts on the locale first day', () => {
		const thursday = new Date(2026, 9, 29, 15, 30);
		expect(weekStart(thursday, 0)).toEqual(new Date(2026, 9, 25));
		expect(weekStart(thursday, 1)).toEqual(new Date(2026, 9, 26));
		expect(weekStart(new Date(2026, 9, 25), 1)).toEqual(new Date(2026, 9, 19));
	});
});

describe('assignLanes', () => {
	it('splits overlapping meetings and gives a later free slot the full width', () => {
		const placed = assignLanes([
			{ id: 'a', start: 540, end: 600 },
			{ id: 'b', start: 570, end: 630 },
			{ id: 'c', start: 600, end: 615 },
			{ id: 'd', start: 660, end: 690 },
		]);
		const byId = Object.fromEntries(placed.map((p) => [p.id, [p.lane, p.lanes]]));
		expect(byId).toEqual({ a: [0, 2], b: [1, 2], c: [0, 2], d: [0, 1] });
	});

	it('uses three lanes when three meetings overlap at once', () => {
		const placed = assignLanes([
			{ start: 600, end: 660 },
			{ start: 600, end: 630 },
			{ start: 610, end: 640 },
		]);
		expect(placed.map((p) => p.lanes)).toEqual([3, 3, 3]);
		expect(new Set(placed.map((p) => p.lane)).size).toBe(3);
	});
});

describe('buildWeek', () => {
	const meetings = [
		meeting('Weekly product sync', '2026-10-29T09:30:00+09:00', '2026-10-29T10:15:00+09:00'),
		meeting('Overlapping call', '2026-10-29T10:00:00+09:00', '2026-10-29T10:30:00+09:00'),
		meeting('Still recording', '2026-10-30T16:00:00+09:00', null),
		meeting('All hands', '2026-10-27T07:00:00+09:00', '2026-10-27T08:00:00+09:00'),
		meeting('Last week', '2026-10-22T09:30:00+09:00', '2026-10-22T10:00:00+09:00'),
		meeting('Date only', null, null, { date: '2026-10-28' }),
	];
	const week = buildWeek(meetings, SUNDAY);

	it('places only this week, on the day each meeting started', () => {
		expect(week.days.map((d) => d.key)).toEqual([
			'2026-10-25',
			'2026-10-26',
			'2026-10-27',
			'2026-10-28',
			'2026-10-29',
			'2026-10-30',
			'2026-10-31',
		]);
		expect(week.meetingCount).toBe(5);
		expect(week.days[4]?.blocks.map((b) => b.meeting.title)).toEqual(['Weekly product sync', 'Overlapping call']);
		expect(week.days[3]?.untimed.map((m) => m.title)).toEqual(['Date only']);
	});

	it('positions blocks by local start and end and splits overlaps', () => {
		const [sync, call] = week.days[4]?.blocks ?? [];
		expect([sync?.start, sync?.end, sync?.lane, sync?.lanes]).toEqual([570, 615, 0, 2]);
		expect([call?.start, call?.end, call?.lane, call?.lanes]).toEqual([600, 630, 1, 2]);
	});

	it('gives a meeting with no endedAt a short open-ended block', () => {
		const block = week.days[5]?.blocks[0];
		expect(block?.openEnded).toBe(true);
		expect((block?.end ?? 0) - (block?.start ?? 0)).toBe(OPEN_ENDED_MINUTES);
	});

	it('widens the hours to fit early meetings and totals known lengths', () => {
		expect(week.hours).toEqual([7, 18]);
		expect(week.minutes).toBe(45 + 30 + 60);
	});

	it('keeps the default working hours for a quiet week', () => {
		expect(buildWeek([], SUNDAY).hours).toEqual([9, 18]);
	});

	it('finds the latest week with meetings', () => {
		expect(latestMeetingWeek(meetings, 0)).toEqual(SUNDAY);
		expect(latestMeetingWeek([], 0)).toBeNull();
	});
});

describe('chipLabels', () => {
	it('shows three attendees and counts the rest', () => {
		const names = ['Priya', 'Sam', 'Lena', 'Kim', 'Dana', 'Omar', 'Mia', 'Yuki', 'Noah'];
		expect(chipLabels(names)).toEqual(['Priya', 'Sam', 'Lena', '+6']);
		expect(chipLabels(['Priya', 'Sam'])).toEqual(['Priya', 'Sam']);
	});
});

describe('formatting', () => {
	it('formats a week total', () => {
		expect(formatTotal(45)).toBe('45 min');
		expect(formatTotal(120)).toBe('2 hr');
		expect(formatTotal(135)).toBe('2 hr 15 min');
	});

	it('makes initials from the first and last name', () => {
		expect(initials('Priya Raman')).toBe('PR');
		expect(initials('Kim')).toBe('K');
		expect(initials('  ')).toBe('?');
		expect(initials('김 민수')).toBe('김민');
	});
});

describe('sortPeopleCards', () => {
	it('puts the person met most recently first and people with no meetings last', () => {
		const older = meeting('Older', '2026-10-20T10:00:00+09:00', null);
		const newer = meeting('Newer', '2026-10-28T10:00:00+09:00', null);
		const card = (name: string, list: Meeting[]) => ({ person: { name, email: null, path: null }, path: `${name}.md`, meetings: list });
		const sorted = sortPeopleCards([card('Ana', []), card('Ben', [older]), card('Cy', [newer, older]), card('Ab', [])]);
		expect(sorted.map((c) => c.person.name)).toEqual(['Cy', 'Ben', 'Ab', 'Ana']);
	});
});
