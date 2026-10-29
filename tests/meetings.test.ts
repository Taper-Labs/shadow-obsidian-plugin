import { describe, expect, it } from 'vitest';
import {
	attendeesFromLinks,
	detectShadowFolders,
	formatAttendees,
	formatDuration,
	formatGroupHeading,
	groupMeetingsByDate,
	HeadingRef,
	isInMeetingsFolder,
	LinkRef,
	localDateKey,
	Meeting,
	meetingFromPage,
	meetingsOnDate,
	parseDateKey,
	parseShadowTimestamp,
	UNDATED_KEY,
} from '../src/meetings';

// A meeting page exactly as the Shadow Mac app writes it (2.4.x export).
const MEETING_PAGE = `---
type: meeting
title: "Modern Taste and Success Update"
date: 2026-10-16
createdAt: "2026-10-15 15:36:02 UTC"
startedAt: "2026-10-15 15:36:01 UTC"
endedAt: "2026-10-15 15:37:36 UTC"
---

> [!note] Managed by Shadow
> Shadow keeps this file in sync. (Shadow Reference ID: 8d4e4ab2bf0f4c1a88471ddf983395ca)

## Attendees

| name | email |
|---|---|
| [[People/Cakie (cakie.ai.official@gmail.com)\\|Cakie]] | cakie.ai.official@gmail.com |
| [[People/Priya Raman (priya@example.com)\\|Priya Raman]] | priya@example.com |

## Speaker Assignments

| speaker | person | email |
|---|---|---|
| Speaker 1 | [[People/Jay Song (jay@shadow.do)\\|Jay Song]] | jay@shadow.do |

## Materials

- [[Meetings/2026/10/2026-10-16 Modern Taste and Success Update/Transcript|Transcript]]
`;

// Mimics the headings and links Obsidian's metadata cache reports for a page.
function cacheOf(markdown: string): { headings: HeadingRef[]; links: LinkRef[] } {
	const headings: HeadingRef[] = [];
	for (const match of markdown.matchAll(/^(#{1,6}) (.+)$/gmu)) {
		headings.push({ heading: match[2] ?? '', level: (match[1] ?? '').length, offset: match.index ?? 0 });
	}
	const links: LinkRef[] = [];
	for (const match of markdown.matchAll(/\[\[([^\]|\\]+)(?:\\?\|([^\]]+))?\]\]/gu)) {
		links.push({ link: match[1] ?? '', displayText: match[2], offset: match.index ?? 0 });
	}
	return { headings, links };
}

function meeting(partial: Partial<Meeting> & { title: string }): Meeting {
	return { path: `${partial.title}.md`, date: null, startedAt: null, endedAt: null, attendees: [], ...partial };
}

describe('parseShadowTimestamp', () => {
	it('reads UTC timestamps Shadow writes', () => {
		expect(parseShadowTimestamp('2026-10-15 15:36:01 UTC')?.toISOString()).toBe('2026-10-15T15:36:01.000Z');
		expect(parseShadowTimestamp('2026-10-15 15:36 UTC')?.toISOString()).toBe('2026-10-15T15:36:00.000Z');
	});

	it('reads GMT offsets and ISO strings', () => {
		expect(parseShadowTimestamp('2026-10-16 00:36 GMT+09:00')?.toISOString()).toBe('2026-10-15T15:36:00.000Z');
		expect(parseShadowTimestamp('2026-10-15 10:36 GMT-05:00')?.toISOString()).toBe('2026-10-15T15:36:00.000Z');
		expect(parseShadowTimestamp('2026-10-15T15:36:01.250Z')?.toISOString()).toBe('2026-10-15T15:36:01.000Z');
	});

	it('treats a timestamp without a zone as local time', () => {
		const parsed = parseShadowTimestamp('2026-10-16 09:30');
		expect(parsed && localDateKey(parsed)).toBe('2026-10-16');
		expect(parsed?.getHours()).toBe(9);
	});

	it('returns null for empty, null, date-only and invalid values', () => {
		expect(parseShadowTimestamp(null)).toBeNull();
		expect(parseShadowTimestamp('')).toBeNull();
		expect(parseShadowTimestamp('2026-10-16')).toBeNull();
		expect(parseShadowTimestamp('soon')).toBeNull();
		expect(parseShadowTimestamp(42)).toBeNull();
	});
});

describe('parseDateKey', () => {
	it('accepts YYYY-MM-DD strings and dates', () => {
		expect(parseDateKey('2026-10-16')).toBe('2026-10-16');
		expect(parseDateKey(' 2026-10-16 ')).toBe('2026-10-16');
		expect(parseDateKey(new Date(Date.UTC(2026, 9, 16)))).toBe('2026-10-16');
	});

	it('rejects anything else', () => {
		expect(parseDateKey(null)).toBeNull();
		expect(parseDateKey('Oct 16')).toBeNull();
		expect(parseDateKey('2026-10-16 10:00')).toBeNull();
	});
});

describe('attendeesFromLinks', () => {
	it('takes only the people linked in the Attendees table', () => {
		const { headings, links } = cacheOf(MEETING_PAGE);
		expect(attendeesFromLinks(headings, links)).toEqual(['Cakie', 'Priya Raman']);
	});

	it('falls back to the Person file name without the email', () => {
		const headings = [{ heading: 'Attendees', level: 2, offset: 0 }];
		const links = [{ link: 'People/Dana Lee (dana@example.com)', offset: 10 }];
		expect(attendeesFromLinks(headings, links)).toEqual(['Dana Lee']);
	});

	it('returns nothing when there is no Attendees section', () => {
		expect(attendeesFromLinks([], [{ link: 'People/A', offset: 1 }])).toEqual([]);
	});
});

describe('meetingFromPage', () => {
	const frontmatter = {
		type: 'meeting',
		title: 'Modern Taste and Success Update',
		date: '2026-10-16',
		createdAt: '2026-10-15 15:36:02 UTC',
		startedAt: '2026-10-15 15:36:01 UTC',
		endedAt: '2026-10-15 15:37:36 UTC',
	};
	const path =
		'Shadow/Meetings/2026/10/2026-10-16 Modern Taste and Success Update/Modern Taste and Success Update.md';

	it('builds a meeting from the frontmatter Shadow writes', () => {
		const result = meetingFromPage(path, frontmatter, ['Cakie']);
		expect(result).toMatchObject({
			path,
			title: 'Modern Taste and Success Update',
			date: '2026-10-16',
			attendees: ['Cakie'],
		});
		expect(result?.startedAt?.toISOString()).toBe('2026-10-15T15:36:01.000Z');
		expect(result?.endedAt?.toISOString()).toBe('2026-10-15T15:37:36.000Z');
	});

	it('ignores pages that are not meetings', () => {
		expect(meetingFromPage('People/Cakie.md', { name: 'Cakie' })).toBeNull();
		expect(meetingFromPage('SHADOW.md', { type: 'shadow-vault' })).toBeNull();
		expect(meetingFromPage('a.md', null)).toBeNull();
	});

	it('falls back to the file name, createdAt and the local start date', () => {
		const result = meetingFromPage('Meetings/2026/10/x/Weekly sync.md', {
			type: 'Meeting',
			title: '',
			date: null,
			createdAt: '2026-10-16 01:00 GMT+09:00',
			startedAt: null,
			endedAt: null,
		});
		expect(result?.title).toBe('Weekly sync');
		expect(result?.startedAt?.toISOString()).toBe('2026-10-15T16:00:00.000Z');
		expect(result?.date).toBe(localDateKey(new Date('2026-10-15T16:00:00.000Z')));
	});

	it('merges an attendees property with the Attendees table', () => {
		const result = meetingFromPage(
			'm.md',
			{ type: 'meeting', attendees: ['[[People/Ann (ann@x.io)|Ann]]', { name: 'Bo' }, 'Ann'] },
			['Bo', 'Cy'],
		);
		expect(result?.attendees).toEqual(['Ann', 'Bo', 'Cy']);
	});
});

describe('isInMeetingsFolder', () => {
	it('matches the Meetings folder of the Shadow folder only', () => {
		expect(isInMeetingsFolder('Shadow/Meetings/2026/10/a/a.md', 'Shadow')).toBe(true);
		expect(isInMeetingsFolder('Shadow/Meetings/2026/10/a/a.md', '/Shadow/')).toBe(true);
		expect(isInMeetingsFolder('Meetings/2026/10/a/a.md', '')).toBe(true);
		expect(isInMeetingsFolder('Shadow/Unsynced Files/Rejected/t/Meetings/2026/10/a/a.md', 'Shadow')).toBe(false);
		expect(isInMeetingsFolder('Other/Meetings/a.md', 'Shadow')).toBe(false);
	});
});

describe('detectShadowFolders', () => {
	it('uses the folder that holds SHADOW.md', () => {
		expect(
			detectShadowFolders([
				{ path: 'Work/Shadow/SHADOW.md', frontmatter: { type: 'shadow-vault', schema_version: 1 } },
				{ path: 'Work/Shadow/Meetings/2026/10/a/a.md', frontmatter: { type: 'meeting' } },
				{ path: 'README.md', frontmatter: null },
			]),
		).toEqual(['Work/Shadow']);
	});

	it('finds a vault that is the Shadow folder itself, and legacy README guides', () => {
		expect(detectShadowFolders([{ path: 'SHADOW.md', frontmatter: { type: 'shadow-vault' } }])).toEqual(['']);
		expect(detectShadowFolders([{ path: 'Old/README.md', frontmatter: { type: 'shadow-vault' } }])).toEqual([
			'Old',
		]);
	});

	it('falls back to meeting page locations and skips set-aside copies', () => {
		expect(
			detectShadowFolders([
				{ path: 'Notes/Shadow/Meetings/2026/10/2026-10-16 A/A.md', frontmatter: { type: 'meeting' } },
				{
					path: 'Notes/Shadow/Unsynced Files/Rejected Sync/2026-10-16 00-50-06/Meetings/2026/10/2026-10-16 A/A.md',
					frontmatter: { type: 'meeting' },
				},
				{ path: 'Notes/Shadow/Meetings/2026/10/2026-10-16 A/Transcript.md', frontmatter: { type: 'transcript' } },
			]),
		).toEqual(['Notes/Shadow']);
	});

	it('returns nothing for a vault without Shadow pages', () => {
		expect(detectShadowFolders([{ path: 'Daily/2026-10-16.md', frontmatter: { tags: ['daily'] } }])).toEqual([]);
	});
});

describe('groupMeetingsByDate', () => {
	const at = (iso: string) => new Date(iso);

	it('groups by calendar day, newest day and newest meeting first, undated last', () => {
		const groups = groupMeetingsByDate([
			meeting({ title: 'Old', date: '2026-10-14', startedAt: at('2026-10-14T01:00:00Z') }),
			meeting({ title: 'Morning', date: '2026-10-16', startedAt: at('2026-10-16T00:30:00Z') }),
			meeting({ title: 'No date' }),
			meeting({ title: 'Afternoon', date: '2026-10-16', startedAt: at('2026-10-16T06:00:00Z') }),
			meeting({ title: 'Date only', date: '2026-10-15' }),
		]);
		expect(groups.map((g) => g.key)).toEqual(['2026-10-16', '2026-10-15', '2026-10-14', UNDATED_KEY]);
		expect(groups[0]?.meetings.map((m) => m.title)).toEqual(['Afternoon', 'Morning']);
	});

	it('uses the date property, not the UTC day of startedAt', () => {
		// 00:30 on Oct 16 in Seoul is Oct 15 in UTC; Shadow writes date: 2026-10-16.
		const groups = groupMeetingsByDate([
			meeting({ title: 'Early', date: '2026-10-16', startedAt: at('2026-10-15T15:30:00Z') }),
		]);
		expect(groups[0]?.key).toBe('2026-10-16');
	});

	it('returns no groups for no meetings', () => {
		expect(groupMeetingsByDate([])).toEqual([]);
	});
});

describe('meetingsOnDate', () => {
	it("returns one day's meetings in the order they happened", () => {
		const list = [
			meeting({ title: 'B', date: '2026-10-16', startedAt: new Date('2026-10-16T05:00:00Z') }),
			meeting({ title: 'A', date: '2026-10-16', startedAt: new Date('2026-10-16T01:00:00Z') }),
			meeting({ title: 'Other', date: '2026-10-15' }),
		];
		expect(meetingsOnDate(list, '2026-10-16').map((m) => m.title)).toEqual(['A', 'B']);
		expect(meetingsOnDate(list, '2026-10-17')).toEqual([]);
	});
});

describe('formatting', () => {
	it('labels today, yesterday and other days', () => {
		expect(formatGroupHeading('2026-10-29', '2026-10-29')).toBe('Today');
		expect(formatGroupHeading('2026-10-28', '2026-10-29')).toBe('Yesterday');
		expect(formatGroupHeading('2026-09-30', '2026-10-01')).toBe('Yesterday');
		expect(formatGroupHeading('2026-10-16', '2026-10-29', 'en-US')).toBe('Fri, Oct 16, 2026');
		expect(formatGroupHeading(UNDATED_KEY, '2026-10-29')).toBe('No date');
	});

	it('formats durations', () => {
		const start = new Date('2026-10-16T01:00:00Z');
		const plus = (minutes: number) => new Date(start.getTime() + minutes * 60_000);
		expect(formatDuration(start, plus(0.4))).toBe('Under 1 min');
		expect(formatDuration(start, plus(12))).toBe('12 min');
		expect(formatDuration(start, plus(60))).toBe('1 hr');
		expect(formatDuration(start, plus(65))).toBe('1 hr 5 min');
		expect(formatDuration(start, null)).toBeNull();
		expect(formatDuration(plus(5), start)).toBeNull();
	});

	it('shortens long attendee lists', () => {
		expect(formatAttendees([])).toBeNull();
		expect(formatAttendees(['A', 'B'])).toBe('A, B');
		expect(formatAttendees(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C +2');
	});
});
