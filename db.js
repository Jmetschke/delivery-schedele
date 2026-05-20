const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const dbPath = process.env.DELIVERY_DB_PATH
  ? path.resolve(process.env.DELIVERY_DB_PATH)
  : path.join(process.env.DELIVERY_DATA_DIR || path.join(__dirname, "data"), "delivery-calendar.sqlite");
const dataDir = path.dirname(dbPath);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

console.log(`Using delivery database at ${dbPath}`);
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store TEXT NOT NULL,
      dispensary_location TEXT,
      dispensary_address TEXT,
      companies_delivering TEXT,
      delivery_company TEXT,
      border_store TEXT,
      needs_display TEXT,
      date_order_received TEXT,
      product_type TEXT,
      delivery_type TEXT,
      delivery_date TEXT,
      pickup_time TEXT,
      delivery_time TEXT,
      drivers TEXT,
      driver_id_number TEXT,
      van TEXT,
      status TEXT DEFAULT 'Not Started',
      notes TEXT DEFAULT '',
      source_sheet TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(store, delivery_date, delivery_time, drivers)
    )
  `);

  db.all("PRAGMA table_info(deliveries)", (err, columns) => {
    if (err) {
      console.error(err);
      return;
    }

    const existingColumns = new Set(columns.map((column) => column.name));
    const additions = [
      ["dispensary_location", "TEXT"],
      ["dispensary_address", "TEXT"],
      ["companies_delivering", "TEXT"],
      ["delivery_company", "TEXT"],
      ["driver_id_number", "TEXT"]
    ];

    additions.forEach(([name, type]) => {
      if (!existingColumns.has(name)) {
        db.run(`ALTER TABLE deliveries ADD COLUMN ${name} ${type}`);
      }
    });
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS delivery_checklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      delivery_id INTEGER NOT NULL,
      item_key TEXT NOT NULL,
      label TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      raw_value TEXT,
      FOREIGN KEY(delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE,
      UNIQUE(delivery_id, item_key)
    )
  `);
});

module.exports = db;
