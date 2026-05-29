document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("printPage").addEventListener("click", () => window.print());
  loadPrintableCalendar();
});

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseIsoDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
}

function formatDate(date, options) {
  return date.toLocaleDateString(undefined, options);
}

function timeSortValue(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/^(\d{1,2})\s*(AM|PM)$/, "$1:00 $2");
  const match = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (!match) return Number.MAX_SAFE_INTEGER;

  let hour = Number(match[1]) % 12;
  const minutes = Number(match[2]);

  if (match[3].toUpperCase() === "PM") {
    hour += 12;
  }

  return hour * 60 + minutes;
}

function compareDriverTimeStore(a, b) {
  const driverCompare = String(a.drivers || "")
    .trim()
    .localeCompare(String(b.drivers || "").trim(), undefined, { sensitivity: "base" });

  if (driverCompare !== 0) return driverCompare;

  return (
    timeSortValue(a.delivery_time) - timeSortValue(b.delivery_time) ||
    String(a.store || "").localeCompare(String(b.store || ""), undefined, { sensitivity: "base" })
  );
}

function isScheduledDelivery(delivery) {
  return Boolean(
    String(delivery.delivery_date || "").trim() && String(delivery.delivery_time || "").trim()
  );
}

function selectedCompanies(delivery) {
  return new Set(
    String(delivery.companies_delivering || "")
      .split(",")
      .map((company) => company.trim().toUpperCase())
      .filter(Boolean)
  );
}

function activeChecklistItems(delivery) {
  const companies = selectedCompanies(delivery);

  return (delivery.checklist || []).filter((item) => {
    if (!["sb_labels_printed", "sb_labels_applied"].includes(item.item_key)) return true;
    return companies.has("SB");
  });
}

function deliveryCompletionSummary(delivery) {
  const items = activeChecklistItems(delivery);
  const total = items.length;
  const completed = items.filter((item) => Number(item.completed)).length;

  if (!total) return "0% complete";

  return `${Math.round((completed / total) * 100)}% complete`;
}

function isDeliveryConfirmed(delivery) {
  const item = (delivery.checklist || []).find(
    (checklistItem) => checklistItem.item_key === "delivery_confirmed"
  );

  return Number(item?.completed);
}

function driverColorClass(driver) {
  const name = String(driver || "").trim().toLowerCase();

  if (!name) return "driver-unassigned";

  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) % 9973;
  }

  return `driver-color-${hash % 5}`;
}

function renderPrintableDelivery(delivery) {
  const classes = [
    "print-delivery",
    driverColorClass(delivery.drivers),
    Number(delivery.order_ready_to_ship) ? "order-ready-print-delivery" : "",
    isDeliveryConfirmed(delivery) ? "" : "unconfirmed-print-delivery"
  ]
    .filter(Boolean)
    .join(" ");
  const lineOne = [
    delivery.delivery_time ? `DEL ${delivery.delivery_time}` : "",
    delivery.pickup_time ? `PU ${delivery.pickup_time}` : "",
    isDeliveryConfirmed(delivery) ? "Confirmed" : "Not confirmed"
  ].filter(Boolean);
  const lineTwo = [
    delivery.delivery_company,
    delivery.drivers ? `Driver: ${delivery.drivers}` : "",
    delivery.van ? `Van: ${delivery.van}` : "",
    delivery.license_plate ? `Plate: ${delivery.license_plate}` : "",
    deliveryCompletionSummary(delivery)
  ].filter(Boolean);

  return `
    <article class="${classes}">
      <strong>${escapeHtml(delivery.store)}</strong>
      <span>${escapeHtml(lineOne.join(" | "))}</span>
      <span>${escapeHtml(lineTwo.join(" | "))}</span>
      <em>${escapeHtml(delivery.status || "Not Started")}</em>
    </article>
  `;
}

function renderPrintWeek(days, deliveries) {
  const grouped = days.reduce((acc, day) => {
    const dayIso = isoDate(day);
    acc[dayIso] = deliveries
      .filter((delivery) => isScheduledDelivery(delivery) && delivery.delivery_date === dayIso)
      .sort(compareDriverTimeStore);
    return acc;
  }, {});
  const gridColumns = days
    .map((day) => (day.getDay() === 0 || day.getDay() === 6 ? "minmax(0.55in, 0.55fr)" : "minmax(0, 1fr)"))
    .join(" ");

  return `
    <section class="print-week-grid" style="grid-template-columns: ${gridColumns}">
      ${days
        .map((day) => {
          const dayIso = isoDate(day);
          const dayDeliveries = grouped[dayIso];
          const classes = [
            "print-day",
            day.getDay() === 0 || day.getDay() === 6 ? "weekend" : "",
            dayDeliveries.length ? "has-deliveries" : ""
          ]
            .filter(Boolean)
            .join(" ");

          return `
            <section class="${classes}">
              <header>
                <strong>${escapeHtml(formatDate(day, { weekday: "short" }))}</strong>
                <span>${escapeHtml(formatDate(day, { month: "numeric", day: "numeric" }))}</span>
              </header>
              <div>
                ${
                  dayDeliveries.length
                    ? dayDeliveries.map((delivery) => renderPrintableDelivery(delivery)).join("")
                    : '<p class="print-empty-day">No deliveries</p>'
                }
              </div>
            </section>
          `;
        })
        .join("")}
    </section>
  `;
}

async function loadPrintableCalendar() {
  const params = new URLSearchParams(window.location.search);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = parseIsoDate(params.get("start")) || today;
  const days = Array.from({ length: 14 }, (_, index) => addDays(start, index));
  const end = days[13];
  const response = await fetch("/api/deliveries");
  const deliveries = await response.json();

  document.getElementById("printRange").textContent = `${formatDate(start, {
    month: "short",
    day: "numeric"
  })} - ${formatDate(end, { month: "short", day: "numeric", year: "numeric" })}`;
  document.getElementById("printCalendar").innerHTML = [
    renderPrintWeek(days.slice(0, 7), deliveries),
    renderPrintWeek(days.slice(7), deliveries)
  ].join("");
}
