import test from "node:test";
import assert from "node:assert/strict";
import { workoutVolume, durationMinutes, exerciseProgress, weeklyStats, localDateKey } from "../utils.js";

const sample = {
  id: "w1",
  date: "2026-10-10T10:00:00.000Z",
  startedAt: "2026-10-10T10:00:00.000Z",
  endedAt: "2026-10-10T11:00:00.000Z",
  exercises: [{
    exerciseId: "bench",
    name: "Жим",
    sets: [
      { weight: 80, reps: 8 },
      { weight: 85, reps: 5 }
    ]
  }]
};

test("считает тренировочный объём", () => {
  assert.equal(workoutVolume(sample), 1065);
});

test("считает продолжительность", () => {
  assert.equal(durationMinutes(sample), 60);
});

test("строит показатели упражнения", () => {
  const [point] = exerciseProgress([sample], "bench");
  assert.equal(point.bestWeight, 85);
  assert.equal(point.bestReps, 8);
  assert.equal(point.volume, 1065);
  assert.ok(point.estimatedOneRepMax > 99);
});

test("считает статистику текущей недели", () => {
  const stats = weeklyStats([sample], new Date("2026-10-10T18:00:00.000Z"));
  assert.deepEqual(stats, { count: 1, volume: 1065, sets: 2 });
});

test("форматирует локальную дату ключом", () => {
  const date = new Date(2026, 9, 3, 23, 30);
  assert.equal(localDateKey(date), "2026-10-03");
});
