import { App, PluginSettingTab, Setting, SettingDefinitionItem } from 'obsidian';
import type ShadowMeetingsPlugin from './main';
import { detectFolders } from './source';

export interface ShadowMeetingsSettings {
	/** Folder Shadow writes to, relative to the vault root. Empty means detect it. */
	shadowFolder: string;
	/** Turns on the command that adds today's meetings to the daily note. */
	dailyNoteLinks: boolean;
	/** Set once the views have been added to the sidebar on first run. */
	listAddedOnce: boolean;
}

export const DEFAULT_SETTINGS: ShadowMeetingsSettings = {
	shadowFolder: '',
	dailyNoteLinks: false,
	listAddedOnce: false,
};

const FOLDER_NAME = 'Shadow folder';
const DAILY_NOTE_NAME = 'Daily note links';
const DAILY_NOTE_DESC =
	"Adds the command to link today's meetings in today's daily note. The plugin writes to the daily note only when you run it, and never changes the pages Shadow manages.";

function describeFolder(folder: string): string {
	return folder === '' ? 'the vault root' : folder;
}

// Obsidian 1.13 and later build the tab from getSettingDefinitions(), which
// also puts the settings in the settings search. display() is the fallback for
// 1.10 to 1.12. Both use the same rows.
export class ShadowMeetingsSettingTab extends PluginSettingTab {
	plugin: ShadowMeetingsPlugin;

	constructor(app: App, plugin: ShadowMeetingsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{ name: FOLDER_NAME, desc: this.folderDesc(), render: (setting) => this.folderControls(setting) },
			{ name: DAILY_NOTE_NAME, desc: DAILY_NOTE_DESC, render: (setting) => this.dailyNoteControls(setting) },
		];
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		this.folderControls(new Setting(containerEl).setName(FOLDER_NAME).setDesc(this.folderDesc()));
		this.dailyNoteControls(new Setting(containerEl).setName(DAILY_NOTE_NAME).setDesc(DAILY_NOTE_DESC));
	}

	private folderDesc(): string {
		const detected = detectFolders(this.app);
		const detectedText =
			detected.length === 0
				? 'No Shadow folder found in this vault yet.'
				: `Found: ${detected.map(describeFolder).join(', ')}.`;
		return `The folder that holds SHADOW.md, Meetings and People. Leave empty to find it automatically. ${detectedText}`;
	}

	private folderControls(setting: Setting): void {
		setting.addText((text) => {
			text
				.setPlaceholder('Detect automatically')
				.setValue(this.plugin.settings.shadowFolder)
				.onChange(async (value) => {
					this.plugin.settings.shadowFolder = value.trim();
					await this.plugin.saveSettings();
				});
			setting.addButton((button) =>
				button
					.setButtonText('Detect')
					.setDisabled(detectFolders(this.app).length === 0)
					.onClick(async () => {
						const [first] = detectFolders(this.app);
						if (first === undefined) return;
						this.plugin.settings.shadowFolder = first === '' ? '/' : first;
						text.setValue(this.plugin.settings.shadowFolder);
						await this.plugin.saveSettings();
					}),
			);
		});
	}

	private dailyNoteControls(setting: Setting): void {
		setting.addToggle((toggle) =>
			toggle.setValue(this.plugin.settings.dailyNoteLinks).onChange(async (value) => {
				this.plugin.settings.dailyNoteLinks = value;
				await this.plugin.saveSettings();
			}),
		);
	}
}
