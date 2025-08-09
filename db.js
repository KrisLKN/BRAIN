/* =========================================================
   Second Cerveau OS -- db.js
   IndexedDB propre + compatible avec app.js (final)
   API: DB.addItem(store, value) / DB.getAll(store)
        DB.putItem(store, value)  / DB.deleteItem(store, id)
========================================================= */

(function () {
  const DB_NAME = "second_cerveau_os";
  // ↑ Incrémente la version si tu ajoutes/renommes des stores
  const DB_VERSION = 2;

  // ⚠️ Liste des stores alignée avec app.js
  const STORES = [
    "journal",
    "tasks",
    "habits",
    "metrics",
    "mood",
    "goals",
    "resources",
    "files",
    "nutrition",
    "focusSessions"
  ];

  // -- Open / upgrade --------------------------------------------------------
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = req.result;

        // Crée les stores manquants (id auto-incrémenté + index date)
        STORES.forEach((name) => {
          if (!db.objectStoreNames.contains(name)) {
            const os = db.createObjectStore(name, { keyPath: "id", autoIncrement: true });
            try { os.createIndex("by_date", "date"); } catch (_) {}
          }
        });

        // Exemple de migrations si besoin (selon ancienne version)
        // const oldV = e.oldVersion;
        // if (oldV < 2) { /* actions de migration */ }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // -- Helpers TX ------------------------------------------------------------
  function txWrap(db, store, mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const os = tx.objectStore(store);
      let result;
      try {
        result = fn(os);
      } catch (err) {
        reject(err);
        return;
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
    });
  }

  // -- CRUD ------------------------------------------------------------------
  async function addItem(store, value) {
    const db = await openDB();
    // Ajoute une date si absente (utile pour l’index)
    if (value && typeof value === "object" && value.date == null) {
      // pour des objets « journaliers » type mood/nutrition, on peut avoir date string
      value.date = value.date || Date.now();
    }
    return txWrap(db, store, "readwrite", (os) => os.add(value));
  }

  async function getAll(store) {
    const db = await openDB();
    return txWrap(db, store, "readonly", (os) => os.getAll());
  }

  async function putItem(store, value) {
    const db = await openDB();
    if (!value || value.id == null) throw new Error("putItem: value.id manquant");
    return txWrap(db, store, "readwrite", (os) => os.put(value));
  }

  async function deleteItem(store, id) {
    const db = await openDB();
    return txWrap(db, store, "readwrite", (os) => os.delete(id));
  }

  // -- Extras pratiques (optionnels) ----------------------------------------
  async function clearStore(store) {
    const db = await openDB();
    return txWrap(db, store, "readwrite", (os) => os.clear());
  }

  async function exportAll() {
    const db = await openDB();
    const out = {};
    for (const s of STORES) {
      /* eslint-disable no-await-in-loop */
      out[s] = await txWrap(db, s, "readonly", (os) => os.getAll());
    }
    return out;
  }

  async function importAll(payload, { wipe = false } = {}) {
    const db = await openDB();
    for (const s of Object.keys(payload || {})) {
      if (!STORES.includes(s)) continue;
      const items = payload[s] || [];
      /* eslint-disable no-await-in-loop */
      if (wipe) await txWrap(db, s, "readwrite", (os) => os.clear());
      for (const it of items) {
        // si l’objet vient d’un export, il peut déjà avoir un id → on force put
        await txWrap(db, s, "readwrite", (os) => os.put(it));
      }
    }
    return true;
  }

  // -- Expose ---------------------------------------------------------------
  window.DB = {
    addItem,
    getAll,
    putItem,
    deleteItem,
    clearStore,   // optionnel
    exportAll,    // optionnel (pour backup JSON)
    importAll     // optionnel (pour restore JSON)
  };
})();