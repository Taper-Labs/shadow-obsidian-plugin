import { describe, expect, it } from 'vitest';
import { insertMeetingLines } from '../src/daily-note';

const LINES = ['- 9:30 AM [[Weekly product sync]]', '- 2:00 PM [[Customer call with Acme]]'];

describe('insertMeetingLines', () => {
	it('adds a Meetings section at the end of the note', () => {
		expect(insertMeetingLines('# Thursday\n\n- Ship the plugin\n', LINES)).toBe(
			'# Thursday\n\n- Ship the plugin\n\n## Meetings\n\n- 9:30 AM [[Weekly product sync]]\n- 2:00 PM [[Customer call with Acme]]\n',
		);
	});

	it('works on an empty note', () => {
		expect(insertMeetingLines('', LINES.slice(0, 1))).toBe('## Meetings\n\n- 9:30 AM [[Weekly product sync]]\n');
	});

	it('appends to an existing Meetings section, before the next heading', () => {
		const note = '# Day\n\n## Meetings\n\n- 8:00 AM [[Standup]]\n\n## Tasks\n\n- [ ] Write\n';
		expect(insertMeetingLines(note, LINES)).toBe(
			'# Day\n\n## Meetings\n\n- 8:00 AM [[Standup]]\n- 9:30 AM [[Weekly product sync]]\n- 2:00 PM [[Customer call with Acme]]\n\n## Tasks\n\n- [ ] Write\n',
		);
	});

	it('fills an empty Meetings section and keeps subheadings inside it', () => {
		expect(insertMeetingLines('## Meetings\n\n## Tasks\n', LINES.slice(0, 1))).toBe(
			'## Meetings\n\n- 9:30 AM [[Weekly product sync]]\n\n## Tasks\n',
		);
		expect(insertMeetingLines('## meetings\n- a\n### Notes\n- b\n# Next\n', ['- c'])).toBe(
			'## meetings\n- a\n### Notes\n- b\n- c\n# Next\n',
		);
	});

	it('changes nothing when there is nothing to add', () => {
		expect(insertMeetingLines('# Day\n', [])).toBe('# Day\n');
	});
});
