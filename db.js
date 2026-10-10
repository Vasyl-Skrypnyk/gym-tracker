const DB_NAME = "zhelezo-workouts";
const DB_VERSION = 2;

const seedExercises = [
  ["Жим штанги лёжа", "Грудь"],
  ["Жим гантелей на наклонной", "Грудь"],
  ["Сведение рук в кроссовере", "Грудь"],
  ["Подтягивания", "Спина"],
  ["Тяга верхнего блока", "Спина"],
  ["Тяга горизонтального блока", "Спина"],
  ["Тяга штанги в наклоне", "Спина"],
  ["Становая тяга", "Спина"],
  ["Приседания со штангой", "Ноги"],
  ["Жим ногами", "Ноги"],
  ["Румынская тяга", "Ноги"],
  ["Разгибание ног", "Ноги"],
  ["Сгибание ног", "Ноги"],
  ["Подъёмы на носки", "Ноги"],
  ["Армейский жим", "Плечи"],
  ["Махи гантелями в стороны", "Плечи"],
  ["Обратная бабочка", "Плечи"],
  ["Подъём штанги на бицепс", "Руки"],
  ["Молотковые сгибания", "Руки"],
  ["Французский жим", "Руки"],
  ["Разгибание рук на блоке", "Руки"],
  ["Скручивания", "Кор"],
  ["Планка", "Кор"]
].map(([name, category], index) => ({
  id: `seed-${index + 1}`,
  name,
  category,
  custom: false,
  createdAt: "2026-01-01T00:00:00.000Z"
}));

let database;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function openDatabase() {
  if (database) return database;

  database = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("exercises")) {
        const store = db.createObjectStore("exercises", { keyPath: "id" });
        store.createIndex("category", "category");
      }
      if (!db.objectStoreNames.contains("workouts")) {
        const store = db.createObjectStore("workouts", { keyPath: "id" });
        store.createIndex("date", "date");
      }
      if (!db.objectStoreNames.contains("programs")) {
        db.createObjectStore("programs", { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  const existing = await getAll("exercises");
  if (!existing.length) await putMany("exercises", seedExercises);
  return database;
}

export async function getAll(storeName) {
  await openDatabaseIfNeeded();
  const transaction = database.transaction(storeName, "readonly");
  return requestToPromise(transaction.objectStore(storeName).getAll());
}

export async function put(storeName, value) {
  await openDatabaseIfNeeded();
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(value);
  await transactionDone(transaction);
  return value;
}

export async function putMany(storeName, values) {
  await openDatabaseIfNeeded();
  const transaction = database.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  values.forEach((value) => store.put(value));
  await transactionDone(transaction);
}

export async function remove(storeName, key) {
  await openDatabaseIfNeeded();
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).delete(key);
  await transactionDone(transaction);
}

export async function clear(storeName) {
  await openDatabaseIfNeeded();
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).clear();
  await transactionDone(transaction);
}

async function openDatabaseIfNeeded() {
  if (!database) await openDatabase();
}

export { seedExercises };
