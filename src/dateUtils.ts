import { moment } from "obsidian";
import { WeekStart } from "./settings";

/** The moment locale id to format with ("system" defers to Obsidian's locale). */
export function effectiveLocale(override: string): string {
	return override && override !== "system" ? override : moment.locale();
}

/** First day of week as 0 (Sun) .. 6 (Sat), resolving "locale" against `locale`. */
export function weekStartDay(weekStart: WeekStart, locale: string): number {
	if (weekStart === "locale") {
		return moment().locale(locale).localeData().firstDayOfWeek();
	}
	return weekStart;
}

/** Start-of-week for `date` given an explicit first-day (0..6). */
export function startOfWeek(date: moment.Moment, firstDay: number): moment.Moment {
	const d = date.clone().startOf("day");
	const diff = (d.day() - firstDay + 7) % 7;
	return d.subtract(diff, "days");
}

/** Short weekday labels ordered from `firstDay` (e.g. Mon..Sun or 周一..周日). */
export function weekdayLabels(firstDay: number, locale: string): string[] {
	const short = moment().locale(locale).localeData().weekdaysShort();
	const out: string[] = [];
	for (let i = 0; i < 7; i++) out.push(short[(firstDay + i) % 7]);
	return out;
}

/** True when `dayOfWeek` (0=Sun..6=Sat) is Saturday or Sunday. */
export function isWeekend(dayOfWeek: number): boolean {
	return dayOfWeek === 0 || dayOfWeek === 6;
}
