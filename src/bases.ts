// Builds the `.base` file (Obsidian core Bases) for a Shadow folder.
// Pure string building so the content can be unit tested.
//
// Only properties Shadow writes are used: meeting pages have `type`, `title`,
// `date`, `createdAt`, `startedAt`, `endedAt`; Person pages have `name` and
// `email`. People come from links: a meeting page links its attendees and
// speakers to `People/`, and a Person page links its meetings, newest first.

export const BASE_FILE_NAME = 'Shadow meetings.base';

/** A string literal for a Bases formula. */
function literal(value: string): string {
	return JSON.stringify(value);
}

/** A YAML single-quoted scalar. */
function yaml(value: string): string {
	return `'${value.replace(/'/gu, "''")}'`;
}

function subfolder(shadowFolder: string, name: string): string {
	const folder = shadowFolder.replace(/^\/+|\/+$/gu, '');
	return folder ? `${folder}/${name}` : name;
}

// Shadow writes "2026-10-29 00:30 UTC" or "2026-10-29 09:30 GMT+09:00";
// rewritten as ISO 8601 so the time zone is kept.
function isoDate(property: string): string {
	return `date(${property}.replace(" UTC", "Z").replace(" GMT", "").replace(" ", "T"))`;
}

export function buildMeetingsBase(shadowFolder: string): string {
	const meetings = literal(subfolder(shadowFolder, 'Meetings'));
	const people = literal(subfolder(shadowFolder, 'People'));
	const where = shadowFolder.replace(/^\/+|\/+$/gu, '') || 'the vault root';
	const meetingFilter = [`file.inFolder(${meetings})`, 'type == "meeting"'];

	const formulas: Array<[string, string]> = [
		['started', `if(startedAt, ${isoDate('startedAt')})`],
		['start_time', 'if(startedAt, formula.started.format("LT"))'],
		[
			'minutes',
			`if(startedAt && endedAt, ((number(${isoDate('endedAt')}) - number(formula.started)) / 60000).round())`,
		],
		['people', `file.links.filter(value.asFile().inFolder(${people})).unique()`],
		['person', 'file.asLink(if(name, name, file.basename))'],
		['meetings', `file.links.filter(value.asFile().inFolder(${meetings}))`],
		['meeting_count', 'formula.meetings.length'],
		['last_met', 'if(formula.meetings.length > 0, formula.meetings[0].asFile().properties.date)'],
	];
	const displayNames: Array<[string, string]> = [
		['file.name', 'Meeting'],
		['note.date', 'Date'],
		['note.email', 'Email'],
		['formula.start_time', 'Start'],
		['formula.minutes', 'Minutes'],
		['formula.people', 'People'],
		['formula.person', 'Person'],
		['formula.meeting_count', 'Meetings'],
		['formula.last_met', 'Last met'],
		['formula.meetings', 'Meeting pages'],
	];

	const lines: string[] = [
		`# Made by the Shadow Meetings plugin from the pages Shadow saves in ${where}.`,
		'# Shadow does not manage this file. Change or delete it freely.',
		'formulas:',
		...formulas.map(([key, value]) => `  ${key}: ${yaml(value)}`),
		'properties:',
		...displayNames.flatMap(([key, name]) => [`  ${key}:`, `    displayName: ${yaml(name)}`]),
		'views:',
	];

	const meetingColumns = ['date', 'formula.start_time', 'file.name', 'formula.minutes', 'formula.people'];
	const meetingView = (name: string, extraFilter: string | null) => [
		'  - type: table',
		`    name: ${yaml(name)}`,
		'    filters:',
		'      and:',
		...[...meetingFilter, ...(extraFilter ? [extraFilter] : [])].map((f) => `        - ${yaml(f)}`),
		'    order:',
		...meetingColumns.map((c) => `      - ${c}`),
		'    sort:',
		'      - property: formula.started',
		'        direction: DESC',
	];
	lines.push(...meetingView('All meetings', null));
	lines.push(...meetingView('This week', 'date.format("GGGG-WW") == today().format("GGGG-WW")'));
	lines.push(
		'  - type: table',
		`    name: ${yaml('People')}`,
		'    filters:',
		'      and:',
		`        - ${yaml(`file.inFolder(${people})`)}`,
		'    order:',
		'      - formula.person',
		'      - email',
		'      - formula.meeting_count',
		'      - formula.last_met',
		'      - formula.meetings',
		'    sort:',
		'      - property: formula.last_met',
		'        direction: DESC',
	);
	return `${lines.join('\n')}\n`;
}
