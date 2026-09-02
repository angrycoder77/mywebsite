// =============================================================================
// store.js — the "memory" of the app
//
// This file is an ES module (see the "export" keywords below).
// An ES module is a JavaScript file that can share functions with other files.
// Later, if we add user accounts, we can swap the localStorage parts of this
// file for server API calls without rewriting the rest of the app.
// =============================================================================

// "const" declares a name that will not be reassigned.
// A string in quotes is just text. We use this as the localStorage key —
// like a labeled box in the browser where our data lives.
const STORAGE_KEY = "super-simpletasks-data-v1";

// This number lets us change the data shape later (for accounts, sync, etc.)
// and still load old saves. "Schema" means "the shape of the data".
const SCHEMA_VERSION = 1;

// A default list of tags for a first-time visitor.
// [] is an array (an ordered list). {} is an object (a named collection of fields).
// Each object here has: id (unique name), name (label), color (hex color code).
const DEFAULT_TAGS = [
  { id: "tag-work", name: "Work", color: "#818cf8" },
  { id: "tag-personal", name: "Personal", color: "#f472b6" },
  { id: "tag-health", name: "Health", color: "#34d399" },
];

// Helper: today's date as "YYYY-MM-DD" (the format <input type="date"> uses).
// "function name() {}" is a named function we can call later as toISODate(date).
function toISODate(date) {
  // Template literals use backticks ` ` and ${} to insert values into a string.
  // padStart(2, "0") means: make the string at least 2 characters, fill with 0.
  // Example: month 8 becomes "08".
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Shift a date by a number of days. Positive = future, negative = past.
function addDays(date, days) {
  // "new Date(date)" copies the date so we do not mutate the original.
  // Mutate = change in place. Copying is safer.
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

// Demo tasks so the first visit is not an empty screen.
// "export" is not used here because this helper stays private to this file.
function buildDemoTasks() {
  const today = new Date();
  const tomorrow = addDays(today, 1);
  const yesterday = addDays(today, -1);

  // Return an array of task objects. Each field is explained once:
  //   id         — unique string so we can find this task later
  //   title      — what you see in the list
  //   completed  — true/false (boolean). false = still to do
  //   date       — which calendar day this belongs to, or null if undated
  //   startTime  — "HH:MM" 24-hour time, or null
  //   endTime    — optional end of a time range, or null
  //   priority   — "high" | "medium" | "low"
  //   tagIds     — array of tag ids (a task can have several tags)
  //   createdAt  — ISO timestamp string, useful if we sync accounts later
  return [
    {
      id: "task-demo-1",
      title: "Outline the weekly plan",
      completed: false,
      date: toISODate(today),
      startTime: "09:00",
      endTime: "10:00",
      priority: "high",
      tagIds: ["tag-work"],
      createdAt: new Date().toISOString(),
    },
    {
      id: "task-demo-2",
      title: "Gym — upper body",
      completed: false,
      date: toISODate(today),
      startTime: "18:30",
      endTime: "19:30",
      priority: "medium",
      tagIds: ["tag-health"],
      createdAt: new Date().toISOString(),
    },
    {
      id: "task-demo-3",
      title: "Call home",
      completed: false,
      date: toISODate(tomorrow),
      startTime: "20:00",
      endTime: null,
      priority: "low",
      tagIds: ["tag-personal"],
      createdAt: new Date().toISOString(),
    },
    {
      id: "task-demo-4",
      title: "Buy groceries",
      completed: true,
      date: toISODate(yesterday),
      startTime: null,
      endTime: null,
      priority: "medium",
      tagIds: ["tag-personal"],
      createdAt: new Date().toISOString(),
    },
  ];
}

// The full document we save. "user: null" is a placeholder for future accounts.
function emptyState() {
  return {
    version: SCHEMA_VERSION,
    user: null,
    tags: DEFAULT_TAGS,
    tasks: buildDemoTasks(),
  };
}

// Load saved data from this browser. If nothing is saved yet, create demo data.
// "export" makes this function importable in other files: import { loadState } from ...
export function loadState() {
  // try/catch: if the next lines throw an error, jump to catch instead of crashing.
  try {
    // localStorage.getItem reads the labeled box. It returns a string, or null
    // if the box is empty. null means "no value".
    const raw = localStorage.getItem(STORAGE_KEY);

    // !raw is true when raw is null, undefined, or "". Then we start fresh.
    if (!raw) {
      const fresh = emptyState();
      saveState(fresh);
      return fresh;
    }

    // JSON.parse turns a JSON text string back into a real object/array.
    // JSON is a text format that looks a lot like JavaScript object syntax.
    const parsed = JSON.parse(raw);

    // The "&&" operator means AND. We only accept data that looks like ours.
    // Array.isArray(x) is true when x is an array.
    if (!parsed || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.tags)) {
      return emptyState();
    }

    // If we add accounts later, old saves without a "user" field still work.
    // The "??" operator (nullish coalescing) means: use the right side only
    // if the left side is null or undefined.
    return {
      version: parsed.version ?? SCHEMA_VERSION,
      user: parsed.user ?? null,
      tags: parsed.tags,
      tasks: parsed.tasks,
    };
  } catch (error) {
    // console.warn prints a yellow warning in the browser DevTools console.
    // It does not show on the page. Useful for debugging.
    console.warn("super-simpletasks could not read saved data, starting fresh.", error);
    return emptyState();
  }
}

// Write the current state into localStorage.
export function saveState(state) {
  // JSON.stringify turns an object into text. localStorage can ONLY store strings.
  const payload = JSON.stringify(state);
  localStorage.setItem(STORAGE_KEY, payload);
}

// Create a unique id. crypto.randomUUID() is built into modern browsers.
// It returns a string like "3f1c...". The "??" fallback is for very old browsers.
export function createId(prefix) {
  const random =
    (crypto && crypto.randomUUID && crypto.randomUUID()) ||
    String(Date.now()) + "-" + Math.random().toString(16).slice(2);
  return `${prefix}-${random}`;
}
