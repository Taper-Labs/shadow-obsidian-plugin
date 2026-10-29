import { BasesView, Keymap, moment, QueryController, setIcon, setTooltip, TFile } from 'obsidian';
import { BASES_VIEW_PEOPLE, BASES_VIEW_TIMELINE } from './constants';
import { formatDuration, formatGroupHeading, localDateKey, Meeting, meetingsWithPerson } from './meetings';
import type ShadowMeetingsPlugin from './main';
import { meetingFromFile, meetingPathsLinkedFrom, personForFile } from './source';
import {
	addDaysTo,
	buildWeek,
	chipLabels,
	formatTotal,
	hueFor,
	initials,
	latestMeetingWeek,
	PersonCard,
	sortPeopleCards,
	TimelineBlock,
	TimelineDay,
	weekStart,
} from './timeline';

// Two Bases views the plugin registers. Both only read: the rows come from the
// base's own query, and the meeting details from Obsidian's metadata cache.

const HOUR_HEIGHT = 72;
/** Below this height a block shows its title and time on one line. */
const COMPACT_MAX_HEIGHT = 44;
/** From this height a block also shows attendee chips. */
const CHIPS_MIN_HEIGHT = 68;
/** From this height a long title may wrap to two lines. */
const TALL_MIN_HEIGHT = 108;

function timeLabel(date: Date): string {
	return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function hourLabel(hour: number): string {
	return new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, { hour: 'numeric' });
}

/** Chips show first names; the tooltip has the full names. */
function firstName(name: string): string {
	return name.trim().split(/\s+/u)[0] ?? name;
}

/** "Today", "Yesterday", "Oct 27", or "Oct 27, 2025" in another year. */
function shortDay(dateKey: string, todayKey: string): string {
	const heading = formatGroupHeading(dateKey, todayKey);
	if (heading === 'Today' || heading === 'Yesterday') return heading;
	const day = moment(dateKey, 'YYYY-MM-DD');
	return day.format(day.year() === moment().year() ? 'MMM D' : 'MMM D, YYYY');
}

function firstDayOfWeek(): number {
	return moment.localeData().firstDayOfWeek();
}

function entryFiles(view: BasesView): TFile[] {
	return view.data.data.map((entry) => entry.file).filter((file) => file.extension === 'md');
}

export class ShadowTimelineView extends BasesView {
	type = BASES_VIEW_TIMELINE;
	private readonly plugin: ShadowMeetingsPlugin;
	private readonly rootEl: HTMLElement;
	private week: Date;

	constructor(controller: QueryController, containerEl: HTMLElement, plugin: ShadowMeetingsPlugin) {
		super(controller);
		this.plugin = plugin;
		this.rootEl = containerEl.createDiv({ cls: 'shadow-meetings-timeline' });
		this.week = weekStart(new Date(), firstDayOfWeek());
	}

	onDataUpdated(): void {
		this.render();
	}

	private meetings(): Meeting[] {
		const meetings: Meeting[] = [];
		for (const file of entryFiles(this)) {
			const meeting = meetingFromFile(this.app, file);
			if (meeting) meetings.push(meeting);
		}
		return meetings;
	}

	private goTo(week: Date): void {
		this.week = week;
		this.render();
	}

	private render(): void {
		const root = this.rootEl;
		root.empty();
		const meetings = this.meetings();
		const week = buildWeek(meetings, this.week);
		const todayKey = localDateKey(new Date());

		const toolbar = root.createDiv({ cls: 'shadow-meetings-timeline-toolbar' });
		const nav = toolbar.createDiv({ cls: 'shadow-meetings-timeline-nav' });
		const button = (icon: string, label: string, onClick: () => void) => {
			const el = nav.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': label } });
			setIcon(el, icon);
			el.addEventListener('click', onClick);
		};
		button('chevron-left', 'Previous week', () => this.goTo(addDaysTo(this.week, -7)));
		const today = nav.createEl('button', { cls: 'shadow-meetings-timeline-today', text: 'Today' });
		today.addEventListener('click', () => this.goTo(weekStart(new Date(), firstDayOfWeek())));
		button('chevron-right', 'Next week', () => this.goTo(addDaysTo(this.week, 7)));
		const last = addDaysTo(this.week, 6);
		const sameYear = this.week.getFullYear() === last.getFullYear();
		toolbar.createDiv({
			cls: 'shadow-meetings-timeline-range',
			text: `${moment(this.week).format(sameYear ? 'MMM D' : 'MMM D, YYYY')} – ${moment(last).format('MMM D, YYYY')}`,
		});
		const summary =
			week.meetingCount === 0
				? 'No meetings'
				: `${week.meetingCount} ${week.meetingCount === 1 ? 'meeting' : 'meetings'}${week.minutes > 0 ? ` · ${formatTotal(week.minutes)}` : ''}`;
		toolbar.createDiv({ cls: 'shadow-meetings-timeline-summary', text: summary });

		if (week.meetingCount === 0) {
			const empty = root.createDiv({ cls: 'shadow-meetings-timeline-empty' });
			if (meetings.length === 0) {
				empty.setText('No Shadow meeting pages match this view.');
			} else {
				const latest = latestMeetingWeek(meetings, firstDayOfWeek());
				empty.createSpan({ text: 'No meetings this week. ' });
				if (latest && latest.getTime() !== this.week.getTime()) {
					const jump = empty.createEl('a', { cls: 'shadow-meetings-link', text: 'Go to the latest week with meetings' });
					jump.addEventListener('click', (event) => {
						event.preventDefault();
						this.goTo(latest);
					});
				}
			}
		}

		const scroll = root.createDiv({ cls: 'shadow-meetings-timeline-scroll' });
		const grid = scroll.createDiv({ cls: 'shadow-meetings-timeline-grid' });

		grid.createDiv({ cls: 'shadow-meetings-timeline-corner' });
		for (const day of week.days) {
			const head = grid.createDiv({ cls: 'shadow-meetings-timeline-dayhead' });
			if (day.key === todayKey) head.addClass('is-today');
			head.createSpan({ cls: 'shadow-meetings-timeline-weekday', text: moment(day.date).format('ddd') });
			head.createSpan({ cls: 'shadow-meetings-timeline-daynum', text: moment(day.date).format('D') });
		}

		if (week.days.some((day) => day.untimed.length > 0)) {
			grid.createDiv({ cls: 'shadow-meetings-timeline-gutter-label', text: 'No time' });
			for (const day of week.days) {
				const cell = grid.createDiv({ cls: 'shadow-meetings-timeline-untimed' });
				for (const meeting of day.untimed) {
					const chip = cell.createDiv({ cls: 'shadow-meetings-timeline-untimed-item', text: meeting.title });
					this.makeOpenable(chip, meeting);
				}
			}
		}

		const [fromHour, toHour] = week.hours;
		const height = (toHour - fromHour) * HOUR_HEIGHT;
		const gutter = grid.createDiv({ cls: 'shadow-meetings-timeline-gutter' });
		gutter.setCssProps({ height: `${height}px` });
		for (let hour = fromHour; hour < toHour; hour++) {
			const label = gutter.createDiv({ cls: 'shadow-meetings-timeline-hour', text: hourLabel(hour) });
			label.setCssProps({ top: `${(hour - fromHour) * HOUR_HEIGHT}px` });
		}
		for (const day of week.days) {
			this.renderDay(grid, day, fromHour, height, day.key === todayKey);
		}
	}

	private renderDay(grid: HTMLElement, day: TimelineDay, fromHour: number, height: number, isToday: boolean): void {
		const column = grid.createDiv({ cls: 'shadow-meetings-timeline-day' });
		if (isToday) column.addClass('is-today');
		column.setCssProps({ height: `${height}px`, '--shadow-hour-height': `${HOUR_HEIGHT}px` });
		const top = (minutes: number) => ((minutes - fromHour * 60) / 60) * HOUR_HEIGHT;

		if (isToday) {
			const now = new Date();
			const y = top(now.getHours() * 60 + now.getMinutes());
			if (y >= 0 && y <= height) column.createDiv({ cls: 'shadow-meetings-timeline-now' }).setCssProps({ top: `${y}px` });
		}
		for (const block of day.blocks) this.renderBlock(column, block, top);
	}

	private renderBlock(column: HTMLElement, block: TimelineBlock, top: (minutes: number) => number): void {
		const { meeting } = block;
		const blockHeight = Math.max(top(block.end) - top(block.start), 22);
		// Like a calendar app, an earlier lane reaches under the next one so its
		// title has room; later lanes are drawn on top.
		const left = block.lane / block.lanes;
		const width = block.lane === block.lanes - 1 ? 1 / block.lanes : Math.min(1 - left, 1.7 / block.lanes);
		const el = column.createDiv({ cls: 'shadow-meetings-timeline-block' });
		if (block.openEnded) el.addClass('is-open-ended');
		el.setCssProps({
			top: `${top(block.start)}px`,
			height: `${blockHeight - 2}px`,
			left: `calc(${left * 100}% + 2px)`,
			width: `calc(${width * 100}% - 4px)`,
			'--shadow-lane': String(block.lane + 1),
		});
		const start = meeting.startedAt as Date;
		const duration = formatDuration(meeting.startedAt, meeting.endedAt);
		const time = block.openEnded
			? `${timeLabel(start)} · No end time`
			: `${timeLabel(start)} – ${timeLabel(meeting.endedAt as Date)}${duration ? ` · ${duration}` : ''}`;

		if (blockHeight < COMPACT_MAX_HEIGHT) {
			el.addClass('is-compact');
			const line = el.createDiv({ cls: 'shadow-meetings-timeline-block-line' });
			line.createSpan({ cls: 'shadow-meetings-timeline-block-title', text: meeting.title });
			line.createSpan({ cls: 'shadow-meetings-timeline-block-time', text: ` ${timeLabel(start)}` });
		} else {
			if (blockHeight >= TALL_MIN_HEIGHT) el.addClass('is-tall');
			el.createDiv({ cls: 'shadow-meetings-timeline-block-title', text: meeting.title });
			el.createDiv({ cls: 'shadow-meetings-timeline-block-time', text: time });
		}
		if (blockHeight >= CHIPS_MIN_HEIGHT && meeting.attendees.length > 0) {
			const chips = el.createDiv({ cls: 'shadow-meetings-chips' });
			for (const label of chipLabels(meeting.attendees.map(firstName))) {
				chips.createSpan({ cls: label.startsWith('+') ? 'shadow-meetings-chip is-more' : 'shadow-meetings-chip', text: label });
			}
			// Shown instead of the names when the block is too narrow for them.
			const count = meeting.attendees.length;
			chips.createSpan({ cls: 'shadow-meetings-chip is-count', text: `${count} ${count === 1 ? 'person' : 'people'}` });
		}
		const tooltip = [meeting.title, time, meeting.attendees.join(', ')].filter(Boolean).join('\n');
		setTooltip(el, tooltip, { placement: 'top' });
		this.makeOpenable(el, meeting);
	}

	private makeOpenable(el: HTMLElement, meeting: Meeting): void {
		el.setAttrs({ tabindex: '0', role: 'link' });
		el.addEventListener('click', (event) => {
			void this.plugin.openMeeting(meeting, Keymap.isModEvent(event));
		});
		el.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') void this.plugin.openMeeting(meeting, Keymap.isModEvent(event));
		});
	}
}

export class ShadowPeopleView extends BasesView {
	type = BASES_VIEW_PEOPLE;
	private readonly plugin: ShadowMeetingsPlugin;
	private readonly rootEl: HTMLElement;

	constructor(controller: QueryController, containerEl: HTMLElement, plugin: ShadowMeetingsPlugin) {
		super(controller);
		this.plugin = plugin;
		this.rootEl = containerEl.createDiv({ cls: 'shadow-meetings-people' });
	}

	onDataUpdated(): void {
		this.render();
	}

	private cards(): PersonCard[] {
		const { folders, meetings } = this.plugin.loadMeetings();
		const cards: PersonCard[] = [];
		for (const file of entryFiles(this)) {
			const person = personForFile(this.app, file, folders);
			if (!person) continue;
			cards.push({
				person,
				path: file.path,
				meetings: meetingsWithPerson(meetings, person, meetingPathsLinkedFrom(this.app, file)),
			});
		}
		return sortPeopleCards(cards);
	}

	private render(): void {
		const root = this.rootEl;
		root.empty();
		const cards = this.cards();
		if (cards.length === 0) {
			root.createDiv({ cls: 'shadow-meetings-timeline-empty', text: 'No Shadow person pages match this view.' });
			return;
		}
		const todayKey = localDateKey(new Date());
		const grid = root.createDiv({ cls: 'shadow-meetings-people-grid' });
		for (const card of cards) {
			const el = grid.createDiv({ cls: 'shadow-meetings-person-card', attr: { tabindex: '0', role: 'link' } });
			const head = el.createDiv({ cls: 'shadow-meetings-person-card-head' });
			const avatar = head.createDiv({ cls: 'shadow-meetings-avatar', text: initials(card.person.name) });
			avatar.setCssProps({ '--shadow-hue': String(hueFor(card.person.email ?? card.person.name)) });
			const names = head.createDiv({ cls: 'shadow-meetings-person-card-names' });
			names.createDiv({ cls: 'shadow-meetings-person-card-name', text: card.person.name });
			if (card.person.email) names.createDiv({ cls: 'shadow-meetings-person-card-email', text: card.person.email });

			const stats = el.createDiv({ cls: 'shadow-meetings-person-card-stats' });
			const count = card.meetings.length;
			const stat = (value: string, label: string) => {
				const box = stats.createDiv({ cls: 'shadow-meetings-stat' });
				box.createDiv({ cls: 'shadow-meetings-stat-value', text: value });
				box.createDiv({ cls: 'shadow-meetings-stat-label', text: label });
			};
			stat(String(count), count === 1 ? 'meeting' : 'meetings');
			const latest = card.meetings[0];
			stat(latest?.date ? shortDay(latest.date, todayKey) : '—', 'last met');

			const recent = el.createDiv({ cls: 'shadow-meetings-person-card-recent' });
			if (latest) {
				recent.createSpan({ cls: 'shadow-meetings-person-card-recent-label', text: 'Latest ' });
				const link = recent.createEl('a', { cls: 'shadow-meetings-link', text: latest.title });
				link.addEventListener('click', (event) => {
					event.preventDefault();
					event.stopPropagation();
					void this.plugin.openMeeting(latest, Keymap.isModEvent(event));
				});
			} else {
				recent.setText('No meetings yet');
			}

			const open = (event: MouseEvent | KeyboardEvent) => {
				void this.app.workspace.openLinkText(card.path, '', Keymap.isModEvent(event));
			};
			el.addEventListener('click', open);
			el.addEventListener('keydown', (event) => {
				if (event.key === 'Enter') open(event);
			});
		}
	}
}

/** Registers both views. Returns false when the Bases core plugin is off. */
export function registerShadowBasesViews(plugin: ShadowMeetingsPlugin): boolean {
	const timeline = plugin.registerBasesView(BASES_VIEW_TIMELINE, {
		name: 'Shadow timeline',
		icon: 'calendar-range',
		factory: (controller, containerEl) => new ShadowTimelineView(controller, containerEl, plugin),
	});
	const people = plugin.registerBasesView(BASES_VIEW_PEOPLE, {
		name: 'Shadow people',
		icon: 'contact',
		factory: (controller, containerEl) => new ShadowPeopleView(controller, containerEl, plugin),
	});
	return timeline && people;
}
