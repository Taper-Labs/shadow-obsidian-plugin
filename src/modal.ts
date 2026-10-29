import { App, Keymap, PaneType, SuggestModal } from 'obsidian';
import { formatAttendees, Meeting } from './meetings';

/** Lets the user pick one of several meetings from today. */
export class TodayMeetingsModal extends SuggestModal<Meeting> {
	constructor(
		app: App,
		private readonly meetings: Meeting[],
		private readonly onPick: (meeting: Meeting, paneType: PaneType | boolean) => void,
	) {
		super(app);
		this.setPlaceholder("Choose one of today's meetings");
	}

	getSuggestions(query: string): Meeting[] {
		const needle = query.trim().toLowerCase();
		if (!needle) return this.meetings;
		return this.meetings.filter(
			(m) =>
				m.title.toLowerCase().includes(needle) ||
				m.attendees.some((name) => name.toLowerCase().includes(needle)),
		);
	}

	renderSuggestion(meeting: Meeting, el: HTMLElement): void {
		el.createDiv({ text: meeting.title });
		const parts: string[] = [];
		if (meeting.startedAt) {
			parts.push(meeting.startedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }));
		}
		const attendees = formatAttendees(meeting.attendees);
		if (attendees) parts.push(attendees);
		if (parts.length > 0) el.createEl('small', { text: parts.join(' · '), cls: 'shadow-meetings-suggestion-meta' });
	}

	onChooseSuggestion(meeting: Meeting, event: MouseEvent | KeyboardEvent): void {
		this.onPick(meeting, Keymap.isModEvent(event));
	}
}
