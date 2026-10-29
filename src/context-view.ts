import { ItemView, Keymap, TFile, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_CONTEXT } from './constants';
import {
	formatDuration,
	formatGroupHeading,
	localDateKey,
	Meeting,
	meetingsWithPerson,
	previousMeetingWith,
} from './meetings';
import type ShadowMeetingsPlugin from './main';
import type { PersonRef } from './people';
import { materialsFor, meetingPathsLinkedFrom, personForFile } from './source';

// Shows what Shadow's pages connect to the open page: a meeting's materials and
// the last meeting with each attendee, or every meeting with a person.

function dateLabel(meeting: Meeting, todayKey: string): string {
	return meeting.date ? formatGroupHeading(meeting.date, todayKey) : 'No date';
}

export class MeetingContextView extends ItemView {
	private plugin: ShadowMeetingsPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: ShadowMeetingsPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_CONTEXT;
	}

	getDisplayText(): string {
		return 'Shadow meeting context';
	}

	getIcon(): string {
		return 'users';
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass('shadow-meetings', 'shadow-meetings-context');
		this.refresh();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	refresh(): void {
		const root = this.contentEl;
		root.empty();
		const file = this.app.workspace.getActiveFile();
		const { folders, meetings } = this.plugin.loadMeetings();
		const todayKey = localDateKey(new Date());

		const meeting = file ? meetings.find((m) => m.path === file.path) : undefined;
		if (file && meeting) {
			this.renderMeeting(root, file, meeting, meetings, todayKey);
			return;
		}
		const person = file ? personForFile(this.app, file, folders) : null;
		if (file && person) {
			this.renderPerson(root, file, person, meetings, todayKey);
			return;
		}
		const empty = root.createDiv({ cls: 'shadow-meetings-empty' });
		empty.createDiv({
			cls: 'shadow-meetings-empty-body',
			text: 'Open a Shadow meeting or person page to see its materials and related meetings.',
		});
	}

	private renderMeeting(root: HTMLElement, file: TFile, meeting: Meeting, meetings: Meeting[], todayKey: string): void {
		const header = root.createDiv({ cls: 'shadow-meetings-context-header' });
		header.createDiv({ cls: 'shadow-meetings-context-title', text: meeting.title });
		const when = [dateLabel(meeting, todayKey)];
		const duration = formatDuration(meeting.startedAt, meeting.endedAt);
		if (duration) when.push(duration);
		header.createDiv({ cls: 'shadow-meetings-meta', text: when.join(' · ') });

		const materials = materialsFor(this.app, file);
		if (materials.length > 0) {
			this.sectionHeading(root, 'Materials');
			const bar = root.createDiv({ cls: 'shadow-meetings-materials' });
			for (const material of materials) {
				const button = bar.createEl('button', { cls: 'shadow-meetings-material', text: material.label });
				button.addEventListener('click', (event) => {
					void this.app.workspace.getLeaf(Keymap.isModEvent(event)).openFile(material.file);
				});
			}
		}

		this.sectionHeading(root, 'People');
		if (meeting.people.length === 0) {
			root.createDiv({ cls: 'shadow-meetings-context-note', text: 'No attendees on this page.' });
			return;
		}
		for (const person of meeting.people) {
			const item = root.createDiv({ cls: 'shadow-meetings-person' });
			this.personLink(item, person);
			const previous = previousMeetingWith(meetings, person, meeting);
			if (previous) {
				const line = item.createDiv({ cls: 'shadow-meetings-meta' });
				line.appendText(`Last time: ${dateLabel(previous, todayKey)}, `);
				this.meetingLink(line, previous, previous.title);
			} else {
				item.createDiv({ cls: 'shadow-meetings-meta', text: 'First meeting together' });
			}
		}
	}

	private renderPerson(root: HTMLElement, file: TFile, person: PersonRef, meetings: Meeting[], todayKey: string): void {
		const list = meetingsWithPerson(meetings, person, meetingPathsLinkedFrom(this.app, file));
		const header = root.createDiv({ cls: 'shadow-meetings-context-header' });
		header.createDiv({ cls: 'shadow-meetings-context-title', text: person.name });
		if (person.email) header.createDiv({ cls: 'shadow-meetings-meta', text: person.email });
		const summary =
			list.length === 0
				? 'No meetings yet'
				: `${list.length} ${list.length === 1 ? 'meeting' : 'meetings'} · Last met ${dateLabel(list[0] as Meeting, todayKey)}`;
		header.createDiv({ cls: 'shadow-meetings-meta', text: summary });

		if (list.length === 0) return;
		this.sectionHeading(root, 'Meetings');
		for (const meeting of list) {
			const item = root.createDiv({ cls: 'shadow-meetings-item', attr: { tabindex: '0', role: 'link' } });
			item.createDiv({ cls: 'shadow-meetings-title', text: meeting.title });
			const meta = [dateLabel(meeting, todayKey)];
			const duration = formatDuration(meeting.startedAt, meeting.endedAt);
			if (duration) meta.push(duration);
			item.createDiv({ cls: 'shadow-meetings-meta', text: meta.join(' · ') });
			item.addEventListener('click', (event) => {
				void this.plugin.openMeeting(meeting, Keymap.isModEvent(event));
			});
			item.addEventListener('keydown', (event) => {
				if (event.key === 'Enter') void this.plugin.openMeeting(meeting, Keymap.isModEvent(event));
			});
		}
	}

	private sectionHeading(root: HTMLElement, text: string): void {
		root.createDiv({ cls: 'shadow-meetings-date', text });
	}

	private personLink(parent: HTMLElement, person: PersonRef): void {
		const path = person.path;
		if (!path) {
			parent.createDiv({ cls: 'shadow-meetings-title', text: person.name });
			return;
		}
		const link = parent.createEl('a', { cls: 'shadow-meetings-title shadow-meetings-link', text: person.name });
		link.addEventListener('click', (event) => {
			event.preventDefault();
			void this.app.workspace.openLinkText(path, '', Keymap.isModEvent(event));
		});
	}

	private meetingLink(parent: HTMLElement, meeting: Meeting, text: string): void {
		const link = parent.createEl('a', { cls: 'shadow-meetings-link', text });
		link.addEventListener('click', (event) => {
			event.preventDefault();
			void this.plugin.openMeeting(meeting, Keymap.isModEvent(event));
		});
	}
}
