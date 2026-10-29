import { App, moment, normalizePath, Notice, TFile, TFolder } from 'obsidian';
import { BASE_FILE_NAME, buildMeetingsBase } from './bases';
import { insertMeetingLines } from './daily-note';
import { FolderPickerModal } from './folder-modal';
import { localDateKey, meetingsOnDate } from './meetings';
import type ShadowMeetingsPlugin from './main';

// The only two places the plugin writes: a new `.base` file in a folder the
// user picks, and the user's daily note. Both run only from a command.

const MANAGED_FOLDERS = ['Meetings', 'People', 'Unsynced Files', 'Archived Vaults', '.shadow'];

function isManagedFolder(path: string, shadowFolders: string[]): boolean {
	return shadowFolders.some((root) =>
		MANAGED_FOLDERS.some((name) => {
			const managed = root ? `${root}/${name}` : name;
			return path === managed || path.startsWith(`${managed}/`);
		}),
	);
}

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

export function createMeetingViews(plugin: ShadowMeetingsPlugin): void {
	const { app } = plugin;
	if (!basesAvailable(app)) {
		new Notice('Turn on the Bases core plugin first.');
		return;
	}
	const { folders } = plugin.loadMeetings();
	const shadowFolder = folders[0];
	if (shadowFolder === undefined) {
		new Notice("No Shadow folder found in this vault. Check the folder in this plugin's settings.");
		return;
	}
	new FolderPickerModal(
		app,
		(folder) => isManagedFolder(folder.path, folders),
		(folder) => {
			void writeBaseFile(app, folder, shadowFolder);
		},
	).open();
}

async function writeBaseFile(app: App, folder: TFolder, shadowFolder: string): Promise<void> {
	const path = normalizePath(folder.isRoot() ? BASE_FILE_NAME : `${folder.path}/${BASE_FILE_NAME}`);
	const existing = app.vault.getFileByPath(path);
	if (existing) {
		new Notice(`${BASE_FILE_NAME} already exists in that folder, so I opened it.`);
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
