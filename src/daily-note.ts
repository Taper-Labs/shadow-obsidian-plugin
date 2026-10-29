// Adds links to today's meetings under a `## Meetings` heading in a daily
// note. Pure text editing so it can be unit tested. Only used when the user
// turns the feature on and runs the command.

export const DAILY_NOTE_HEADING = 'Meetings';

/**
 * Returns the note text with `lines` added at the end of its `Meetings`
 * section, or with a new `## Meetings` section at the end of the note.
 */
export function insertMeetingLines(text: string, lines: string[], heading = DAILY_NOTE_HEADING): string {
	if (lines.length === 0) return text;
	const rows = text.split('\n');
	const headingPattern = /^(#{1,6})\s+(.*?)\s*#*\s*$/u;
	let start = -1;
	let level = 0;
	for (let i = 0; i < rows.length; i++) {
		const match = headingPattern.exec(rows[i] ?? '');
		if (match && (match[2] ?? '').toLowerCase() === heading.toLowerCase()) {
			start = i;
			level = (match[1] ?? '').length;
			break;
		}
	}

	if (start === -1) {
		const base = text.replace(/\s*$/u, '');
		const prefix = base.length > 0 ? `${base}\n\n` : '';
		return `${prefix}## ${heading}\n\n${lines.join('\n')}\n`;
	}

	let end = rows.length;
	for (let i = start + 1; i < rows.length; i++) {
		const match = headingPattern.exec(rows[i] ?? '');
		if (match && (match[1] ?? '').length <= level) {
			end = i;
			break;
		}
	}
	// Insert after the section's last non-blank line.
	let insertAt = end;
	while (insertAt > start + 1 && (rows[insertAt - 1] ?? '').trim() === '') insertAt--;
	if (insertAt === start + 1) {
		rows.splice(insertAt, 0, '', ...lines);
	} else {
		rows.splice(insertAt, 0, ...lines);
	}
	return rows.join('\n');
}
