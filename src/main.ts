import { debounce, Notice, PaneType, Plugin, TFile } from 'obsidian';
import { SHADOW_APP_URL, VIEW_TYPE_MEETINGS } from './constants';
import { localDateKey, Meeting, meetingsOnDate } from './meetings';
import { TodayMeetingsModal } from './modal';
import { DEFAULT_SETTINGS, ShadowMeetingsSettings, ShadowMeetingsSettingTab } from './settings';
import { collectMeetings, resolveFolders } from './source';
import { MeetingsView } from './view';

export default class ShadowMeetingsPlugin extends Plugin {
	settings!: ShadowMeetingsSettings;

	private readonly refreshViews = debounce(
		() => {
			for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_MEETINGS)) {
				if (leaf.view instanceof MeetingsView) leaf.view.refresh();
			}
		},
		500,
		true,
	);

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(VIEW_TYPE_MEETINGS, (leaf) => new MeetingsView(leaf, this));

		this.addRibbonIcon('app-window', 'Open Shadow', () => this.openShadowApp());

		this.addCommand({
			id: 'show-meetings',
			name: 'Show meetings list',
			callback: () => {
				void this.activateView();
			},
		});
		this.addCommand({
			id: 'open-today',
			name: "Open today's meetings",
			callback: () => {
				void this.openTodaysMeetings();
			},
		});
		this.addCommand({
			id: 'open-shadow-app',
			name: 'Open Shadow',
			callback: () => this.openShadowApp(),
		});

		this.addSettingTab(new ShadowMeetingsSettingTab(this.app, this));

		this.registerEvent(this.app.metadataCache.on('changed', () => this.refreshViews()));
		this.registerEvent(this.app.vault.on('delete', () => this.refreshViews()));
		this.registerEvent(this.app.vault.on('rename', () => this.refreshViews()));
		this.registerEvent(this.app.workspace.on('file-open', () => this.refreshViews()));
		this.registerEvent(this.app.metadataCache.on('resolved', () => this.refreshViews()));

		this.app.workspace.onLayoutReady(() => {
			void this.addListOnFirstRun();
		});
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<ShadowMeetingsSettings> | null,
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.refreshViews();
	}

	loadMeetings(): { folders: string[]; meetings: Meeting[] } {
		const folders = resolveFolders(this.app, this.settings.shadowFolder);
		return { folders, meetings: collectMeetings(this.app, folders) };
	}

	openShadowApp(): void {
		// Hands the URL to macOS, which opens the Shadow app. No network request.
		window.open(SHADOW_APP_URL);
	}

	async openMeeting(meeting: Meeting, paneType: PaneType | boolean = false): Promise<void> {
		const file = this.app.vault.getFileByPath(meeting.path);
		if (!(file instanceof TFile)) {
			new Notice('That meeting page is no longer in the vault.');
			return;
		}
		await this.app.workspace.getLeaf(paneType).openFile(file);
	}

	async openTodaysMeetings(): Promise<void> {
		const { folders, meetings } = this.loadMeetings();
		if (folders.length === 0) {
			new Notice("No Shadow folder found in this vault. Check the folder in this plugin's settings.");
			return;
		}
		const today = meetingsOnDate(meetings, localDateKey(new Date()));
		if (today.length === 0) {
			new Notice('No Shadow meetings today.');
			return;
		}
		if (today.length === 1 && today[0]) {
			await this.openMeeting(today[0]);
			return;
		}
		new TodayMeetingsModal(this.app, today, (meeting, paneType) => {
			void this.openMeeting(meeting, paneType);
		}).open();
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_MEETINGS)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			if (!leaf) return;
			await leaf.setViewState({ type: VIEW_TYPE_MEETINGS, active: true });
		}
		await workspace.revealLeaf(leaf);
	}

	private async addListOnFirstRun(): Promise<void> {
		if (this.settings.listAddedOnce) return;
		this.settings.listAddedOnce = true;
		await this.saveData(this.settings);
		if (this.app.workspace.getLeavesOfType(VIEW_TYPE_MEETINGS).length > 0) return;
		await this.app.workspace.getRightLeaf(false)?.setViewState({ type: VIEW_TYPE_MEETINGS });
	}
}
