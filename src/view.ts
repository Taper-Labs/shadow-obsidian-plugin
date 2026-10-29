import { ItemView, Keymap, WorkspaceLeaf } from 'obsidian';
import { PAGE_SIZE, SHADOW_DOWNLOAD_URL, VIEW_TYPE_MEETINGS } from './constants';
import {
	formatAttendees,
	formatDuration,
	formatGroupHeading,
	groupMeetingsByDate,
	localDateKey,
	Meeting,
} from './meetings';
import type ShadowMeetingsPlugin from './main';

export class MeetingsView extends ItemView {
	private plugin: ShadowMeetingsPlugin;
	private limit = PAGE_SIZE;

	constructor(leaf: WorkspaceLeaf, plugin: ShadowMeetingsPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_MEETINGS;
	}

	getDisplayText(): string {
		return 'Shadow meetings';
	}

	getIcon(): string {
		return 'calendar-clock';
	}

	async onOpen(): Promise<void> {
		this.addAction('refresh-cw', 'Refresh', () => this.refresh());
		this.addAction('app-window', 'Open Shadow', () => this.plugin.openShadowApp());
		this.contentEl.addClass('shadow-meetings');
		this.refresh();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	refresh(): void {
		const { folders, meetings } = this.plugin.loadMeetings();
		const root = this.contentEl;
		root.empty();

		if (folders.length === 0) {
			this.renderEmpty(
				root,
				'No Shadow meetings in this vault yet.',
				'Shadow saves each meeting here once you choose this vault, or a folder in it, in the Shadow app under Settings → Meeting → Vault location. If the folder is already here, set it in this plugin\'s settings.',
				true,
			);
			return;
		}
		if (meetings.length === 0) {
			this.renderEmpty(
				root,
				'No meetings yet.',
				'Meetings recorded with Shadow appear here as soon as Shadow saves them to the vault.',
				false,
			);
			return;
		}

		const todayKey = localDateKey(new Date());
		let shown = 0;
		for (const group of groupMeetingsByDate(meetings)) {
			if (shown >= this.limit) break;
			const groupEl = root.createDiv({ cls: 'shadow-meetings-group' });
			groupEl.createDiv({
				cls: 'shadow-meetings-date',
				text: formatGroupHeading(group.key, todayKey),
			});
			for (const meeting of group.meetings) {
				if (shown >= this.limit) break;
				this.renderMeeting(groupEl, meeting);
				shown += 1;
			}
		}

		if (shown < meetings.length) {
			const more = root.createEl('button', {
				cls: 'shadow-meetings-more',
				text: `Show more (${meetings.length - shown} left)`,
			});
			more.addEventListener('click', () => {
				this.limit += PAGE_SIZE;
				this.refresh();
			});
		}
	}

	private renderMeeting(parent: HTMLElement, meeting: Meeting): void {
		const item = parent.createDiv({ cls: 'shadow-meetings-item', attr: { tabindex: '0', role: 'link' } });
		if (this.app.workspace.getActiveFile()?.path === meeting.path) item.addClass('is-active');
		item.createDiv({ cls: 'shadow-meetings-title', text: meeting.title });

		const details: string[] = [];
		if (meeting.startedAt) {
			details.push(meeting.startedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }));
		}
		const duration = formatDuration(meeting.startedAt, meeting.endedAt);
		if (duration) details.push(duration);
		if (details.length > 0) item.createDiv({ cls: 'shadow-meetings-meta', text: details.join(' · ') });

		const attendees = formatAttendees(meeting.attendees);
		if (attendees) item.createDiv({ cls: 'shadow-meetings-attendees', text: attendees });

		item.addEventListener('click', (event) => {
			void this.plugin.openMeeting(meeting, Keymap.isModEvent(event));
		});
		item.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') void this.plugin.openMeeting(meeting, Keymap.isModEvent(event));
		});
	}

	private renderEmpty(parent: HTMLElement, title: string, body: string, showDownload: boolean): void {
		const empty = parent.createDiv({ cls: 'shadow-meetings-empty' });
		empty.createDiv({ cls: 'shadow-meetings-empty-title', text: title });
		empty.createDiv({ cls: 'shadow-meetings-empty-body', text: body });
		if (showDownload) {
			const link = empty.createEl('a', { text: 'Get Shadow for Mac', href: SHADOW_DOWNLOAD_URL });
			link.addClass('shadow-meetings-empty-link');
		}
	}
}
