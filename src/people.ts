// Person identity, matched the way the Shadow app matches People
// (shadow-frontend requirements, APP-REQ-283):
//   1. An email is one Person (case ignored).
//   2. Without an email, a name is one Person (Unicode NFKC, spaces trimmed
//      and collapsed, case ignored).
//   3. A Person with an email and a no-email Person of the same name are two
//      People.
// Pure functions only, so they can be unit tested in Node.

export interface PersonRef {
	name: string;
	email: string | null;
	/** Vault path of the Person page, when it exists. */
	path: string | null;
}

const EMAIL_IN_NAME = /\s*\(([^()\s]+@[^()\s]+)\)$/u;

export function normalizeName(name: string): string {
	return name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

export function normalizeEmail(email: unknown): string | null {
	if (typeof email !== 'string') return null;
	const value = email.trim().toLowerCase();
	return value.includes('@') ? value : null;
}

export function samePerson(a: PersonRef, b: PersonRef): boolean {
	const emailA = normalizeEmail(a.email);
	const emailB = normalizeEmail(b.email);
	if (emailA || emailB) return emailA !== null && emailA === emailB;
	const nameA = normalizeName(a.name);
	return nameA.length > 0 && nameA === normalizeName(b.name);
}

function baseName(path: string): string {
	const target = path.split('#')[0] ?? '';
	return (target.split('/').pop() ?? '').replace(/\.md$/iu, '');
}

/** Splits a Person file name, `<name> (<email>)` or `<name>`. */
export function parsePersonFileName(fileName: string): { name: string; email: string | null } {
	const base = baseName(fileName);
	const match = EMAIL_IN_NAME.exec(base);
	if (!match) return { name: base.trim(), email: null };
	return { name: base.slice(0, match.index).trim(), email: normalizeEmail(match[1]) };
}

/** A Person page: properties `name` and optional `email`, else the file name. */
export function personFromPage(path: string, frontmatter: Record<string, unknown> | null | undefined): PersonRef {
	const fromName = parsePersonFileName(path);
	const rawName = frontmatter?.['name'];
	const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : fromName.name;
	const email = normalizeEmail(frontmatter?.['email']) ?? fromName.email;
	return { name, email, path };
}

/**
 * A Person from an Attendees link. A resolved Person page wins; otherwise the
 * link text (`People/<name> (<email>)`) and its display text are used.
 */
export function personFromLink(
	link: string,
	displayText: string | undefined,
	resolved: { path: string; frontmatter: Record<string, unknown> | null | undefined } | null,
): PersonRef | null {
	if (resolved) return personFromPage(resolved.path, resolved.frontmatter);
	const parsed = parsePersonFileName(link);
	// Obsidian reports the link itself as display text when there is no alias.
	const display = displayText?.trim();
	const name = display && display !== link.trim() ? display : parsed.name;
	if (!name) return null;
	return { name, email: parsed.email, path: null };
}

/** Adds a person unless the same person is already listed. */
export function addPerson(people: PersonRef[], person: PersonRef): void {
	const existing = people.find((p) => samePerson(p, person));
	if (!existing) people.push(person);
	else if (!existing.path && person.path) existing.path = person.path;
}
