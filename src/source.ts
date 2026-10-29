import { App, CachedMetadata, normalizePath, TFile } from 'obsidian';
import {
	detectShadowFolders,
	HeadingRef,
	isInMeetingsFolder,
	isMeetingAudio,
	LinkRef,
	linksInSection,
	Meeting,
	meetingFromPage,
} from './meetings';
import { addPerson, PersonRef, personFromLink, personFromPage } from './people';

// Reads meetings and People from Obsidian's metadata cache only. Nothing is
// read from disk directly, and nothing Shadow manages is ever written.

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

function headingsOf(cache: CachedMetadata): HeadingRef[] {
	return (cache.headings ?? []).map((h) => ({ heading: h.heading, level: h.level, offset: h.position.start.offset }));
}

function linksOf(cache: CachedMetadata): LinkRef[] {
	return (cache.links ?? []).map((l) => ({ link: l.link, displayText: l.displayText, offset: l.position.start.offset }));
}

function resolve(app: App, link: string, sourcePath: string): TFile | null {
	return app.metadataCache.getFirstLinkpathDest(link.split('#')[0] ?? link, sourcePath);
}

export function meetingFromFile(app: App, file: TFile): Meeting | null {
	const cache = app.metadataCache.getFileCache(file);
	if (!cache?.frontmatter) return null;
	const people: PersonRef[] = [];
	for (const link of linksInSection(headingsOf(cache), linksOf(cache), 'Attendees')) {
		const target = resolve(app, link.link, file.path);
		const person = personFromLink(
			link.link,
			link.displayText,
			target ? { path: target.path, frontmatter: app.metadataCache.getFileCache(target)?.frontmatter } : null,
		);
		if (person) addPerson(people, person);
	}
	return meetingFromPage(file.path, cache.frontmatter, people);
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

function underFolder(path: string, folder: string, child: string): boolean {
	const prefix = folder ? `${folder}/${child}/` : `${child}/`;
	return path.startsWith(prefix);
}

/** The Person a page describes, when the page is in a Shadow `People/` folder. */
export function personForFile(app: App, file: TFile, folders: string[]): PersonRef | null {
	if (file.extension !== 'md' || !folders.some((f) => underFolder(file.path, f, 'People'))) return null;
	return personFromPage(file.path, app.metadataCache.getFileCache(file)?.frontmatter);
}

/** Meeting pages a Person page links to (Shadow's `## Meetings` list). */
export function meetingPathsLinkedFrom(app: App, file: TFile): Set<string> {
	const paths = new Set<string>();
	for (const link of app.metadataCache.getFileCache(file)?.links ?? []) {
		const target = resolve(app, link.link, file.path);
		if (target) paths.add(target.path);
	}
	return paths;
}

export interface Material {
	label: string;
	file: TFile;
}

/** The files a meeting page lists under `## Materials`, plus its audio. */
export function materialsFor(app: App, file: TFile): Material[] {
	const materials: Material[] = [];
	const cache = app.metadataCache.getFileCache(file);
	if (cache) {
		for (const link of linksInSection(headingsOf(cache), linksOf(cache), 'Materials')) {
			const target = resolve(app, link.link, file.path);
			if (!target || materials.some((m) => m.file === target)) continue;
			const display = link.displayText?.trim();
			materials.push({ label: display && display !== link.link ? display : target.basename, file: target });
		}
	}
	for (const child of file.parent?.children ?? []) {
		if (child instanceof TFile && isMeetingAudio(child.name)) materials.push({ label: 'Audio', file: child });
	}
	return materials;
}
