import { App, PluginSettingTab, Setting } from 'obsidian';
import type ShadowMeetingsPlugin from './main';
import { detectFolders } from './source';

export interface ShadowMeetingsSettings {
	/** Folder Shadow writes to, relative to the vault root. Empty means detect it. */
	shadowFolder: string;
	/** Set once the list has been added to the sidebar on first run. */
	listAddedOnce: boolean;
}

export const DEFAULT_SETTINGS: ShadowMeetingsSettings = {
	shadowFolder: '',
	listAddedOnce: false,
};

function describeFolder(folder: string): string {
	return folder === '' ? 'the vault root' : folder;
}

export class ShadowMeetingsSettingTab extends PluginSettingTab {
	plugin: ShadowMeetingsPlugin;

	constructor(app: App, plugin: ShadowMeetingsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const detected = detectFolders(this.app);
		const detectedText =
			detected.length === 0
				? 'No Shadow folder found in this vault yet.'
				: `Found: ${detected.map(describeFolder).join(', ')}.`;

		new Setting(containerEl)
			.setName('Shadow folder')
			.setDesc(
				`The folder that holds SHADOW.md, Meetings and People. Leave empty to find it automatically. ${detectedText}`,
			)
			.addText((text) =>
				text
					.setPlaceholder('Detect automatically')
					.setValue(this.plugin.settings.shadowFolder)
					.onChange(async (value) => {
						this.plugin.settings.shadowFolder = value.trim();
						await this.plugin.saveSettings();
					}),
			)
			.addButton((button) =>
				button
					.setButtonText('Detect')
					.setDisabled(detected.length === 0)
					.onClick(async () => {
						const [first] = detectFolders(this.app);
						if (first === undefined) return;
						this.plugin.settings.shadowFolder = first === '' ? '/' : first;
						await this.plugin.saveSettings();
						this.display();
					}),
			);
	}
}
