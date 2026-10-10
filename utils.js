export function uid(prefix = "id") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function workoutVolume(workout) {
  return workout.exercises.reduce((total, exercise) => total + exercise.sets.reduce((sum, set) => {
    const weight = Number(set.weight) || 0;
    const reps = Number(set.reps) || 0;
    return sum + weight * reps;
  }, 0), 0);
}

export function formatNumber(value, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits }).format(value || 0);
}

export function durationMinutes(workout) {
  const start = new Date(workout.startedAt).getTime();
  const end = new Date(workout.endedAt || workout.startedAt).getTime();
  return Math.max(1, Math.round((end - start) / 60000));
}

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function exerciseProgress(workouts, exerciseId) {
  return workouts
    .filter((workout) => workout.exercises.some((exercise) => exercise.exerciseId === exerciseId))
    .map((workout) => {
      const blocks = workout.exercises.filter((exercise) => exercise.exerciseId === exerciseId);
      const sets = blocks.flatMap((block) => block.sets).filter((set) => Number(set.reps) > 0);
      const bestWeight = Math.max(0, ...sets.map((set) => Number(set.weight) || 0));
      const bestReps = Math.max(0, ...sets.map((set) => Number(set.reps) || 0));
      const volume = sets.reduce((sum, set) => sum + (Number(set.weight) || 0) * (Number(set.reps) || 0), 0);
      const estimatedOneRepMax = Math.max(0, ...sets.map((set) => {
        const weight = Number(set.weight) || 0;
        const reps = Number(set.reps) || 0;
        return weight * (1 + reps / 30);
      }));
      return { date: workout.date, bestWeight, bestReps, volume, estimatedOneRepMax };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function weeklyStats(workouts, now = new Date()) {
  const start = new Date(now);
  const weekday = (start.getDay() + 6) % 7;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - weekday);
  const current = workouts.filter((workout) => new Date(workout.date) >= start);
  return {
    count: current.length,
    volume: current.reduce((sum, workout) => sum + workoutVolume(workout), 0),
    sets: current.reduce((sum, workout) => sum + workout.exercises.reduce((subtotal, exercise) => subtotal + exercise.sets.length, 0), 0)
  };
}
