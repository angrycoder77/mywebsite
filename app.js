// =============================================================================
// app.js — the "brain" of super-simpletasks
//
// This file:
//   1. Loads saved tasks/tags
//   2. Draws the calendar, tag list, and todo list
//   3. Listens for clicks, typing, and form submits
//   4. Saves changes back to localStorage
//
// Syntax you will see a lot:
//   import { name } from "./file.js"  — pull exported functions from another module
//   const x = ...                     — a name that will not be reassigned
//   let x = ...                       — a name that CAN be reassigned later
//   obj.property                      — read a field on an object
//   fn()                              — call a function
//   (arg) => { ... }                  — an arrow function (a compact function value)
// =============================================================================

// Curly braces after import mean: take these NAMED exports from that file.
import { loadState, saveState, createId } from "./store.js";
import {
  toISODate,
  formatPrettyDate,
  formatMonthYear,
  formatTimeRange,
  buildMonthGrid,
  isToday,
} from "./calendar.js";

// -----------------------------------------------------------------------------
// 1. STATE — the live data the screen is drawn from
// -----------------------------------------------------------------------------

// loadState() returns { version, user, tags, tasks }.
// We keep it in "state" so every render function can read the same source of truth.
const state = loadState();

// UI-only state (not saved). This is what the user is currently looking at.
// An object literal { key: value } groups related fields together.
const ui = {
  view: "inbox", // "inbox" | "today" | "completed" | "date" | "tag"
  selectedDate: null, // "YYYY-MM-DD" when view === "date"
  selectedTagId: null, // tag id when view === "tag"
  priority: "", // "" means all priorities; otherwise "high" | "medium" | "low"
  search: "",
  year: new Date().getFullYear(),
  month: new Date().getMonth(), // 0 = January
  editingId: null, // which task the modal is editing, or null for a new task
  // Inbox organize controls. These only affect how Inbox is drawn, not saved tasks.
  inboxGroup: "date", // "date" | "priority" | "both"
  inboxDateDir: "asc", // "asc" = soonest first, "desc" = latest first
  inboxPriorityDir: "high", // "high" = High→Low, "low" = Low→High
};

// -----------------------------------------------------------------------------
// 2. DOM LOOKUPS — grab HTML elements once, by id
//
// document.getElementById("x") finds <... id="x">.
// We store the results so we do not search the page on every click.
// -----------------------------------------------------------------------------

const searchInput = document.getElementById("search-input");
const newTaskBtn = document.getElementById("new-task-btn");
const prevMonthBtn = document.getElementById("prev-month");
const nextMonthBtn = document.getElementById("next-month");
const calTitle = document.getElementById("cal-title");
const calGrid = document.getElementById("cal-grid");
const tagList = document.getElementById("tag-list");
const newTagForm = document.getElementById("new-tag-form");
const newTagName = document.getElementById("new-tag-name");
const newTagColor = document.getElementById("new-tag-color");
const listEyebrow = document.getElementById("list-eyebrow");
const listTitle = document.getElementById("list-title");
const listCount = document.getElementById("list-count");
const taskList = document.getElementById("task-list");
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modal-title");
const taskForm = document.getElementById("task-form");
const fieldTitle = document.getElementById("field-title");
const fieldDate = document.getElementById("field-date");
const fieldStart = document.getElementById("field-start");
const fieldEnd = document.getElementById("field-end");
const modalTags = document.getElementById("modal-tags");
const deleteTaskBtn = document.getElementById("delete-task-btn");
const inboxOrganize = document.getElementById("inbox-organize");

// -----------------------------------------------------------------------------
// 3. HELPERS
// -----------------------------------------------------------------------------

// Persist the current state. We call this after every change.
function persist() {
  saveState(state);
}

// Stop HTML from treating user text as markup.
// If someone types <script>, we want it shown as text, not run as code.
// The /g flag on a regex means "replace ALL matches, not just the first".
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Find a tag object by id. .find() returns the first match, or undefined.
function getTag(id) {
  return state.tags.find((tag) => tag.id === id);
}

// Decide which tasks belong on the current screen.
function getVisibleTasks() {
  const today = toISODate(new Date());
  const query = ui.search.trim().toLowerCase();
  // .trim() removes extra spaces. .toLowerCase() makes search case-insensitive.

  // .filter() keeps items where the callback returns true.
  return state.tasks.filter((task) => {
    if (ui.view === "inbox" && task.completed) return false;
    if (ui.view === "today" && (task.date !== today || task.completed)) return false;
    if (ui.view === "completed" && !task.completed) return false;
    if (ui.view === "date" && task.date !== ui.selectedDate) return false;
    if (ui.view === "tag" && !task.tagIds.includes(ui.selectedTagId)) return false;
    if (ui.priority && task.priority !== ui.priority) return false;
    if (query && !task.title.toLowerCase().includes(query)) return false;
    return true;
  });
}

// Sort: incomplete first, then by date, then by start time.
function sortTasks(tasks) {
  // .slice() copies the array so we do not reorder the saved list.
  // .sort() compares two items. Return negative if a should come first.
  return tasks.slice().sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const dateA = a.date || "9999-99-99";
    const dateB = b.date || "9999-99-99";
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    // localeCompare compares strings in dictionary order. "09:00" < "18:30".
    return (a.startTime || "99:99").localeCompare(b.startTime || "99:99");
  });
}

// Number used to compare priorities. Lower number = more urgent when sorting High first.
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

// Compare two tasks by priority, honoring the Inbox "Sort priority" buttons.
function comparePriority(a, b) {
  const rankA = PRIORITY_RANK[a.priority] ?? 1;
  const rankB = PRIORITY_RANK[b.priority] ?? 1;
  // Subtracting ranks: negative means a comes first.
  return ui.inboxPriorityDir === "high" ? rankA - rankB : rankB - rankA;
}

// Compare two tasks by date, honoring "Soonest first" vs "Latest first".
// Tasks with no date always sink to the bottom, whichever direction you pick.
function compareDate(a, b) {
  if (!a.date && !b.date) return 0;
  if (!a.date) return 1;
  if (!b.date) return -1;
  const ordered = a.date.localeCompare(b.date);
  return ui.inboxDateDir === "asc" ? ordered : -ordered;
}

// After date/priority, fall back to start time so 9am sits above 6pm.
function compareTime(a, b) {
  return (a.startTime || "99:99").localeCompare(b.startTime || "99:99");
}

function sortInboxTasks(tasks) {
  return tasks.slice().sort((a, b) => {
    if (ui.inboxGroup === "priority") {
      return comparePriority(a, b) || compareDate(a, b) || compareTime(a, b);
    }
    // "date" and "both": date is the outer order; priority is the inner order.
    return compareDate(a, b) || comparePriority(a, b) || compareTime(a, b);
  });
}

// Split an array into a Map of key → tasks. Map remembers insertion order.
function groupBy(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    // If this key is new, start an empty array, then push the task into it.
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function orderedDateKeys(keys) {
  const dated = keys.filter((key) => key !== "none");
  dated.sort((a, b) => {
    const ordered = a.localeCompare(b);
    return ui.inboxDateDir === "asc" ? ordered : -ordered;
  });
  // "No date" is always last so undated tasks do not hide dated ones.
  return keys.includes("none") ? [...dated, "none"] : dated;
}

function orderedPriorityKeys(keys) {
  const order =
    ui.inboxPriorityDir === "high"
      ? ["high", "medium", "low"]
      : ["low", "medium", "high"];
  // .filter keeps only priorities that actually have tasks right now.
  return order.filter((key) => keys.includes(key));
}

function tomorrowISO() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return toISODate(date);
}

function dateSectionMeta(isoKey) {
  if (isoKey === "none") {
    return { label: "No date", className: "" };
  }
  const today = toISODate(new Date());
  const pretty = formatPrettyDate(isoKey);
  if (isoKey < today) return { label: `Overdue · ${pretty}`, className: "is-overdue" };
  if (isoKey === today) return { label: `Today · ${pretty}`, className: "is-today" };
  if (isoKey === tomorrowISO()) return { label: `Tomorrow · ${pretty}`, className: "" };
  return { label: pretty, className: "" };
}

function prioritySectionMeta(priority) {
  const labels = { high: "High", medium: "Medium", low: "Low" };
  return {
    label: `${labels[priority] || "Medium"} priority`,
    className: `is-${priority}`,
  };
}

// Count how many tasks fall on each calendar day (for the dots).
function taskCountByDate() {
  const counts = {};
  // for...of loops over each item in an array.
  for (const task of state.tasks) {
    if (!task.date || task.completed) continue;
    // counts[date] = (counts[date] || 0) + 1
    // If the key is missing, treat it as 0, then add 1.
    counts[task.date] = (counts[task.date] || 0) + 1;
  }
  return counts;
}

// -----------------------------------------------------------------------------
// 4. RENDER — turn state into HTML
//
// innerHTML replaces everything inside an element with a string of HTML.
// We rebuild the lists whenever data changes. Simple, and easy to follow.
// -----------------------------------------------------------------------------

function renderCalendar() {
  calTitle.textContent = formatMonthYear(ui.year, ui.month);
  const counts = taskCountByDate();
  const cells = buildMonthGrid(ui.year, ui.month);

  // .map() turns each cell into an HTML string. .join("") glues them together.
  calGrid.innerHTML = cells
    .map((cell) => {
      if (!cell.day) {
        return `<button class="cal-day is-empty" type="button" disabled></button>`;
      }

      const classes = ["cal-day"];
      if (isToday(cell.iso)) classes.push("is-today");
      if (ui.view === "date" && ui.selectedDate === cell.iso) classes.push("is-selected");

      const count = counts[cell.iso] || 0;
      // Math.min(count, 3) caps dots at 3 so a busy day does not overflow.
      const dots = Array.from({ length: Math.min(count, 3) }, () => "<i></i>").join("");

      // data-date is a custom attribute. JS reads it later with .dataset.date
      return `
        <button class="${classes.join(" ")}" type="button" data-date="${cell.iso}" aria-label="${cell.iso}">
          ${cell.day}
          <span class="cal-dots">${dots}</span>
        </button>
      `;
    })
    .join("");
}

function renderTags() {
  if (state.tags.length === 0) {
    tagList.innerHTML = `<p class="empty">No tags yet</p>`;
    return;
  }

  tagList.innerHTML = state.tags
    .map((tag) => {
      const active = ui.view === "tag" && ui.selectedTagId === tag.id ? "is-active" : "";
      return `
        <div class="tag-row">
          <button class="tag-btn ${active}" type="button" data-tag-id="${tag.id}">
            <span class="tag-dot" style="background:${tag.color}"></span>
            ${escapeHtml(tag.name)}
          </button>
          <button class="tag-delete" type="button" data-delete-tag="${tag.id}" aria-label="Delete ${escapeHtml(tag.name)}">×</button>
        </div>
      `;
    })
    .join("");
}

function renderListHeader(visibleCount) {
  if (ui.view === "inbox") {
    listEyebrow.textContent = "Inbox";
    listTitle.textContent = "All open tasks";
  } else if (ui.view === "today") {
    listEyebrow.textContent = "Today";
    listTitle.textContent = formatPrettyDate(toISODate(new Date()));
  } else if (ui.view === "completed") {
    listEyebrow.textContent = "Done";
    listTitle.textContent = "Completed tasks";
  } else if (ui.view === "date") {
    listEyebrow.textContent = "Day";
    listTitle.textContent = formatPrettyDate(ui.selectedDate);
  } else if (ui.view === "tag") {
    const tag = getTag(ui.selectedTagId);
    listEyebrow.textContent = "Tag";
    listTitle.textContent = tag ? tag.name : "Tag";
  }

  // Ternary: condition ? ifTrue : ifFalse. Here it picks singular vs plural.
  listCount.textContent = `${visibleCount} ${visibleCount === 1 ? "task" : "tasks"}`;
}

// Build one task row. showDate/showPriority let sections skip duplicate labels.
function taskItemHtml(task, { showDate = true, showPriority = true } = {}) {
  // The `= {}` default means you can call taskItemHtml(task) with no second argument.
  const time = formatTimeRange(task.startTime, task.endTime);
  const dateLabel = showDate && task.date ? formatPrettyDate(task.date) : "";
  const tagPills = task.tagIds
    .map((id) => getTag(id))
    .filter(Boolean)
    .map((tag) => `<span class="pill" style="color:${tag.color}">${escapeHtml(tag.name)}</span>`)
    .join("");

  const metaBits = [];
  if (showPriority) {
    metaBits.push(`<span class="pill pill-${task.priority}">${task.priority}</span>`);
  }
  metaBits.push(tagPills);

  return `
    <li class="task ${task.completed ? "is-done" : ""} priority-${task.priority}" data-id="${task.id}">
      <button class="check" type="button" data-action="toggle" aria-label="Toggle complete"></button>
      <div class="task-body">
        ${time ? `<p class="task-time">${time}${dateLabel ? " · " + dateLabel : ""}</p>` : dateLabel ? `<p class="task-time">${dateLabel}</p>` : ""}
        <h3>${escapeHtml(task.title)}</h3>
        <div class="task-meta">${metaBits.join("")}</div>
      </div>
      <button class="edit-btn" type="button" data-action="edit">Edit</button>
    </li>
  `;
}

function sectionHeading(level, title, count, extraClass) {
  // level is "h3" for a main section or "h4" for a subsection.
  // We wrap the heading in a div so we do not nest <h3> inside <h3>.
  const wrapClass = level === "h3" ? "section-head" : "subsection-head";
  return `
    <div class="${wrapClass} ${extraClass}">
      <${level}>${escapeHtml(title)}</${level}>
      <span class="section-count">${count}</span>
    </div>
  `;
}

function renderInboxSections(tasks) {
  const sorted = sortInboxTasks(tasks);

  if (ui.inboxGroup === "priority") {
    const groups = groupBy(sorted, (task) => task.priority || "medium");
    return orderedPriorityKeys([...groups.keys()])
      .map((key) => {
        const items = groups.get(key);
        const meta = prioritySectionMeta(key);
        return `
          <li class="task-section">
            ${sectionHeading("h3", meta.label, items.length, meta.className)}
            <ul class="nested-list">
              ${items.map((task) => taskItemHtml(task, { showDate: true, showPriority: false })).join("")}
            </ul>
          </li>
        `;
      })
      .join("");
  }

  const dateGroups = groupBy(sorted, (task) => task.date || "none");
  const dateKeys = orderedDateKeys([...dateGroups.keys()]);

  if (ui.inboxGroup === "date") {
    return dateKeys
      .map((key) => {
        const items = dateGroups.get(key);
        const meta = dateSectionMeta(key);
        return `
          <li class="task-section">
            ${sectionHeading("h3", meta.label, items.length, meta.className)}
            <ul class="nested-list">
              ${items.map((task) => taskItemHtml(task, { showDate: false, showPriority: true })).join("")}
            </ul>
          </li>
        `;
      })
      .join("");
  }

  // "both": a date section, then priority subsections inside it.
  return dateKeys
    .map((dateKey) => {
      const dayTasks = dateGroups.get(dateKey);
      const dateMeta = dateSectionMeta(dateKey);
      const priorityGroups = groupBy(dayTasks, (task) => task.priority || "medium");
      const inner = orderedPriorityKeys([...priorityGroups.keys()])
        .map((priorityKey) => {
          const items = priorityGroups.get(priorityKey);
          const prioMeta = prioritySectionMeta(priorityKey);
          return `
            <li class="task-section">
              ${sectionHeading("h4", prioMeta.label, items.length, prioMeta.className)}
              <ul class="nested-list">
                ${items.map((task) => taskItemHtml(task, { showDate: false, showPriority: false })).join("")}
              </ul>
            </li>
          `;
        })
        .join("");

      return `
        <li class="task-section">
          ${sectionHeading("h3", dateMeta.label, dayTasks.length, dateMeta.className)}
          <ul class="nested-list">${inner}</ul>
        </li>
      `;
    })
    .join("");
}

function renderInboxOrganize() {
  const isInbox = ui.view === "inbox";
  inboxOrganize.hidden = !isInbox;
  if (!isInbox) return;

  inboxOrganize.querySelectorAll("[data-inbox-group]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.inboxGroup === ui.inboxGroup);
  });
  inboxOrganize.querySelectorAll("[data-inbox-date]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.inboxDate === ui.inboxDateDir);
  });
  inboxOrganize.querySelectorAll("[data-inbox-priority]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.inboxPriority === ui.inboxPriorityDir);
  });
}

function renderTasks() {
  const visible = getVisibleTasks();
  renderListHeader(visible.length);
  renderInboxOrganize();

  if (visible.length === 0) {
    taskList.innerHTML = `<li class="empty">Nothing here yet. Add a task to get started.</li>`;
    return;
  }

  if (ui.view === "inbox") {
    taskList.innerHTML = renderInboxSections(visible);
    return;
  }

  taskList.innerHTML = sortTasks(visible)
    .map((task) => taskItemHtml(task, { showDate: ui.view !== "today" && ui.view !== "date", showPriority: true }))
    .join("");
}

function renderViewButtons() {
  // querySelectorAll returns every matching element. We loop and toggle a class.
  // classList.toggle(name, true/false) adds or removes a CSS class.
  document.querySelectorAll(".view-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.view === ui.view);
  });
}

function renderPriorityChips() {
  document.querySelectorAll(".chip[data-priority]").forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.priority === ui.priority);
  });
}

function renderAll() {
  renderCalendar();
  renderTags();
  renderTasks();
  renderViewButtons();
  renderPriorityChips();
}

// -----------------------------------------------------------------------------
// 5. MODAL — add / edit a task
// -----------------------------------------------------------------------------

function fillModalTags(selectedIds) {
  modalTags.innerHTML = state.tags
    .map((tag) => {
      const checked = selectedIds.includes(tag.id) ? "checked" : "";
      return `
        <label>
          <input type="checkbox" name="tagIds" value="${tag.id}" ${checked} />
          <span class="tag-dot" style="background:${tag.color}"></span>
          ${escapeHtml(tag.name)}
        </label>
      `;
    })
    .join("") || `<p class="empty">Create a tag in the sidebar first.</p>`;
}

function openModal(task) {
  ui.editingId = task ? task.id : null;
  modalTitle.textContent = task ? "Edit task" : "New task";
  fieldTitle.value = task ? task.title : "";
  fieldDate.value = task ? task.date || "" : ui.selectedDate || toISODate(new Date());
  fieldStart.value = task ? task.startTime || "" : "";
  fieldEnd.value = task ? task.endTime || "" : "";

  // Pick the matching radio. querySelector uses a CSS selector string.
  const priority = task ? task.priority : "medium";
  const radio = taskForm.querySelector(`input[name="priority"][value="${priority}"]`);
  if (radio) radio.checked = true;

  fillModalTags(task ? task.tagIds : []);
  deleteTaskBtn.hidden = !task;
  modal.hidden = false;
  fieldTitle.focus();
}

function closeModal() {
  modal.hidden = true;
  ui.editingId = null;
  taskForm.reset(); // built-in: clears all fields back to defaults
}

// -----------------------------------------------------------------------------
// 6. EVENTS — user actions
// -----------------------------------------------------------------------------

newTaskBtn.addEventListener("click", () => openModal(null));

// "input" fires on every keystroke. We store the text and redraw the list.
searchInput.addEventListener("input", () => {
  ui.search = searchInput.value;
  renderTasks();
});

prevMonthBtn.addEventListener("click", () => {
  ui.month -= 1;
  if (ui.month < 0) {
    ui.month = 11;
    ui.year -= 1;
  }
  renderCalendar();
});

nextMonthBtn.addEventListener("click", () => {
  ui.month += 1;
  if (ui.month > 11) {
    ui.month = 0;
    ui.year += 1;
  }
  renderCalendar();
});

// Event delegation: listen on the parent, then check what was clicked.
// This still works after we rebuild the calendar HTML.
calGrid.addEventListener("click", (event) => {
  // closest("[data-date]") walks up from the click target to find a day button.
  const button = event.target.closest("[data-date]");
  if (!button) return;
  ui.view = "date";
  ui.selectedDate = button.dataset.date;
  ui.selectedTagId = null;
  renderAll();
});

document.querySelectorAll(".view-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    ui.view = btn.dataset.view;
    ui.selectedDate = null;
    ui.selectedTagId = null;
    renderAll();
  });
});

document.querySelectorAll(".chip[data-priority]").forEach((chip) => {
  chip.addEventListener("click", () => {
    ui.priority = chip.dataset.priority;
    renderPriorityChips();
    renderTasks();
  });
});

inboxOrganize.addEventListener("click", (event) => {
  // One listener on the whole organize bar. closest("button") finds which chip was clicked.
  const button = event.target.closest("button");
  if (!button) return;

  // dataset turns data-inbox-group into inboxGroup, data-inbox-date into inboxDate, etc.
  if (button.dataset.inboxGroup) ui.inboxGroup = button.dataset.inboxGroup;
  if (button.dataset.inboxDate) ui.inboxDateDir = button.dataset.inboxDate;
  if (button.dataset.inboxPriority) ui.inboxPriorityDir = button.dataset.inboxPriority;
  renderTasks();
});

tagList.addEventListener("click", (event) => {
  const deleteBtn = event.target.closest("[data-delete-tag]");
  if (deleteBtn) {
    const id = deleteBtn.dataset.deleteTag;
    const tag = getTag(id);
    // confirm() shows the browser's yes/no dialog. It returns true or false.
    if (!tag || !confirm(`Delete tag "${tag.name}"?`)) return;
    state.tags = state.tags.filter((item) => item.id !== id);
    // Also strip this tag off every task. .map() builds a new array of tasks.
    state.tasks = state.tasks.map((task) => ({
      ...task, // spread: copy all fields from task
      tagIds: task.tagIds.filter((tagId) => tagId !== id),
    }));
    if (ui.selectedTagId === id) {
      ui.view = "inbox";
      ui.selectedTagId = null;
    }
    persist();
    renderAll();
    return;
  }

  const tagBtn = event.target.closest("[data-tag-id]");
  if (!tagBtn) return;
  ui.view = "tag";
  ui.selectedTagId = tagBtn.dataset.tagId;
  renderAll();
});

newTagForm.addEventListener("submit", (event) => {
  // preventDefault() stops the browser from reloading the page on submit.
  event.preventDefault();
  const name = newTagName.value.trim();
  if (!name) return;
  state.tags.push({
    id: createId("tag"),
    name,
    color: newTagColor.value,
  });
  newTagName.value = "";
  persist();
  renderTags();
});

taskList.addEventListener("click", (event) => {
  const item = event.target.closest(".task");
  if (!item) return;
  const task = state.tasks.find((entry) => entry.id === item.dataset.id);
  if (!task) return;

  const action = event.target.closest("[data-action]")?.dataset.action;
  // ?. is optional chaining: if closest() returned null, do not crash; action is undefined.

  if (action === "toggle") {
    task.completed = !task.completed; // ! flips true/false
    persist();
    renderAll();
  } else if (action === "edit") {
    openModal(task);
  }
});

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = fieldTitle.value.trim();
  if (!title) return;

  const selectedPriority = taskForm.querySelector('input[name="priority"]:checked');
  // querySelectorAll + spread into an array, then keep checked boxes, then read .value
  const selectedTags = [...taskForm.querySelectorAll('input[name="tagIds"]:checked')].map(
    (input) => input.value
  );

  const payload = {
    title,
    date: fieldDate.value || null,
    startTime: fieldStart.value || null,
    endTime: fieldEnd.value || null,
    priority: selectedPriority ? selectedPriority.value : "medium",
    tagIds: selectedTags,
  };

  if (ui.editingId) {
    const task = state.tasks.find((entry) => entry.id === ui.editingId);
    if (task) Object.assign(task, payload); // copy payload fields onto the existing task
  } else {
    state.tasks.push({
      id: createId("task"),
      completed: false,
      createdAt: new Date().toISOString(),
      ...payload,
    });
  }

  persist();
  closeModal();
  renderAll();
});

deleteTaskBtn.addEventListener("click", () => {
  if (!ui.editingId) return;
  if (!confirm("Delete this task?")) return;
  state.tasks = state.tasks.filter((task) => task.id !== ui.editingId);
  persist();
  closeModal();
  renderAll();
});

// Close when clicking the dark backdrop or the Cancel button (both have data-close).
modal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close]")) closeModal();
});

// Keyboard shortcuts. event.key is the name of the key that was pressed.
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();

  // Ignore "n" while typing in an input. tagName is "INPUT", "TEXTAREA", etc.
  const typing = ["INPUT", "TEXTAREA"].includes(event.target.tagName);
  if (event.key === "n" && !typing && modal.hidden) {
    event.preventDefault();
    openModal(null);
  }
});

// -----------------------------------------------------------------------------
// 7. START — first paint
// -----------------------------------------------------------------------------

renderAll();
