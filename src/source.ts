import { App, normalizePath, TFile } from 'obsidian';
import { attendeesFromLinks, detectShadowFolders, isInMeetingsFolder, Meeting, meetingFromPage } from './meetings';

// Reads meetings from Obsidian's metadata cache only. Nothing is read from
// disk directly and nothing is written.

export function detectFolders(app: App): string[] {
	return detectShadowFolders(
		app.vault.getMarkdownFiles().map((file) => ({
			path: file.path,
			frontmatter: app.metadataCache.getFileCache(file)?.frontmatter,
		})),
	);
}

/**
 * The configured folder, or every detected Shadow folder when none is set.
 * A configured folder that is not in the vault resolves to none.
 */
export function resolveFolders(app: App, configuredFolder: string): string[] {
	const folder = configuredFolder.trim();
	if (!folder) return detectFolders(app);
	if (folder === '/') return [''];
	const path = normalizePath(folder);
	return app.vault.getFolderByPath(path) ? [path] : [];
}

function meetingFromFile(app: App, file: TFile): Meeting | null {
	const cache = app.metadataCache.getFileCache(file);
	if (!cache?.frontmatter) return null;
	const attendees = attendeesFromLinks(
		(cache.headings ?? []).map((h) => ({
			heading: h.heading,
			level: h.level,
			offset: h.position.start.offset,
		})),
		(cache.links ?? []).map((l) => ({
			link: l.link,
			displayText: l.displayText,
			offset: l.position.start.offset,
		})),
	);
	return meetingFromPage(file.path, cache.frontmatter, attendees);
}

export function collectMeetings(app: App, folders: string[]): Meeting[] {
	if (folders.length === 0) return [];
	const meetings: Meeting[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		if (!folders.some((folder) => isInMeetingsFolder(file.path, folder))) continue;
		const meeting = meetingFromFile(app, file);
		if (meeting) meetings.push(meeting);
	}
	return meetings;
}
