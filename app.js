import { openDatabase, getAll, put, putMany, remove, clear, seedExercises } from "./db.js";
import {
  uid,
  escapeHtml,
  workoutVolume,
  formatNumber,
  durationMinutes,
  localDateKey,
  exerciseProgress,
  weeklyStats
} from "./utils.js";

const ACTIVE_KEY = "zhelezo-active-workout";
const SETTINGS_KEY = "zhelezo-settings";
const TIMER_KEY = "zhelezo-timer-end";

const categories = ["Грудь", "Спина", "Ноги", "Плечи", "Руки", "Кор", "Другое"];
const categoryLetters = { Грудь: "Г", Спина: "С", Ноги: "Н", Плечи: "П", Руки: "Р", Кор: "К", Другое: "•" };

const state = {
  route: "home",
  exercises: [],
  workouts: [],
  activeWorkout: readJson(ACTIVE_KEY),
  settings: { restSeconds: 90, ...readJson(SETTINGS_KEY) },
  selectedProgressId: "",
  timerEnd: Number(localStorage.getItem(TIMER_KEY)) || 0,
  expandedWorkout: null
};

const app = document.querySelector("#app");
const nav = document.querySelector("#bottom-nav");
const exerciseDialog = document.querySelector("#exercise-dialog");
const newExerciseDialog = document.querySelector("#new-exercise-dialog");
const exercisePicker = document.querySelector("#exercise-picker");
const exerciseSearch = document.querySelector("#exercise-search");
const toastElement = document.querySelector("#toast");
const timerBar = document.querySelector("#timer-bar");
let toastTimeout;
let clockInterval;

init();

async function init() {
  try {
    await openDatabase();
    await refreshData();
    setTodayLabel();
    bindEvents();
    updateOnlineStatus();
    updateTimer();
    clockInterval = window.setInterval(() => {
      updateTimer();
      updateWorkoutClock();
    }, 1000);
    render();
    registerServiceWorker();
  } catch (error) {
    console.error(error);
    app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">!</div><h3>Не удалось открыть хранилище</h3><p>Перезапусти приложение. Если ошибка останется, проверь, разрешено ли Safari хранить данные сайтов.</p></div>`;
  }
}

function bindEvents() {
  document.addEventListener("click", handleClick);
  document.addEventListener("input", handleInput);
  document.addEventListener("change", handleChange);
  document.querySelector("#new-exercise-form").addEventListener("submit", createExercise);
  document.querySelector("#import-file").addEventListener("change", importBackup);
  window.addEventListener("online", updateOnlineStatus);
  window.addEventListener("offline", updateOnlineStatus);
  exerciseSearch.addEventListener("input", () => renderExercisePicker(exerciseSearch.value));
  exerciseDialog.addEventListener("click", (event) => {
    if (event.target === exerciseDialog) exerciseDialog.close();
  });
}

async function refreshData() {
  state.exercises = (await getAll("exercises")).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  state.workouts = (await getAll("workouts")).sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!state.selectedProgressId) state.selectedProgressId = mostUsedExerciseId() || state.exercises[0]?.id || "";
}

function render() {
  nav.hidden = state.route === "workout";
  app.classList.toggle("workout-view", state.route === "workout");
  nav.querySelectorAll("[data-route]").forEach((button) => button.classList.toggle("active", button.dataset.route === state.route));

  const renderers = {
    home: renderHome,
    history: renderHistory,
    progress: renderProgress,
    settings: renderSettings,
    workout: renderWorkout
  };
  app.innerHTML = (renderers[state.route] || renderHome)();
  window.scrollTo({ top: 0, behavior: "instant" });
}

function renderHome() {
  const stats = weeklyStats(state.workouts);
  const lastWorkout = state.workouts[0];
  const subtitle = state.activeWorkout
    ? "Тренировка уже идёт. Продолжим с того же места."
    : "Без аккаунтов, облаков и лишней суеты. Только ты и железо.";

  return `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">${greeting().toUpperCase()}</p>
        <h1>${state.activeWorkout ? "Продолжаем\nработу." : "Время поднять\nтяжёлое."}</h1>
        <p>${subtitle}</p>
        <button class="button button-primary" data-action="start-workout">
          ${state.activeWorkout ? "Продолжить тренировку" : "Начать тренировку"}
        </button>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><div><h2>Эта неделя</h2><p>С понедельника по сегодня</p></div></div>
      <div class="stats-grid">
        <article class="stat-card accent"><strong>${stats.count}</strong><span>тренировки</span></article>
        <article class="stat-card"><strong>${formatCompact(stats.volume)}</strong><span>общий объём, кг</span></article>
        <article class="stat-card"><strong>${stats.sets}</strong><span>рабочих подходов</span></article>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div><h2>Последняя тренировка</h2><p>${lastWorkout ? friendlyDate(lastWorkout.date) : "Здесь скоро появится первая запись"}</p></div>
        ${lastWorkout ? '<button class="text-button" data-route="history">Все</button>' : ""}
      </div>
      ${lastWorkout ? workoutCard(lastWorkout, false) : emptyState("◎", "Пока пусто", "Проведи первую тренировку — результаты сохранятся прямо на этом устройстве.", "Начать", "start-workout")}
    </section>`;
}

function renderWorkout() {
  if (!state.activeWorkout) {
    state.route = "home";
    return renderHome();
  }
  const workout = state.activeWorkout;
  const totalSets = workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
  const doneSets = workout.exercises.reduce((sum, exercise) => sum + exercise.sets.filter((set) => set.done).length, 0);

  return `
    <div class="workout-top">
      <button class="icon-button" data-action="leave-workout" aria-label="Свернуть">‹</button>
      <div class="timer-label"><small>${workout.editingId ? "РЕДАКТИРОВАНИЕ" : "ТРЕНИРОВКА ИДЁТ"}</small><strong id="workout-clock">${elapsed(workout.startedAt)}</strong></div>
      <button class="text-button" data-action="cancel-workout">Отмена</button>
    </div>
    <div class="section-head">
      <div><h2>${workout.editingId ? "Правим запись" : "Рабочие подходы"}</h2><p>${doneSets} из ${totalSets} отмечено</p></div>
    </div>
    <div id="active-exercises">
      ${workout.exercises.length ? workout.exercises.map(activeExerciseCard).join("") : emptyState("＋", "Добавь первое упражнение", "Выбери движение из списка или создай своё.", "Добавить упражнение", "open-exercises")}
    </div>
    ${workout.exercises.length ? '<button class="button button-secondary full-width" data-action="open-exercises">+ Добавить упражнение</button>' : ""}
    <section class="section">
      <label class="field-label">Заметка к тренировке
        <textarea class="workout-note" data-field="workout-note" placeholder="Самочувствие, техника, что изменить в следующий раз…">${escapeHtml(workout.note || "")}</textarea>
      </label>
    </section>
    <div class="workout-actions">
      <button class="button button-primary" data-action="finish-workout">${workout.editingId ? "Сохранить изменения" : "Завершить тренировку"}</button>
    </div>`;
}

function activeExerciseCard(exercise, exerciseIndex) {
  const category = state.exercises.find((item) => item.id === exercise.exerciseId)?.category || "Другое";
  return `
    <article class="exercise-card" data-entry-id="${exercise.id}">
      <div class="exercise-card-head">
        <div class="exercise-name-wrap">
          <span class="exercise-symbol">${categoryLetters[category] || "•"}</span>
          <div><h3>${escapeHtml(exercise.name)}</h3><small>${escapeHtml(category)}</small></div>
        </div>
        <button class="icon-button" data-action="remove-exercise" data-entry-id="${exercise.id}" aria-label="Удалить упражнение">×</button>
      </div>
      <div class="sets-head"><span>СЕТ</span><span>КГ</span><span></span><span>ПОВТ.</span><span>ГОТОВО</span><span></span></div>
      ${exercise.sets.map((set, index) => `
        <div class="set-row">
          <span class="set-index">${index + 1}</span>
          <input class="set-input" inputmode="decimal" type="number" min="0" max="999" step="0.5" value="${escapeHtml(set.weight)}" placeholder="0" data-set-field="weight" data-entry-id="${exercise.id}" data-set-id="${set.id}" aria-label="Вес подхода ${index + 1}" />
          <span class="set-multiply">×</span>
          <input class="set-input" inputmode="numeric" type="number" min="0" max="999" step="1" value="${escapeHtml(set.reps)}" placeholder="0" data-set-field="reps" data-entry-id="${exercise.id}" data-set-id="${set.id}" aria-label="Повторения подхода ${index + 1}" />
          <button class="set-check ${set.done ? "done" : ""}" data-action="toggle-set" data-entry-id="${exercise.id}" data-set-id="${set.id}" aria-label="Отметить подход">✓</button>
          <button class="set-remove" data-action="remove-set" data-entry-id="${exercise.id}" data-set-id="${set.id}" aria-label="Удалить подход">×</button>
        </div>`).join("")}
      <div class="exercise-card-foot">
        <button class="mini-button" data-action="add-set" data-entry-id="${exercise.id}">+ Подход</button>
        <span class="muted" style="font-size:10px">${exerciseIndex + 1}/${state.activeWorkout.exercises.length}</span>
      </div>
    </article>`;
}

function renderHistory() {
  return `
    <header class="page-head"><p class="eyebrow">ДНЕВНИК</p><h1>История</h1><p class="muted">Все тренировки остаются на этом устройстве.</p></header>
    ${state.workouts.length
      ? state.workouts.map((workout) => workoutCard(workout, true)).join("")
      : emptyState("◴", "История пока пустая", "Закончи первую тренировку, и она появится здесь.", "Начать тренировку", "start-workout")}`;
}

function workoutCard(workout, detailed) {
  const date = new Date(workout.date);
  const expanded = state.expandedWorkout === workout.id;
  const setsCount = workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
  return `
    <article class="workout-card">
      <div class="workout-summary" ${detailed ? `data-action="toggle-history" data-workout-id="${workout.id}" role="button" tabindex="0"` : ""}>
        <div class="day-block"><strong>${date.getDate()}</strong><small>${date.toLocaleDateString("ru-RU", { month: "short" }).replace(".", "")}</small></div>
        <div><h3>${escapeHtml(workout.title || "Тренировка")}</h3><p>${workout.exercises.length} упр. · ${setsCount} подх. · ${durationMinutes(workout)} мин</p></div>
        <div class="workout-volume"><strong>${formatCompact(workoutVolume(workout))}</strong><small>кг объём</small></div>
      </div>
      ${detailed ? `<div class="workout-details" ${expanded ? "" : "hidden"}>
        ${workout.exercises.map((exercise) => `<div class="history-exercise"><strong>${escapeHtml(exercise.name)}</strong><div class="set-chips">${exercise.sets.map((set) => `<span class="set-chip">${formatNumber(Number(set.weight))} × ${Number(set.reps) || 0}</span>`).join("")}</div></div>`).join("")}
        ${workout.note ? `<div class="privacy-note">${escapeHtml(workout.note)}</div>` : ""}
        <div class="card-actions">
          <button data-action="edit-workout" data-workout-id="${workout.id}">Редактировать</button>
          <button class="danger" data-action="delete-workout" data-workout-id="${workout.id}">Удалить</button>
        </div>
      </div>` : ""}
    </article>`;
}

function renderProgress() {
  if (!state.workouts.length) {
    return `<header class="page-head"><p class="eyebrow">АНАЛИТИКА</p><h1>Прогресс</h1></header>${emptyState("↗", "Нужны данные", "После первой тренировки здесь появятся рекорды и графики.", "Начать тренировку", "start-workout")}`;
  }

  const usedIds = new Set(state.workouts.flatMap((workout) => workout.exercises.map((exercise) => exercise.exerciseId)));
  const available = state.exercises.filter((exercise) => usedIds.has(exercise.id));
  if (!usedIds.has(state.selectedProgressId)) state.selectedProgressId = available[0]?.id || "";
  const points = exerciseProgress(state.workouts, state.selectedProgressId);
  const maxWeight = Math.max(0, ...points.map((point) => point.bestWeight));
  const maxReps = Math.max(0, ...points.map((point) => point.bestReps));
  const maxOneRep = Math.max(0, ...points.map((point) => point.estimatedOneRepMax));

  return `
    <header class="page-head"><p class="eyebrow">АНАЛИТИКА</p><h1>Прогресс</h1><p class="muted">Смотри, как растут рабочие веса.</p></header>
    <select class="select-control" id="progress-exercise" aria-label="Выбрать упражнение">
      ${available.map((exercise) => `<option value="${exercise.id}" ${exercise.id === state.selectedProgressId ? "selected" : ""}>${escapeHtml(exercise.name)}</option>`).join("")}
    </select>
    <div class="record-grid">
      <article class="record"><strong>${formatNumber(maxWeight)}</strong><span>ЛУЧШИЙ ВЕС, КГ</span></article>
      <article class="record"><strong>${maxReps}</strong><span>МАКС. ПОВТОРОВ</span></article>
      <article class="record"><strong>${formatNumber(maxOneRep)}</strong><span>РАСЧЁТНЫЙ 1ПМ</span></article>
    </div>
    <div class="chart-card">
      <div class="chart-head"><div><h3>Лучший вес</h3><p>${points.length} ${plural(points.length, "тренировка", "тренировки", "тренировок")}</p></div><span class="eyebrow">КГ</span></div>
      ${progressChart(points)}
    </div>
    <div class="chart-card">
      <div class="chart-head"><div><h3>Объём по тренировкам</h3><p>Вес × повторения</p></div><span class="eyebrow">ОБЪЁМ</span></div>
      ${progressChart(points, "volume")}
    </div>`;
}

function progressChart(points, key = "bestWeight") {
  if (!points.length) return '<div class="empty-state"><p>Для этого упражнения пока нет подходов.</p></div>';
  const width = 320;
  const height = 170;
  const padX = 22;
  const padTop = 18;
  const padBottom = 28;
  const values = points.map((point) => point[key]);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, max * 0.15, 1);
  const x = (index) => points.length === 1 ? width / 2 : padX + index * ((width - padX * 2) / (points.length - 1));
  const y = (value) => padTop + (max - value) / range * (height - padTop - padBottom);
  const path = points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");
  const area = `${path} L${x(points.length - 1)},${height - padBottom} L${x(0)},${height - padBottom} Z`;
  const labelIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="График прогресса">
    <defs><linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9f34a" stop-opacity=".24"/><stop offset="1" stop-color="#b9f34a" stop-opacity="0"/></linearGradient></defs>
    <path class="chart-grid" d="M${padX} ${height - padBottom}H${width - padX} M${padX} ${padTop + 42}H${width - padX}" />
    <path class="chart-area" d="${area}"/><path class="chart-line" d="${path}"/>
    ${points.map((point, index) => `<circle class="chart-dot" cx="${x(index)}" cy="${y(point[key])}" r="4"><title>${friendlyDate(point.date)}: ${formatNumber(point[key])}</title></circle>`).join("")}
    ${labelIndexes.map((index) => `<text class="chart-label" x="${x(index)}" y="${height - 8}" text-anchor="middle">${new Date(points[index].date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}</text>`).join("")}
  </svg>`;
}

function renderSettings() {
  const customCount = state.exercises.filter((exercise) => exercise.custom).length;
  return `
    <header class="page-head"><p class="eyebrow">ПРИЛОЖЕНИЕ</p><h1>Настройки</h1><p class="muted">Данные принадлежат только тебе.</p></header>
    <section class="setting-card">
      <div class="setting-row"><div><strong>Таймер отдыха</strong><small>Запускается после готового подхода</small></div><select class="select-control" id="rest-seconds"><option value="0" ${state.settings.restSeconds === 0 ? "selected" : ""}>Выкл.</option><option value="60" ${state.settings.restSeconds === 60 ? "selected" : ""}>60 сек</option><option value="90" ${state.settings.restSeconds === 90 ? "selected" : ""}>90 сек</option><option value="120" ${state.settings.restSeconds === 120 ? "selected" : ""}>120 сек</option><option value="180" ${state.settings.restSeconds === 180 ? "selected" : ""}>180 сек</option></select></div>
      <div class="setting-row"><div><strong>Свои упражнения</strong><small>${customCount} добавлено</small></div><button class="button button-secondary" data-action="open-new-exercise">Добавить</button></div>
    </section>
    <div class="privacy-note">Записи сохраняются локально в браузере этого устройства. Они не отправляются на GitHub или какой-либо сервер.</div>
    <section class="section">
      <div class="section-head"><div><h2>Резервная копия</h2><p>Защита от потери данных</p></div></div>
      <div class="setting-card">
        <div class="setting-row"><div><strong>Экспортировать</strong><small>Скачать все записи одним JSON-файлом</small></div><button class="button button-secondary" data-action="export-data">Скачать</button></div>
        <div class="setting-row"><div><strong>Восстановить</strong><small>Заменить данные из резервной копии</small></div><button class="button button-secondary" data-action="import-data">Выбрать</button></div>
      </div>
    </section>
    <section class="section">
      <div class="section-head"><div><h2>Установка</h2><p>Чтобы приложение было как обычное</p></div></div>
      <div class="setting-card"><div class="setting-row"><div><strong>Добавить на экран «Домой»</strong><small>Safari → Поделиться → На экран «Домой»</small></div></div></div>
    </section>
    <section class="section">
      <button class="button button-danger full-width" data-action="wipe-data">Удалить все мои данные</button>
    </section>
    <p class="muted" style="text-align:center;font-size:10px;margin-top:24px">ЖЕЛЕЗО · версия 1.0 · работает офлайн</p>`;
}

async function handleClick(event) {
  const routeButton = event.target.closest("[data-route]");
  if (routeButton) {
    state.route = routeButton.dataset.route;
    render();
    return;
  }
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const { action, entryId, setId, workoutId, exerciseId } = target.dataset;

  if (action === "go-home") { state.route = "home"; render(); }
  if (action === "start-workout") startWorkout();
  if (action === "leave-workout") { persistActive(); state.route = "home"; render(); }
  if (action === "open-exercises") openExerciseDialog();
  if (action === "close-exercise-dialog") exerciseDialog.close();
  if (action === "open-new-exercise") { exerciseDialog.close(); newExerciseDialog.showModal(); }
  if (action === "close-new-exercise") newExerciseDialog.close();
  if (action === "select-exercise") addExerciseToWorkout(exerciseId);
  if (action === "add-set") addSet(entryId);
  if (action === "remove-set") removeSet(entryId, setId);
  if (action === "toggle-set") toggleSet(entryId, setId);
  if (action === "remove-exercise") removeExerciseFromWorkout(entryId);
  if (action === "cancel-workout") cancelWorkout();
  if (action === "finish-workout") finishWorkout();
  if (action === "toggle-history") { state.expandedWorkout = state.expandedWorkout === workoutId ? null : workoutId; render(); }
  if (action === "edit-workout") editWorkout(workoutId);
  if (action === "delete-workout") deleteWorkout(workoutId);
  if (action === "export-data") exportBackup();
  if (action === "import-data") document.querySelector("#import-file").click();
  if (action === "wipe-data") wipeData();
  if (action === "timer-minus") adjustTimer(-15);
  if (action === "timer-plus") adjustTimer(15);
  if (action === "timer-stop") stopTimer();
}

function handleInput(event) {
  const input = event.target;
  if (input.dataset.field === "workout-note" && state.activeWorkout) {
    state.activeWorkout.note = input.value;
    persistActive();
  }
  if (input.dataset.setField && state.activeWorkout) {
    const exercise = state.activeWorkout.exercises.find((item) => item.id === input.dataset.entryId);
    const set = exercise?.sets.find((item) => item.id === input.dataset.setId);
    if (set) {
      set[input.dataset.setField] = input.value;
      persistActive();
    }
  }
}

function handleChange(event) {
  if (event.target.id === "progress-exercise") {
    state.selectedProgressId = event.target.value;
    render();
  }
  if (event.target.id === "rest-seconds") {
    state.settings.restSeconds = Number(event.target.value);
    saveSettings();
    showToast("Таймер отдыха обновлён");
  }
}

function startWorkout() {
  if (!state.activeWorkout) {
    const now = new Date();
    state.activeWorkout = { id: uid("workout"), date: now.toISOString(), startedAt: now.toISOString(), endedAt: null, exercises: [], note: "", title: "Тренировка" };
    persistActive();
  }
  state.route = "workout";
  render();
}

function openExerciseDialog() {
  exerciseSearch.value = "";
  renderExercisePicker();
  exerciseDialog.showModal();
  window.setTimeout(() => exerciseSearch.focus(), 120);
}

function renderExercisePicker(filter = "") {
  const query = filter.trim().toLocaleLowerCase("ru");
  const visible = state.exercises.filter((exercise) => exercise.name.toLocaleLowerCase("ru").includes(query));
  exercisePicker.innerHTML = visible.length ? categories.map((category) => {
    const inCategory = visible.filter((exercise) => exercise.category === category);
    if (!inCategory.length) return "";
    return `<p class="exercise-category">${category.toUpperCase()}</p>${inCategory.map((exercise) => `<button class="picker-row" data-action="select-exercise" data-exercise-id="${exercise.id}"><span>${categoryLetters[category] || "•"}</span><span>${escapeHtml(exercise.name)}${exercise.custom ? "<small>Своё упражнение</small>" : ""}</span></button>`).join("")}`;
  }).join("") : '<div class="empty-state"><p>Ничего не найдено. Можно создать своё упражнение.</p></div>';
}

function addExerciseToWorkout(exerciseId) {
  const source = state.exercises.find((exercise) => exercise.id === exerciseId);
  if (!source || !state.activeWorkout) return;
  const previous = latestSetForExercise(exerciseId);
  state.activeWorkout.exercises.push({
    id: uid("entry"),
    exerciseId: source.id,
    name: source.name,
    sets: [{ id: uid("set"), weight: previous?.weight ?? "", reps: previous?.reps ?? "", done: false }]
  });
  persistActive();
  exerciseDialog.close();
  render();
  showToast(previous ? "Добавлено с прошлым результатом" : "Упражнение добавлено");
}

function addSet(entryId) {
  const exercise = state.activeWorkout?.exercises.find((item) => item.id === entryId);
  if (!exercise) return;
  const previous = exercise.sets.at(-1) || {};
  exercise.sets.push({ id: uid("set"), weight: previous.weight ?? "", reps: previous.reps ?? "", done: false });
  persistActive();
  render();
}

function removeSet(entryId, setId) {
  const exercise = state.activeWorkout?.exercises.find((item) => item.id === entryId);
  if (!exercise) return;
  if (exercise.sets.length === 1) return showToast("В упражнении нужен хотя бы один подход");
  exercise.sets = exercise.sets.filter((set) => set.id !== setId);
  persistActive();
  render();
}

function toggleSet(entryId, setId) {
  const exercise = state.activeWorkout?.exercises.find((item) => item.id === entryId);
  const set = exercise?.sets.find((item) => item.id === setId);
  if (!set) return;
  if (!set.done && (!Number(set.reps) || Number(set.weight) < 0)) return showToast("Сначала укажи вес и повторения");
  set.done = !set.done;
  persistActive();
  if (set.done && state.settings.restSeconds > 0) startTimer(state.settings.restSeconds);
  render();
}

function removeExerciseFromWorkout(entryId) {
  if (!state.activeWorkout) return;
  state.activeWorkout.exercises = state.activeWorkout.exercises.filter((exercise) => exercise.id !== entryId);
  persistActive();
  render();
}

function cancelWorkout() {
  if (!confirm(state.activeWorkout?.editingId ? "Отменить редактирование? Исходная запись останется без изменений." : "Отменить тренировку? Внесённые подходы не сохранятся.")) return;
  state.activeWorkout = null;
  localStorage.removeItem(ACTIVE_KEY);
  stopTimer();
  state.route = "home";
  render();
}

async function finishWorkout() {
  if (!state.activeWorkout) return;
  const validExercises = state.activeWorkout.exercises.map((exercise) => ({
    ...exercise,
    sets: exercise.sets.filter((set) => Number(set.reps) > 0)
  })).filter((exercise) => exercise.sets.length);
  if (!validExercises.length) return showToast("Добавь хотя бы один выполненный подход");

  const workout = {
    ...state.activeWorkout,
    id: state.activeWorkout.editingId || state.activeWorkout.id,
    editingId: undefined,
    endedAt: new Date().toISOString(),
    exercises: validExercises.map((exercise) => ({ ...exercise, sets: exercise.sets.map((set) => ({ ...set, done: true })) }))
  };
  await put("workouts", workout);
  state.activeWorkout = null;
  localStorage.removeItem(ACTIVE_KEY);
  stopTimer();
  await refreshData();
  state.route = "history";
  state.expandedWorkout = workout.id;
  render();
  showToast("Тренировка сохранена. Красавчик!");
}

function editWorkout(workoutId) {
  const workout = state.workouts.find((item) => item.id === workoutId);
  if (!workout) return;
  if (state.activeWorkout && !confirm("Текущая незавершённая тренировка будет заменена. Продолжить?")) return;
  state.activeWorkout = structuredClone(workout);
  state.activeWorkout.editingId = workout.id;
  state.activeWorkout.exercises.forEach((exercise) => exercise.sets.forEach((set) => { set.done = true; }));
  persistActive();
  state.route = "workout";
  render();
}

async function deleteWorkout(workoutId) {
  if (!confirm("Удалить эту тренировку? Это действие нельзя отменить без резервной копии.")) return;
  await remove("workouts", workoutId);
  await refreshData();
  render();
  showToast("Тренировка удалена");
}

async function createExercise(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const name = String(form.get("name") || "").trim();
  const category = String(form.get("category") || "Другое");
  if (!name) return;
  if (state.exercises.some((exercise) => exercise.name.toLocaleLowerCase("ru") === name.toLocaleLowerCase("ru"))) return showToast("Такое упражнение уже есть");
  const exercise = { id: uid("custom"), name, category, custom: true, createdAt: new Date().toISOString() };
  await put("exercises", exercise);
  await refreshData();
  event.currentTarget.reset();
  newExerciseDialog.close();
  if (state.route === "workout") addExerciseToWorkout(exercise.id);
  else { render(); showToast("Упражнение добавлено"); }
}

function latestSetForExercise(exerciseId) {
  for (const workout of state.workouts) {
    const exercise = [...workout.exercises].reverse().find((item) => item.exerciseId === exerciseId);
    if (exercise?.sets.length) return exercise.sets.at(-1);
  }
  return null;
}

async function exportBackup() {
  const backup = {
    app: "Железо",
    version: 1,
    exportedAt: new Date().toISOString(),
    exercises: state.exercises,
    workouts: state.workouts,
    settings: state.settings
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `zhelezo-backup-${localDateKey()}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Резервная копия скачана");
}

async function importBackup(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    if (backup.app !== "Железо" || !Array.isArray(backup.exercises) || !Array.isArray(backup.workouts)) throw new Error("invalid");
    if (!confirm(`Восстановить ${backup.workouts.length} тренировок? Текущие данные будут заменены.`)) return;
    await clear("exercises");
    await clear("workouts");
    await putMany("exercises", backup.exercises);
    await putMany("workouts", backup.workouts);
    state.settings = { restSeconds: 90, ...(backup.settings || {}) };
    saveSettings();
    await refreshData();
    render();
    showToast("Данные восстановлены");
  } catch (error) {
    console.error(error);
    showToast("Не удалось прочитать резервную копию");
  }
}

async function wipeData() {
  if (!confirm("Точно удалить все тренировки и свои упражнения? Сначала сделай резервную копию.")) return;
  if (!confirm("Последнее предупреждение: восстановить данные без копии будет невозможно.")) return;
  await clear("workouts");
  await clear("exercises");
  await putMany("exercises", seedExercises);
  localStorage.removeItem(ACTIVE_KEY);
  state.activeWorkout = null;
  await refreshData();
  render();
  showToast("Все данные удалены");
}

function persistActive() {
  if (state.activeWorkout) localStorage.setItem(ACTIVE_KEY, JSON.stringify(state.activeWorkout));
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

function startTimer(seconds) {
  state.timerEnd = Date.now() + seconds * 1000;
  localStorage.setItem(TIMER_KEY, String(state.timerEnd));
  updateTimer();
}

function adjustTimer(delta) {
  if (!state.timerEnd) return;
  state.timerEnd = Math.max(Date.now(), state.timerEnd + delta * 1000);
  localStorage.setItem(TIMER_KEY, String(state.timerEnd));
  updateTimer();
}

function stopTimer() {
  state.timerEnd = 0;
  localStorage.removeItem(TIMER_KEY);
  timerBar.hidden = true;
}

function updateTimer() {
  if (!state.timerEnd) { timerBar.hidden = true; return; }
  const seconds = Math.max(0, Math.ceil((state.timerEnd - Date.now()) / 1000));
  if (!seconds) {
    stopTimer();
    navigator.vibrate?.([100, 70, 100]);
    showToast("Отдых закончен — следующий подход!");
    return;
  }
  timerBar.hidden = false;
  document.querySelector("#timer-value").textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function updateWorkoutClock() {
  const element = document.querySelector("#workout-clock");
  if (element && state.activeWorkout) element.textContent = elapsed(state.activeWorkout.startedAt);
}

function mostUsedExerciseId() {
  const counts = {};
  state.workouts.forEach((workout) => workout.exercises.forEach((exercise) => { counts[exercise.exerciseId] = (counts[exercise.exerciseId] || 0) + 1; }));
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
}

function setTodayLabel() {
  document.querySelector("#today-label").textContent = new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "short" }).format(new Date()).replaceAll(".", "").toUpperCase();
}

function updateOnlineStatus() {
  document.querySelector("#online-status").textContent = navigator.onLine ? "локальный дневник" : "офлайн · всё работает";
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return "Ночная смена";
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}

function friendlyDate(value) {
  const date = new Date(value);
  const today = localDateKey();
  const yesterday = localDateKey(new Date(Date.now() - 86400000));
  const key = localDateKey(date);
  if (key === today) return "Сегодня";
  if (key === yesterday) return "Вчера";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
}

function elapsed(value) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}` : `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function formatCompact(value) {
  if (value >= 1000000) return `${formatNumber(value / 1000000)}м`;
  if (value >= 1000) return `${formatNumber(value / 1000)}к`;
  return formatNumber(value, 0);
}

function plural(number, one, few, many) {
  const mod10 = number % 10;
  const mod100 = number % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function emptyState(icon, title, text, button, action) {
  return `<div class="empty-state"><div class="empty-state-icon">${icon}</div><h3>${title}</h3><p>${text}</p>${button ? `<button class="button button-secondary" data-action="${action}">${button}</button>` : ""}</div>`;
}

function showToast(message) {
  clearTimeout(toastTimeout);
  toastElement.textContent = message;
  toastElement.classList.add("show");
  toastTimeout = window.setTimeout(() => toastElement.classList.remove("show"), 2400);
}

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; }
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try { await navigator.serviceWorker.register("./sw.js"); } catch (error) { console.warn("Service worker registration failed", error); }
}
