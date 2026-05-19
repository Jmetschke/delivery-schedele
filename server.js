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
    key: "exit_labels",
    label: "Exit labels made / printed",
    spreadsheetHeader: "EXIT LABELS MADE? PRINTED?"
  },
  {
    key: "sb_labels",
    label: "SB labels printed / applied",
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
    label: "Manifest created + printed",
    spreadsheetHeader: "MANIFEST CREATED + PRINTED?"
  },
  {
    key: "tote_sealed",
    label: "Tote sealed",
    spreadsheetHeader: "TOTE SEALED?"
  },
  {
    key: "folder_manifest_invoice",
    label: "Folder contains manifest + invoice copies",
    spreadsheetHeader: "FOLDER CONTAINS MANIFEST + INVOICE COPIES?"
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
  if (itemKey !== "sb_labels") return true;
  return selectedCompanies(companiesDelivering).has("SB");
}

async function updateDeliveryStatusFromChecklist(deliveryId) {
  const delivery = await get("SELECT companies_delivering FROM deliveries WHERE id = ?", [
    deliveryId
  ]);

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
  const status =
    totalCount > 0 && completedCount === totalCount
      ? "Completed"
      : completedCount > 0
        ? "In Progress"
        : "Not Started";

  await run("UPDATE deliveries SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
    status,
    deliveryId
  ]);

  return {
    status,
    total_count: totalCount,
    completed_count: completedCount
  };
}

async function insertOrUpdateDelivery(delivery, checklistItems) {
  const existing = await get(
    `
      SELECT id FROM deliveries
      WHERE store = ? AND delivery_date = ? AND delivery_time = ? AND drivers = ?
    `,
    [delivery.store, delivery.delivery_date, delivery.delivery_time, delivery.drivers]
  );

  let deliveryId;

  if (existing) {
    deliveryId = existing.id;
    await run(
      `
        UPDATE deliveries
        SET dispensary_location = ?, dispensary_address = ?, companies_delivering = ?,
            border_store = ?, needs_display = ?, date_order_received = ?,
            product_type = ?, delivery_type = ?, pickup_time = ?, van = ?,
            source_sheet = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        delivery.dispensary_location,
        delivery.dispensary_address,
        delivery.companies_delivering,
        delivery.border_store,
        delivery.needs_display,
        delivery.date_order_received,
        delivery.product_type,
        delivery.delivery_type,
        delivery.pickup_time,
        delivery.van,
        delivery.source_sheet,
        deliveryId
      ]
    );

  } else {
    const result = await run(
      `
        INSERT INTO deliveries (
          store, dispensary_location, dispensary_address, companies_delivering,
          border_store, needs_display, date_order_received,
          product_type, delivery_type, delivery_date, pickup_time,
          delivery_time, drivers, van, source_sheet
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        delivery.store,
        delivery.dispensary_location,
        delivery.dispensary_address,
        delivery.companies_delivering,
        delivery.border_store,
        delivery.needs_display,
        delivery.date_order_received,
        delivery.product_type,
        delivery.delivery_type,
        delivery.delivery_date,
        delivery.pickup_time,
        delivery.delivery_time,
        delivery.drivers,
        delivery.van,
        delivery.source_sheet
      ]
    );
    deliveryId = result.lastID;
  }

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

  await updateDeliveryStatusFromChecklist(deliveryId);

  return deliveryId;
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "Delivery Calendar app is running" });
});

app.get("/api/deliveries", async (req, res) => {
  try {
    const { date, status, driver } = req.query;

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

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const rows = await all(
      `
        SELECT * FROM deliveries
        ${where}
        ORDER BY delivery_date, delivery_time, store
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
        SELECT id, store, delivery_date, delivery_time, companies_delivering, status
        FROM deliveries
        WHERE delivery_date IS NOT NULL AND delivery_date != ''
        ORDER BY delivery_date, delivery_time
      `
    );

    const events = rows.map((row) => ({
      id: String(row.id),
      title: `${row.delivery_time || ""} ${row.store} - ${row.companies_delivering || ""}`.trim(),
      start: row.delivery_date,
      extendedProps: {
        delivery_time: row.delivery_time,
        companies_delivering: row.companies_delivering,
        status: row.status
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
      border_store,
      needs_display,
      date_order_received,
      delivery_date,
      delivery_time
    } = req.body;

    if (!store || !delivery_date) {
      return res.status(400).json({ error: "Date and dispensary name are required" });
    }

    const result = await run(
      `
        INSERT INTO deliveries (
          store, dispensary_location, dispensary_address, companies_delivering,
          border_store, needs_display, date_order_received, delivery_date,
          delivery_time, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Not Started')
      `,
      [
        store,
        dispensary_location,
        dispensary_address,
        companies_delivering,
        border_store,
        needs_display,
        date_order_received,
        delivery_date,
        delivery_time
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
      border_store,
      needs_display,
      date_order_received,
      product_type = "",
      delivery_type = "",
      delivery_date,
      pickup_time = "",
      delivery_time,
      drivers = "",
      van = "",
      status,
      notes
    } = req.body;

    await run(
      `
        UPDATE deliveries
        SET store = ?, dispensary_location = ?, dispensary_address = ?,
            companies_delivering = ?, border_store = ?, needs_display = ?, date_order_received = ?,
            product_type = ?, delivery_type = ?, delivery_date = ?, pickup_time = ?,
            delivery_time = ?, drivers = ?, van = ?, status = ?, notes = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        store,
        dispensary_location,
        dispensary_address,
        companies_delivering,
        border_store,
        needs_display,
        date_order_received,
        product_type,
        delivery_type,
        delivery_date,
        pickup_time,
        delivery_time,
        drivers,
        van,
        status,
        notes,
        req.params.id
      ]
    );

    await updateDeliveryStatusFromChecklist(req.params.id);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to save delivery" });
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

    for (const row of rows.slice(headerRowIndex + 1)) {
      const store = normalizeCell(getValue(row, headerMap, "STORE"));

      if (!store || store.toUpperCase().startsWith("PAGE")) {
        skipped += 1;
        continue;
      }

      const delivery = {
        store,
        dispensary_location: "",
        dispensary_address: "",
        companies_delivering: "",
        border_store: normalizeCell(getValue(row, headerMap, "Border Store")),
        needs_display: normalizeCell(getValue(row, headerMap, "NEEDS DISPLAY")),
        date_order_received: excelDateToISO(getValue(row, headerMap, "DATE ORDER RECEIVED")),
        product_type: normalizeCell(getValue(row, headerMap, "Hijnx/ Pheotera/ Snackbar")),
        delivery_type: normalizeCell(getValue(row, headerMap, "EO DELIVERY OR OTHER?")),
        delivery_date: excelDateToISO(getValue(row, headerMap, "DELIVERY DATE")),
        pickup_time: normalizeCell(getValue(row, headerMap, "PICK-UP TIME")),
        delivery_time: normalizeCell(getValue(row, headerMap, "DELIVERY TIME")),
        drivers: normalizeCell(getValue(row, headerMap, "DRIVERS")),
        van: normalizeCell(getValue(row, headerMap, "VAN")),
        source_sheet: sheetName
      };

      const checklistItems = CHECKLIST_COLUMNS.map((item) => {
        const rawValue = normalizeCell(getValue(row, headerMap, item.spreadsheetHeader));
        return {
          key: item.key,
          label: item.label,
          completed: isCompletedChecklistValue(rawValue),
          raw_value: rawValue
        };
      });

      await insertOrUpdateDelivery(delivery, checklistItems);
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

app.listen(PORT, () => {
  console.log(`Delivery Calendar app running at http://localhost:${PORT}`);
});
