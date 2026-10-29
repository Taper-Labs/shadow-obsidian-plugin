import { moment } from 'obsidian';

// Obsidian's `moment` export takes its types from the separate moment package.
// Where that package is not installed, as in the community directory's review,
// every call reads as `any`. The plugin goes through this typed view instead.

interface FormattedDate {
	format(pattern: string): string;
	year(): number;
}

interface DateLibrary {
	(input?: Date | string, pattern?: string): FormattedDate;
	localeData(): { firstDayOfWeek(): number };
}

export const dates = moment as unknown as DateLibrary;
