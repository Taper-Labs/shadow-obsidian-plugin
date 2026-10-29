import { describe, expect, it } from 'vitest';
import {
	addPerson,
	normalizeName,
	parsePersonFileName,
	PersonRef,
	personFromLink,
	personFromPage,
	samePerson,
} from '../src/people';

const p = (name: string, email: string | null = null): PersonRef => ({ name, email, path: null });

describe('samePerson (Shadow identity rule)', () => {
	it('one email is one person, whatever the name', () => {
		expect(samePerson(p('Priya', 'Priya@Northwind.dev'), p('Priya Raman', 'priya@northwind.dev'))).toBe(true);
		expect(samePerson(p('Priya', 'a@x.io'), p('Priya', 'b@x.io'))).toBe(false);
	});

	it('without an email, the normalized name is one person', () => {
		expect(samePerson(p('Kim'), p('  kim '))).toBe(true);
		expect(samePerson(p('Kim  Lee'), p('kim lee'))).toBe(true);
		expect(samePerson(p('Ｋｉｍ'), p('Kim'))).toBe(true);
		expect(samePerson(p('Kim'), p('Kimberly'))).toBe(false);
		expect(samePerson(p(''), p(''))).toBe(false);
	});

	it('a person with an email never matches a no-email person of the same name', () => {
		expect(samePerson(p('Kim', 'kim@fabrikam.com'), p('Kim'))).toBe(false);
		expect(samePerson(p('Kim'), p('Kim', 'kim@fabrikam.com'))).toBe(false);
	});
});

describe('Person pages and links', () => {
	it('splits Person file names', () => {
		expect(parsePersonFileName('People/Dana Lee (dana@acme.io).md')).toEqual({ name: 'Dana Lee', email: 'dana@acme.io' });
		expect(parsePersonFileName('Kim')).toEqual({ name: 'Kim', email: null });
		expect(parsePersonFileName('People/Team (Platform)')).toEqual({ name: 'Team (Platform)', email: null });
	});

	it('reads name and email properties first', () => {
		expect(personFromPage('Shadow/People/Kim 1.md', { name: 'Kim' })).toEqual({
			name: 'Kim',
			email: null,
			path: 'Shadow/People/Kim 1.md',
		});
		expect(personFromPage('Shadow/People/Dana Lee (dana@acme.io).md', null)).toEqual({
			name: 'Dana Lee',
			email: 'dana@acme.io',
			path: 'Shadow/People/Dana Lee (dana@acme.io).md',
		});
	});

	it('builds a person from an attendee link, preferring the resolved page', () => {
		expect(
			personFromLink('People/Dana Lee (dana@acme.io)', 'Dana', {
				path: 'Shadow/People/Dana Lee (dana@acme.io).md',
				frontmatter: { name: 'Dana Lee', email: 'dana@acme.io' },
			}),
		).toEqual({ name: 'Dana Lee', email: 'dana@acme.io', path: 'Shadow/People/Dana Lee (dana@acme.io).md' });
		expect(personFromLink('People/Kim', 'Kim', null)).toEqual({ name: 'Kim', email: null, path: null });
		// Obsidian repeats the link as display text when there is no alias.
		expect(personFromLink('People/Sam (sam@x.io)', 'People/Sam (sam@x.io)', null)).toEqual({
			name: 'Sam',
			email: 'sam@x.io',
			path: null,
		});
	});

	it('adds each person once and keeps a known page path', () => {
		const people: PersonRef[] = [];
		addPerson(people, p('Dana', 'dana@acme.io'));
		addPerson(people, { name: 'Dana Lee', email: 'DANA@acme.io', path: 'People/Dana Lee (dana@acme.io).md' });
		addPerson(people, p('Kim'));
		addPerson(people, p('Kim', 'kim@fabrikam.com'));
		expect(people.map((x) => [x.name, x.email, x.path])).toEqual([
			['Dana', 'dana@acme.io', 'People/Dana Lee (dana@acme.io).md'],
			['Kim', null, null],
			['Kim', 'kim@fabrikam.com', null],
		]);
	});

	it('normalizes names like Shadow', () => {
		expect(normalizeName('  Ｐriya  Raman ')).toBe('priya raman');
	});
});
