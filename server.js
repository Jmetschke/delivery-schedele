const express = require("express");
const path = require("path");
const multer = require("multer");
const XLSX = require("xlsx");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({ dest: path.join(__dirname, "uploads") });

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const DRIVER_ID_BY_NAME = {
  "Adriana Santacruz": "trag10001537",
  "Chloe Stockholm": "Stockholm0056",
  "Eduardo Ibarra": "TRAG10000874",
  "Hector Ochoa": "TRAG10001408",
  "Jason Litwin": "TRAG10001271",
  "John Tinsley": "001",
  "Jorge Galvez": "TRAG100010091",
  "Joselyn Cervantes": "TRAG10001437",
  "Julia Johnson": "002",
  "Karina Cervantez": "TRAG10001042",
  "Lamarr Collins": "TRAG10000914",
  "Lily Knightly": "008",
  "Magdalena Rodriguez": "TRAG10001486",
  "Paul Johnson": "009",
  "Richard Paull": "TRAG10001512",
  "STEVE GARZA": "TRAC10000166",
  "TED STEINBRECHER": "TRAG10001542"
};

const LICENSE_PLATE_BY_VAN = {
  "Audi SQ5": "EB63835",
  "Dodge Ram Promaster 3500": "197 361C",
  "Ford Escape": "EZ65313",
  "Ford Transit Connect": "2992940B",
  "GMC Savanah": "3703270",
  "Hyundai Santa Fe": "DB53579",
  "Toyota Corolla": "EL90538"
};

const CHECKLIST_COLUMNS = [
  {
    key: "order_folder_dropbox",
    label: "Order folder + grid in Dropbox",
    spreadsheetHeader: "ORDER FOLDER + GRID IN DROPBOX?"
  },
  {
    key: "order_split_metrc",
    label: "Order split in METRC",
    spreadsheetHeader: "ORDER SPLIT IN METRC?"
  },
  {
    key: "exit_labels_made",
    label: "Exit labels made",
    spreadsheetHeader: "EXIT LABELS MADE? PRINTED?"
  },
  {
    key: "exit_labels_printed",
    label: "Exit labels printed",
    spreadsheetHeader: "EXIT LABELS MADE? PRINTED?"
  },
  {
    key: "sb_labels_printed",
    label: "SB labels printed",
    spreadsheetHeader: "SB LABELS PRINTED?       APPLIED?"
  },
  {
    key: "sb_labels_applied",
    label: "SB labels applied",
    spreadsheetHeader: "SB LABELS PRINTED?       APPLIED?"
  },
  {
    key: "picked_packed",
    label: "Picked + packed",
    spreadsheetHeader: "PICKED + PACKED?"
  },
  {
    key: "products_labeled",
    label: "Products labeled",
    spreadsheetHeader: "PRODUCTS LABELED?"
  },
  {
    key: "manifest_created",
    label: "Manifest created",
    spreadsheetHeader: "MANIFEST CREATED + PRINTED?"
  },
  {
    key: "manifest_printed",
    label: "Manifest printed",
    spreadsheetHeader: "MANIFEST CREATED + PRINTED?"
  },
  {
    key: "tote_sealed",
    label: "Tote sealed",
    spreadsheetHeader: "TOTE SEALED?"
  },
  {
    key: "delivery_confirmed",
    label: "Delivery confirmed",
    spreadsheetHeader: "DELIVERY CONFIRMED?"
  }
];

function normalizeHeader(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normalizeCell(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function excelDateToISO(value) {
  if (!value) return "";

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    // Excel serial date. SheetJS date origin is 1899-12-30.
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return date.toISOString().slice(0, 10);
  }

  const text = String(value).trim();
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return text;
}

function isCompletedChecklistValue(value) {
  const text = normalizeCell(value).toUpperCase();
  if (!text) return 0;
  if (["N", "NO", "NA", "N/A"].includes(text)) return 0;
  if (text.includes("Y")) return 1;
  if (text === "DONE" || text === "COMPLETE" || text === "COMPLETED") return 1;
  return 0;
}

function getValue(row, headerMap, headerName) {
  const index = headerMap[normalizeHeader(headerName)];
  return index === undefined ? "" : row[index];
}

function getFirstValue(row, headerMap, headerNames) {
  for (const headerName of headerNames) {
    const value = getValue(row, headerMap, headerName);
    if (normalizeCell(value)) return value;
  }

  return "";
}

function findMappedValue(value, mapping) {
  const text = normalizeCell(value);
  if (!text) return "";

  const normalized = text.toUpperCase();
  const key = Object.keys(mapping).find((name) => name.toUpperCase() === normalized);
  return key ? mapping[key] : "";
}

function normalizeMappedName(value, mapping) {
  const text = normalizeCell(value);
  if (!text) return "";

  const normalized = text.toUpperCase();
  return Object.keys(mapping).find((name) => name.toUpperCase() === normalized) || text;
}

function companiesFromSpreadsheet(value) {
  const text = normalizeCell(value).toUpperCase();
  const companies = [];

  if (text.includes("H")) companies.push("Hijnx");
  if (text.includes("S")) companies.push("SB");
  if (text.includes("P")) companies.push("PG");

  return companies.join(", ");
}

function shouldSkipSpreadsheetStore(store) {
  const normalized = normalizeCell(store).toUpperCase();
  return !normalized || normalized.startsWith("PAGE") || normalized === "PROCESSING PHASE 1" || normalized === "DELIVERY DATE";
}

function spreadsheetDeliveryKey(delivery) {
  const store = normalizeCell(delivery.store).toUpperCase();
  const deliveryDate = normalizeCell(delivery.delivery_date);

  if (deliveryDate) return `${store}|${deliveryDate}`;

  return [
    store,
    deliveryDate,
    normalizeCell(delivery.delivery_time)
  ].join("|");
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function callback(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function selectedCompanies(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((company) => company.trim().toUpperCase())
      .filter(Boolean)
  );
}

function isChecklistItemActive(itemKey, companiesDelivering) {
  if (!["sb_labels_printed", "sb_labels_applied"].includes(itemKey)) return true;
  return selectedCompanies(companiesDelivering).has("SB");
}

function hasValue(value) {
  return String(value || "").trim().length > 0;
}

function hasRequiredDeliveryFields(delivery) {
  return [
    delivery.store,
    delivery.companies_delivering,
    delivery.delivery_company,
    delivery.drivers,
    delivery.van
  ].every(hasValue);
}

function statusForRequiredFields(delivery) {
  return hasRequiredDeliveryFields(delivery) ? "Completed" : "Not Started";
}

async function updateDeliveryStatusFromChecklist(deliveryId) {
  const delivery = await get("SELECT * FROM deliveries WHERE id = ?", [deliveryId]);

  if (!delivery) return null;

  const checklistItems = await all(
    "SELECT item_key, completed FROM delivery_checklist WHERE delivery_id = ?",
    [deliveryId]
  );
  const activeItems = checklistItems.filter((item) =>
    isChecklistItemActive(item.item_key, delivery.companies_delivering)
  );
  const totalCount = activeItems.length;
  const completedCount = activeItems.filter((item) => item.completed).length;
  const checklistComplete = totalCount > 0 && completedCount === totalCount;
  const requiredFieldsComplete = hasRequiredDeliveryFields(delivery);
  const status =
    checklistComplete && requiredFieldsComplete
      ? "Completed"
      : completedCount > 0 || checklistComplete
        ? "In Progress"
        : "Not Started";
  const deliveredClause =
    status === "Completed"
      ? ", delivered = 1, delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP)"
      : "";

  await run(
    `UPDATE deliveries SET status = ?${deliveredClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [status, deliveryId]
  );

  return {
    status,
    total_count: totalCount,
    completed_count: completedCount,
    required_fields_complete: requiredFieldsComplete
  };
}

async function ensureChecklistRows(deliveryId) {
  for (const item of CHECKLIST_COLUMNS) {
    await run(
      `
        INSERT INTO delivery_checklist (delivery_id, item_key, label, completed, raw_value)
        VALUES (?, ?, ?, 0, '')
        ON CONFLICT(delivery_id, item_key) DO NOTHING
      `,
      [deliveryId, item.key, item.label]
    );
  }
}

async function insertOrUpdateDelivery(delivery, checklistItems = []) {
  const hasDeliveryDate = hasValue(delivery.delivery_date);
  const existingDeliveries = hasDeliveryDate
    ? await all(
        `
          SELECT id FROM deliveries
          WHERE store = ? AND delivery_date = ?
          ORDER BY id
        `,
        [delivery.store, delivery.delivery_date]
      )
    : await all(
        `
          SELECT id FROM deliveries
          WHERE store = ? AND delivery_date = ? AND delivery_time = ?
          ORDER BY id
        `,
        [delivery.store, delivery.delivery_date, delivery.delivery_time]
      );

  let deliveryId;

  if (existingDeliveries.length) {
    deliveryId = existingDeliveries[0].id;
    const duplicateIds = existingDeliveries.slice(1).map((row) => row.id);

    if (duplicateIds.length) {
      const placeholders = duplicateIds.map(() => "?").join(",");
      await run(`DELETE FROM delivery_checklist WHERE delivery_id IN (${placeholders})`, duplicateIds);
      await run(`DELETE FROM deliveries WHERE id IN (${placeholders})`, duplicateIds);
    }

    await run(
      `
        UPDATE deliveries
        SET dispensary_location = ?, dispensary_address = ?, companies_delivering = ?,
            delivery_company = ?, border_store = ?, needs_display = ?, date_order_received = ?,
            product_type = ?, delivery_type = ?, delivery_date = ?, delivery_time = ?,
            pickup_time = ?, drivers = ?,
            driver_id_number = ?, van = ?, license_plate = ?, status = ?,
            source_sheet = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        delivery.dispensary_location,
        delivery.dispensary_address,
        delivery.companies_delivering,
        delivery.delivery_company,
        delivery.border_store,
        delivery.needs_display,
        delivery.date_order_received,
        delivery.product_type,
        delivery.delivery_type,
        delivery.delivery_date,
        delivery.delivery_time,
        delivery.pickup_time,
        delivery.drivers,
        delivery.driver_id_number,
        delivery.van,
        delivery.license_plate,
        statusForRequiredFields(delivery),
        delivery.source_sheet,
        deliveryId
      ]
    );

  } else {
    const result = await run(
      `
        INSERT INTO deliveries (
          store, dispensary_location, dispensary_address, companies_delivering,
          delivery_company, border_store, needs_display, date_order_received,
          product_type, delivery_type, delivery_date, pickup_time,
          delivery_time, drivers, driver_id_number, van, license_plate, status, source_sheet
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        delivery.store,
        delivery.dispensary_location,
        delivery.dispensary_address,
        delivery.companies_delivering,
        delivery.delivery_company,
        delivery.border_store,
        delivery.needs_display,
        delivery.date_order_received,
        delivery.product_type,
        delivery.delivery_type,
        delivery.delivery_date,
        delivery.pickup_time,
        delivery.delivery_time,
        delivery.drivers,
        delivery.driver_id_number,
        delivery.van,
        delivery.license_plate,
        statusForRequiredFields(delivery),
        delivery.source_sheet
      ]
    );
    deliveryId = result.lastID;
  }

  await ensureChecklistRows(deliveryId);

  for (const item of checklistItems) {
    await run(
      `
        INSERT INTO delivery_checklist (delivery_id, item_key, label, completed, raw_value)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(delivery_id, item_key)
        DO UPDATE SET completed = excluded.completed, raw_value = excluded.raw_value
      `,
      [deliveryId, item.key, item.label, item.completed, item.raw_value]
    );
  }

  return deliveryId;
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "Delivery Calendar app is running" });
});

async function syncChecklistDefinitions() {
  const deliveries = await all("SELECT id FROM deliveries");

  for (const delivery of deliveries) {
    const oldExitLabels = await get(
      "SELECT completed, raw_value FROM delivery_checklist WHERE delivery_id = ? AND item_key = 'exit_labels'",
      [delivery.id]
    );
    const oldSbLabels = await get(
      "SELECT completed, raw_value FROM delivery_checklist WHERE delivery_id = ? AND item_key = 'sb_labels'",
      [delivery.id]
    );
    const oldManifest = await get(
      "SELECT completed, raw_value FROM delivery_checklist WHERE delivery_id = ? AND item_key = 'manifest_created'",
      [delivery.id]
    );
    const existingManifestPrinted = await get(
      "SELECT id FROM delivery_checklist WHERE delivery_id = ? AND item_key = 'manifest_printed'",
      [delivery.id]
    );

    for (const item of CHECKLIST_COLUMNS) {
      const completed =
        oldManifest &&
        item.key === "manifest_printed" &&
        !existingManifestPrinted
          ? oldManifest.completed
          : oldExitLabels && ["exit_labels_made", "exit_labels_printed"].includes(item.key)
          ? oldExitLabels.completed
          : oldSbLabels && ["sb_labels_printed", "sb_labels_applied"].includes(item.key)
            ? oldSbLabels.completed
          : 0;
      const rawValue =
        oldManifest &&
        item.key === "manifest_printed" &&
        !existingManifestPrinted
          ? oldManifest.raw_value
          : oldExitLabels && ["exit_labels_made", "exit_labels_printed"].includes(item.key)
          ? oldExitLabels.raw_value
          : oldSbLabels && ["sb_labels_printed", "sb_labels_applied"].includes(item.key)
            ? oldSbLabels.raw_value
          : "";

      await run(
        `
          INSERT INTO delivery_checklist (delivery_id, item_key, label, completed, raw_value)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(delivery_id, item_key)
          DO UPDATE SET label = excluded.label
        `,
        [delivery.id, item.key, item.label, completed, rawValue]
      );
    }

    await run("DELETE FROM delivery_checklist WHERE delivery_id = ? AND item_key = 'exit_labels'", [
      delivery.id
    ]);
    await run("DELETE FROM delivery_checklist WHERE delivery_id = ? AND item_key = 'sb_labels'", [
      delivery.id
    ]);
    await run(
      "DELETE FROM delivery_checklist WHERE delivery_id = ? AND item_key = 'folder_manifest_invoice'",
      [delivery.id]
    );
  }
}

app.get("/api/deliveries", async (req, res) => {
  try {
    const { date, status, driver, delivered } = req.query;

    const filters = [];
    const params = [];

    if (date) {
      filters.push("delivery_date = ?");
      params.push(date);
    }

    if (status) {
      filters.push("status = ?");
      params.push(status);
    }

    if (driver) {
      filters.push("drivers LIKE ?");
      params.push(`%${driver}%`);
    }

    if (delivered !== undefined) {
      filters.push("COALESCE(delivered, 0) = ?");
      params.push(delivered === "1" || delivered === "true" ? 1 : 0);
    } else {
      filters.push("COALESCE(delivered, 0) = 0");
    }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const rows = await all(
      `
        SELECT * FROM deliveries
        ${where}
        ORDER BY
          CASE WHEN delivery_date IS NULL OR delivery_date = '' THEN 1 ELSE 0 END,
          delivery_date,
          delivery_time,
          store
      `,
      params
    );

    if (!rows.length) {
      return res.json([]);
    }

    const placeholders = rows.map(() => "?").join(",");
    const checklistRows = await all(
      `
        SELECT delivery_id, item_key, label, completed
        FROM delivery_checklist
        WHERE delivery_id IN (${placeholders})
        ORDER BY id
      `,
      rows.map((row) => row.id)
    );

    const checklistByDelivery = checklistRows.reduce((grouped, item) => {
      if (!grouped[item.delivery_id]) grouped[item.delivery_id] = [];
      grouped[item.delivery_id].push(item);
      return grouped;
    }, {});

    res.json(
      rows.map((row) => ({
        ...row,
        checklist: checklistByDelivery[row.id] || []
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to load deliveries" });
  }
});

app.get("/api/calendar-events", async (req, res) => {
  try {
    const rows = await all(
      `
        SELECT id, store, delivery_date, pickup_time, delivery_time,
               delivery_company, drivers, van, companies_delivering, status,
               delivered, order_ready_to_ship
        FROM deliveries
        WHERE delivery_date IS NOT NULL AND delivery_date != ''
          AND delivery_time IS NOT NULL AND delivery_time != ''
        ORDER BY delivery_date, delivery_time
      `
    );

    function calendarTitle(row) {
      const parts = [
        row.pickup_time ? `PU ${row.pickup_time}` : "",
        row.delivery_time ? `DEL ${row.delivery_time}` : "",
        row.store,
        row.delivery_company ? `Company: ${row.delivery_company}` : "",
        row.drivers ? `Driver: ${row.drivers}` : "",
        row.van ? `Van: ${row.van}` : ""
      ].filter(Boolean);

      return parts.join(" | ");
    }

    const events = rows.map((row) => ({
      id: String(row.id),
      title: calendarTitle(row),
      start: row.delivery_date,
      extendedProps: {
        store: row.store,
        pickup_time: row.pickup_time,
        delivery_time: row.delivery_time,
        delivery_company: row.delivery_company,
        drivers: row.drivers,
        van: row.van,
        companies_delivering: row.companies_delivering,
        status: row.status,
        delivered: row.delivered,
        order_ready_to_ship: row.order_ready_to_ship
      }
    }));

    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to load calendar events" });
  }
});

app.get("/api/deliveries/:id", async (req, res) => {
  try {
    const delivery = await get("SELECT * FROM deliveries WHERE id = ?", [req.params.id]);

    if (!delivery) {
      return res.status(404).json({ error: "Delivery not found" });
    }

    const checklist = await all(
      "SELECT * FROM delivery_checklist WHERE delivery_id = ? ORDER BY id",
      [req.params.id]
    );

    res.json({ delivery, checklist });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to load delivery" });
  }
});

app.post("/api/deliveries", async (req, res) => {
  try {
    const {
      store,
      dispensary_location,
      dispensary_address,
      companies_delivering,
      delivery_company,
      drivers,
      driver_id_number,
      van,
      license_plate,
      border_store,
      needs_display,
      date_order_received,
      delivery_date,
      delivery_time,
      pickup_time
    } = req.body;

    if (!store) {
      return res.status(400).json({ error: "Dispensary name is required" });
    }

    const delivery = {
      store,
      dispensary_location,
      dispensary_address,
      companies_delivering,
      delivery_company,
      drivers,
      van
    };
    const status = statusForRequiredFields(delivery);

    const result = await run(
      `
        INSERT INTO deliveries (
          store, dispensary_location, dispensary_address, companies_delivering,
          delivery_company, drivers, driver_id_number, van, license_plate, border_store, needs_display,
          date_order_received, delivery_date, delivery_time, pickup_time, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        store,
        dispensary_location,
        dispensary_address,
        companies_delivering,
        delivery_company,
        drivers,
        driver_id_number,
        van,
        license_plate,
        border_store,
        needs_display,
        date_order_received,
        delivery_date,
        delivery_time,
        pickup_time,
        status
      ]
    );

    for (const item of CHECKLIST_COLUMNS) {
      await run(
        `
          INSERT INTO delivery_checklist (delivery_id, item_key, label, completed, raw_value)
          VALUES (?, ?, ?, 0, '')
        `,
        [result.lastID, item.key, item.label]
      );
    }

    res.status(201).json({ ok: true, id: result.lastID });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to create delivery" });
  }
});

app.patch("/api/deliveries/:id", async (req, res) => {
  try {
    const {
      store,
      dispensary_location,
      dispensary_address,
      companies_delivering,
      delivery_company,
      border_store,
      needs_display,
      date_order_received,
      product_type = "",
      delivery_type = "",
      delivery_date,
      pickup_time = "",
      delivery_time,
      drivers = "",
      driver_id_number = "",
      van = "",
      license_plate = "",
      notes
    } = req.body;

    const status = statusForRequiredFields({
      store,
      companies_delivering,
      delivery_company,
      drivers,
      van
    });

    await run(
      `
        UPDATE deliveries
        SET store = ?, dispensary_location = ?, dispensary_address = ?,
            companies_delivering = ?, delivery_company = ?, border_store = ?,
            needs_display = ?, date_order_received = ?,
            product_type = ?, delivery_type = ?, delivery_date = ?, pickup_time = ?,
            delivery_time = ?, drivers = ?, driver_id_number = ?, van = ?, license_plate = ?,
            status = ?, notes = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        store,
        dispensary_location,
        dispensary_address,
        companies_delivering,
        delivery_company,
        border_store,
        needs_display,
        date_order_received,
        product_type,
        delivery_type,
        delivery_date,
        pickup_time,
        delivery_time,
        drivers,
        driver_id_number,
        van,
        license_plate,
        status,
        notes,
        req.params.id
      ]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to save delivery" });
  }
});

app.patch("/api/deliveries/:id/delivered", async (req, res) => {
  try {
    const delivered = req.body.delivered ? 1 : 0;
    const delivery = await get("SELECT id FROM deliveries WHERE id = ?", [req.params.id]);

    if (!delivery) {
      return res.status(404).json({ error: "Delivery not found" });
    }

    await run(
      `
        UPDATE deliveries
        SET delivered = ?, delivered_at = ${delivered ? "CURRENT_TIMESTAMP" : "NULL"},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [delivered, req.params.id]
    );

    res.json({ ok: true, delivered: Boolean(delivered) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to save delivery status" });
  }
});

app.patch("/api/deliveries/:id/order-ready", async (req, res) => {
  try {
    const orderReady = req.body.order_ready_to_ship ? 1 : 0;
    const delivery = await get("SELECT id FROM deliveries WHERE id = ?", [req.params.id]);

    if (!delivery) {
      return res.status(404).json({ error: "Delivery not found" });
    }

    await run(
      `
        UPDATE deliveries
        SET order_ready_to_ship = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [orderReady, req.params.id]
    );

    res.json({ ok: true, order_ready_to_ship: Boolean(orderReady) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to save order ready status" });
  }
});

app.delete("/api/deliveries/:id", async (req, res) => {
  try {
    const delivery = await get("SELECT id FROM deliveries WHERE id = ?", [req.params.id]);

    if (!delivery) {
      return res.status(404).json({ error: "Delivery not found" });
    }

    await run("DELETE FROM delivery_checklist WHERE delivery_id = ?", [req.params.id]);
    await run("DELETE FROM deliveries WHERE id = ?", [req.params.id]);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to delete delivery" });
  }
});

app.patch("/api/checklist/:id", async (req, res) => {
  try {
    const completed = req.body.completed ? 1 : 0;
    const checklistItem = await get("SELECT delivery_id FROM delivery_checklist WHERE id = ?", [
      req.params.id
    ]);

    if (!checklistItem) {
      return res.status(404).json({ error: "Checklist item not found" });
    }

    await run("UPDATE delivery_checklist SET completed = ? WHERE id = ?", [
      completed,
      req.params.id
    ]);

    const checklistStatus = await updateDeliveryStatusFromChecklist(checklistItem.delivery_id);

    res.json({
      ok: true,
      delivery_id: checklistItem.delivery_id,
      status: checklistStatus.status,
      total_count: checklistStatus.total_count,
      completed_count: checklistStatus.completed_count
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to save checklist item" });
  }
});

app.patch("/api/deliveries/:id/checklist/check-all", async (req, res) => {
  try {
    const delivery = await get("SELECT * FROM deliveries WHERE id = ?", [req.params.id]);

    if (!delivery) {
      return res.status(404).json({ error: "Delivery not found" });
    }

    const checklistItems = await all(
      "SELECT id, item_key FROM delivery_checklist WHERE delivery_id = ?",
      [req.params.id]
    );
    const activeIds = checklistItems
      .filter((item) => isChecklistItemActive(item.item_key, delivery.companies_delivering))
      .map((item) => item.id);

    if (activeIds.length) {
      const placeholders = activeIds.map(() => "?").join(",");
      await run(
        `UPDATE delivery_checklist SET completed = 1 WHERE delivery_id = ? AND id IN (${placeholders})`,
        [req.params.id, ...activeIds]
      );
    }

    const checklistStatus = await updateDeliveryStatusFromChecklist(req.params.id);

    res.json({
      ok: true,
      delivery_id: Number(req.params.id),
      status: checklistStatus.status,
      total_count: checklistStatus.total_count,
      completed_count: checklistStatus.completed_count
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to save checklist items" });
  }
});

app.post("/api/import", upload.single("schedule"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No spreadsheet uploaded" });
    }

    const workbook = XLSX.readFile(req.file.path, { cellDates: true });
    const sheetName =
      workbook.SheetNames.find((name) => name.toUpperCase() === "ORDERS TO DELIVER") ||
      workbook.SheetNames[0];

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    // Your spreadsheet has section rows first, then headers on row 3.
    const headerRowIndex = rows.findIndex((row) =>
      row.some((cell) => normalizeHeader(cell) === "STORE")
    );

    if (headerRowIndex === -1) {
      return res.status(400).json({ error: "Could not find the STORE header row" });
    }

    const headers = rows[headerRowIndex];
    const headerMap = {};
    headers.forEach((header, index) => {
      const key = normalizeHeader(header);
      if (key) headerMap[key] = index;
    });

    let imported = 0;
    let skipped = 0;

    const spreadsheetDeliveries = new Map();

    for (const row of rows.slice(headerRowIndex + 1)) {
      const store = normalizeCell(getValue(row, headerMap, "STORE"));

      if (shouldSkipSpreadsheetStore(store)) {
        skipped += 1;
        continue;
      }

      const companyCodes = getFirstValue(row, headerMap, [
        "Hijnx/Pheotera/Snackbar",
        "Hijnx/ Pheotera/ Snackbar",
        "Hijnx/ Pheotera/ Snackbar "
      ]);
      const drivers = normalizeMappedName(getValue(row, headerMap, "DRIVERS"), DRIVER_ID_BY_NAME);
      const van = normalizeMappedName(getValue(row, headerMap, "VAN"), LICENSE_PLATE_BY_VAN);

      const delivery = {
        store,
        dispensary_location: "",
        dispensary_address: "",
        companies_delivering: companiesFromSpreadsheet(companyCodes),
        border_store: normalizeCell(getValue(row, headerMap, "Border Store")),
        needs_display: normalizeCell(getValue(row, headerMap, "NEEDS DISPLAY")),
        date_order_received: excelDateToISO(getValue(row, headerMap, "DATE ORDER RECEIVED")),
        product_type: normalizeCell(companyCodes),
        delivery_company: normalizeCell(getFirstValue(row, headerMap, [
          "EO Deliveries or Other",
          "EO DELIVERY OR OTHER?"
        ])),
        delivery_type: normalizeCell(getFirstValue(row, headerMap, [
          "EO Deliveries or Other",
          "EO DELIVERY OR OTHER?"
        ])),
        delivery_date: excelDateToISO(getValue(row, headerMap, "DELIVERY DATE")),
        pickup_time: normalizeCell(getValue(row, headerMap, "PICK-UP TIME")),
        delivery_time: normalizeCell(getValue(row, headerMap, "DELIVERY TIME")),
        drivers,
        driver_id_number: findMappedValue(drivers, DRIVER_ID_BY_NAME),
        van,
        license_plate: findMappedValue(van, LICENSE_PLATE_BY_VAN),
        source_sheet: sheetName
      };

      const key = spreadsheetDeliveryKey(delivery);
      if (spreadsheetDeliveries.has(key)) skipped += 1;
      spreadsheetDeliveries.set(key, delivery);
    }

    for (const delivery of spreadsheetDeliveries.values()) {
      await insertOrUpdateDelivery(delivery);
      imported += 1;
    }

    res.json({
      ok: true,
      sheetName,
      imported,
      skipped,
      message: `Imported ${imported} deliveries from ${sheetName}`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Import failed. Check the spreadsheet format." });
  }
});

app.listen(PORT, async () => {
  try {
    await syncChecklistDefinitions();
  } catch (err) {
    console.error("Unable to sync checklist definitions", err);
  }

  console.log(`Delivery Calendar app running at http://localhost:${PORT}`);
});
