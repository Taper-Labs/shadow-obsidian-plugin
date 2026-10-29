import { App, FuzzySuggestModal, TFolder } from 'obsidian';

/** Lets the user choose a vault folder, leaving out the folders Shadow manages. */
export class FolderPickerModal extends FuzzySuggestModal<TFolder> {
	constructor(
		app: App,
		private readonly excluded: (folder: TFolder) => boolean,
		private readonly onPick: (folder: TFolder) => void,
	) {
		super(app);
		this.setPlaceholder('Choose a folder for the meeting views');
	}

	getItems(): TFolder[] {
		return this.app.vault
			.getAllFolders(true)
			.filter((folder) => !this.excluded(folder))
			.sort((a, b) => a.path.localeCompare(b.path));
	}

	getItemText(folder: TFolder): string {
		return folder.isRoot() ? '/' : folder.path;
	}

	onChooseItem(folder: TFolder): void {
		this.onPick(folder);
	}
}
