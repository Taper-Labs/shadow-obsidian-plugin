import { describe, expect, it } from 'vitest';
import { BASE_FILE_NAME, buildMeetingsBase } from '../src/bases';

// Keys the Shadow app writes (shadow-frontend markdown.ts): meeting pages have
// type, title, date, createdAt, startedAt, endedAt; Person pages name, email.
const SHADOW_KEYS = new Set(['type', 'title', 'date', 'createdAt', 'startedAt', 'endedAt', 'name', 'email']);
// Names in an expression that are not functions, members, file or formula
// references, or literals: these are the note properties the base reads.
const NOT_PROPERTIES = new Set(['file', 'formula', 'value', 'true', 'false']);

function noteProperties(base: string): string[] {
	const expressions = [...base.matchAll(/^\s*(?:- |[a-z_]+: )'(.*)'$/gmu)]
		.map((m) => (m[1] ?? '').replace(/''/gu, "'"))
		.filter((e) => /[(."=]/u.test(e));
	const names = new Set<string>();
	for (const expression of expressions) {
		const code = expression.replace(/"(?:[^"\\]|\\.)*"/gu, '""');
		for (const match of code.matchAll(/(?<![.\w])([A-Za-z_]\w*)(?![\w(])/gu)) {
			const name = match[1] ?? '';
			if (!NOT_PROPERTIES.has(name)) names.add(name);
		}
	}
	return [...names].sort();
}

describe('buildMeetingsBase', () => {
	const base = buildMeetingsBase('Shadow');

	it('names the file for the Bases core plugin', () => {
		expect(BASE_FILE_NAME).toBe('Shadow meetings.base');
	});

	it('has the three views', () => {
		expect([...base.matchAll(/^ {4}name: '(.*)'$/gmu)].map((m) => m[1])).toEqual([
			'All meetings',
			'This week',
			'People',
		]);
	});

	it("reads only the Shadow folder's meeting and People pages", () => {
		expect(base).toContain(`        - 'file.inFolder("Shadow/Meetings")'\n        - 'type == "meeting"'`);
		expect(base).toContain(`        - 'file.inFolder("Shadow/People")'`);
		expect(base).toContain(`'date.format("GGGG-WW") == today().format("GGGG-WW")'`);
		expect(base).not.toContain('Unsynced');
	});

	it('keeps the time zone Shadow writes when reading startedAt and endedAt', () => {
		expect(base).toContain(
			`started: 'if(startedAt, date(startedAt.replace(" UTC", "Z").replace(" GMT", "").replace(" ", "T")))'`,
		);
		expect(base).toContain('number(date(endedAt.replace(" UTC", "Z").replace(" GMT", "").replace(" ", "T")))');
	});

	it('finds people and meetings through the links Shadow writes', () => {
		expect(base).toContain(`people: 'file.links.filter(value.asFile().inFolder("Shadow/People")).unique()'`);
		expect(base).toContain(`meetings: 'file.links.filter(value.asFile().inFolder("Shadow/Meetings"))'`);
		expect(base).toContain('formula.meetings[0].asFile().properties.date');
	});

	it('uses only properties Shadow writes', () => {
		const used = noteProperties(base);
		expect(used).toEqual(['date', 'endedAt', 'name', 'startedAt', 'type']);
		expect(used.every((name) => SHADOW_KEYS.has(name))).toBe(true);
	});

	it('works when the vault itself is the Shadow folder', () => {
		const root = buildMeetingsBase('');
		expect(root).toContain('file.inFolder("Meetings")');
		expect(root).toContain('file.inFolder("People")');
		expect(root).toContain('saves in the vault root.');
	});

	it("escapes folder names with quotes for both Bases and YAML", () => {
		const odd = buildMeetingsBase(`Jay's "Notes"/Shadow`);
		expect(odd).toContain(`'file.inFolder("Jay''s \\"Notes\\"/Shadow/Meetings")'`);
	});
});
