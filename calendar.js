// =============================================================================
// calendar.js — date math for the sidebar month grid
//
// JavaScript's Date object is a bit quirky:
//   - months are 0-based: January = 0, August = 7, December = 11
//   - days of the week are also 0-based: Sunday = 0, Saturday = 6
// We hide those quirks behind small helper functions so app.js stays readable.
// =============================================================================

// Turn a Date into "YYYY-MM-DD". We reuse this format everywhere (inputs, filters).
export function toISODate(date) {
  const year = date.getFullYear();
  // getMonth() is 0-based, so we add 1 to get a human month number.
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Parse "YYYY-MM-DD" back into a Date at local midnight.
// The "+" unary operator turns a string into a number: +"08" === 8.
export function fromISODate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  // split("-") breaks "2026-08-29" into ["2026", "08", "29"].
  // .map(Number) runs Number() on each piece: [2026, 8, 29].
  // Array destructuring: const [a, b, c] = array  copies items into names.
  return new Date(year, month - 1, day);
}

// Nice short label like "Sat, Aug 29".
export function formatPrettyDate(iso) {
  const date = fromISODate(iso);
  // Intl.DateTimeFormat is the built-in way to format dates for humans.
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

// "August 2026" for the calendar header.
export function formatMonthYear(year, monthIndex) {
  const date = new Date(year, monthIndex, 1);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

// Format "09:00" into a friendlier "9:00 AM". If value is missing, return "".
export function formatTime(hhmm) {
  if (!hhmm) return "";
  const [hoursRaw, minutes] = hhmm.split(":");
  const hours = Number(hoursRaw);
  const suffix = hours >= 12 ? "PM" : "AM";
  // % is modulo (remainder). 13 % 12 = 1, 0 % 12 = 0 — then we show 12 for midnight.
  const twelve = hours % 12 || 12;
  return `${twelve}:${minutes} ${suffix}`;
}

// Combine start/end into "9:00 AM – 10:00 AM" or just "9:00 AM".
export function formatTimeRange(startTime, endTime) {
  if (!startTime && !endTime) return "";
  if (startTime && endTime) {
    return `${formatTime(startTime)} – ${formatTime(endTime)}`;
  }
  return formatTime(startTime || endTime);
}

// Build the cells of a month calendar, including blank cells before day 1
// so that Wednesday the 1st actually lands under "Wed".
//
// Returns an array of objects:
//   { day: number | null, iso: string | null }
// null day = a padding cell from the previous/next month (we leave it empty).
export function buildMonthGrid(year, monthIndex) {
  // Day of week for the 1st of the month (0 = Sunday).
  const firstWeekday = new Date(year, monthIndex, 1).getDay();

  // Passing day 0 of the NEXT month gives the last day of THIS month.
  // Example: new Date(2026, 8, 0) is the last day of August 2026.
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const cells = [];

  // Leading blanks so day 1 sits in the correct weekday column.
  // A classic for-loop: let i = 0; keep going while i < firstWeekday; i++ adds 1.
  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push({ day: null, iso: null });
  }

  // One cell per real day in the month.
  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = toISODate(new Date(year, monthIndex, day));
    cells.push({ day, iso });
  }

  // Trailing blanks so the last row has 7 cells (a complete week).
  // "% 7" means remainder after dividing by 7. We pad until length is a multiple of 7.
  while (cells.length % 7 !== 0) {
    cells.push({ day: null, iso: null });
  }

  return cells;
}

// True when two ISO dates are the same calendar day.
export function isSameDay(isoA, isoB) {
  return Boolean(isoA && isoB && isoA === isoB);
}

// True when iso is today in the user's local timezone.
export function isToday(iso) {
  return iso === toISODate(new Date());
}
