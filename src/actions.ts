import { App, moment, normalizePath, Notice, TFile } from 'obsidian';
import { BASE_FILE_NAME, buildMeetingsBase } from './bases';
import { BASES_VIEW_TIMELINE } from './constants';
import { insertMeetingLines } from './daily-note';
import { localDateKey, meetingsOnDate } from './meetings';
import type ShadowMeetingsPlugin from './main';

// The only two places the plugin writes: a new `.base` file at the vault root,
// and the user's daily note. Both run only from a command. Shadow manages only
// `SHADOW.md`, `.shadow`, `Meetings` and `People` in its folder, so a file at
// the vault root never meets Shadow's sync.

interface InternalPlugins {
	internalPlugins?: { getPluginById(id: string): { enabled?: boolean; instance?: { options?: DailyNoteOptions } } | null };
	plugins?: { getPlugin(id: string): { settings?: { daily?: DailyNoteOptions & { enabled?: boolean } } } | null };
}

interface DailyNoteOptions {
	folder?: string;
	format?: string;
}

export function basesAvailable(app: App): boolean {
	return (app as unknown as InternalPlugins).internalPlugins?.getPluginById('bases')?.enabled === true;
}

export async function createMeetingViews(plugin: ShadowMeetingsPlugin): Promise<void> {
	const { app } = plugin;
	if (!basesAvailable(app)) {
		new Notice('Turn on the Bases core plugin first.');
		return;
	}
	plugin.ensureBasesViews();
	const { folders } = plugin.loadMeetings();
	const shadowFolder = folders[0];
	if (shadowFolder === undefined) {
		new Notice("No Shadow folder found in this vault. Check the folder in this plugin's settings.");
		return;
	}
	const path = normalizePath(BASE_FILE_NAME);
	const existing = app.vault.getFileByPath(path);
	if (existing) {
		const text = await app.vault.cachedRead(existing);
		new Notice(
			text.includes(`type: ${BASES_VIEW_TIMELINE}`)
				? `Opened ${BASE_FILE_NAME} at the vault root.`
				: `Opened ${BASE_FILE_NAME} at the vault root. It was made by an earlier version and has no timeline. To get the new views, delete it and run this command again.`,
		);
		await app.workspace.getLeaf(false).openFile(existing);
		return;
	}
	const file = await app.vault.create(path, buildMeetingsBase(shadowFolder));
	await app.workspace.getLeaf(false).openFile(file);
}

function dailyNoteOptions(app: App): DailyNoteOptions | null {
	const internal = app as unknown as InternalPlugins;
	const periodic = internal.plugins?.getPlugin('periodic-notes')?.settings?.daily;
	if (periodic?.enabled) return periodic;
	const core = internal.internalPlugins?.getPluginById('daily-notes');
	if (core?.enabled) return core.instance?.options ?? {};
	return null;
}

export function todaysDailyNotePath(app: App): string | null {
	const options = dailyNoteOptions(app);
	if (!options) return null;
	const name = moment().format(options.format?.trim() || 'YYYY-MM-DD');
	const folder = options.folder?.trim().replace(/^\/+|\/+$/gu, '') ?? '';
	return normalizePath(folder ? `${folder}/${name}.md` : `${name}.md`);
}

export async function addTodaysMeetingsToDailyNote(plugin: ShadowMeetingsPlugin): Promise<void> {
	const { app } = plugin;
	const path = todaysDailyNotePath(app);
	if (!path) {
		new Notice('Turn on the daily notes core plugin, or the periodic notes plugin, first.');
		return;
	}
	const note = app.vault.getFileByPath(path);
	if (!note) {
		new Notice(`Today's daily note (${path}) doesn't exist yet. Open it, then run this again.`);
		return;
	}
	const { meetings } = plugin.loadMeetings();
	const today = meetingsOnDate(meetings, localDateKey(new Date()));
	if (today.length === 0) {
		new Notice('No Shadow meetings today.');
		return;
	}

	const linked = new Set<string>();
	for (const link of app.metadataCache.getFileCache(note)?.links ?? []) {
		const target = app.metadataCache.getFirstLinkpathDest(link.link, note.path);
		if (target) linked.add(target.path);
	}
	const lines: string[] = [];
	for (const meeting of today) {
		const file = app.vault.getFileByPath(meeting.path);
		if (!(file instanceof TFile) || linked.has(file.path)) continue;
		const time = meeting.startedAt
			? `${meeting.startedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} `
			: '';
		lines.push(`- ${time}${app.fileManager.generateMarkdownLink(file, note.path, undefined, meeting.title)}`);
	}
	if (lines.length === 0) {
		new Notice("Today's meetings are already linked in the daily note.");
		return;
	}
	await app.vault.process(note, (text) => insertMeetingLines(text, lines));
	new Notice(`Added ${lines.length} ${lines.length === 1 ? 'meeting' : 'meetings'} to ${note.basename}.`);
}
