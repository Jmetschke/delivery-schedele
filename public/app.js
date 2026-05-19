let calendar;
let deliveries = [];

const DRIVER_ID_BY_NAME = {
  "Adriana Santacruz": "",
  "Chloe Stockholm": "",
  "Eduardo Ibarra": "",
  "Hector Ochoa": "",
  "Jason Litwin": "",
  "John Tinsley": "",
  "Jorge Galvez": "",
  "Joselyn Cervantes": "",
  "Julia Johnson": "",
  "Karina Cervantez": "",
  "Lamarr Collins": "",
  "Lily Knightly": "",
  "Magdalena Rodriguez": "",
  "Paul Johnson": "",
  "Richard Paull": "",
  "STEVE GARZA": "",
  "TED STEINBRECHER": ""
};

document.addEventListener("DOMContentLoaded", () => {
  setupCalendar();
  setupHandlers();
  loadDeliveries();
});

function setupCalendar() {
  const calendarEl = document.getElementById("calendar");

  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    height: "auto",
    eventSources: ["/api/calendar-events"],
    eventClassNames(info) {
      return [driverColorClass(info.event.extendedProps.drivers)];
    },
    eventClick(info) {
      openDelivery(info.event.id);
    }
  });

  calendar.render();
}

function setupHandlers() {
  document.getElementById("newDeliveryForm").addEventListener("submit", createDelivery);
  document.getElementById("statusFilter").addEventListener("change", renderDeliveryList);
  document.getElementById("closeDrawer").addEventListener("click", closeDrawer);
  document.getElementById("deliveryForm").addEventListener("submit", saveDelivery);
  document.getElementById("deleteDelivery").addEventListener("click", deleteDelivery);
  bindDriverIdAutofill("newDeliveryDriver", "newDriverIdNumber");
  bindDriverIdAutofill("deliveryDriver", "driverIdNumber");
}

function bindDriverIdAutofill(driverInputId, driverIdInputId) {
  const driverInput = document.getElementById(driverInputId);
  const driverIdInput = document.getElementById(driverIdInputId);

  driverInput.addEventListener("change", () => {
    const selectedName = driverInput.value.trim();
    const driverId = DRIVER_ID_BY_NAME[selectedName];

    if (driverId) {
      driverIdInput.value = driverId;
    }
  });
}

function selectedCheckboxValues(name) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(
    (input) => input.value
  );
}

function setSelectedCheckboxValues(name, values) {
  const selected = new Set(
    String(values || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );

  document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
    input.checked = selected.has(input.value);
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

function isChecklistItemActive(item, companiesDelivering) {
  if (!["sb_labels_printed", "sb_labels_applied"].includes(item.item_key)) return true;
  return selectedCompanies(companiesDelivering).has("SB");
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

function hasSelectedCheckbox(name) {
  return selectedCheckboxValues(name).length > 0;
}

async function createDelivery(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const result = document.getElementById("newDeliveryResult");

  if (!hasSelectedCheckbox("newCompaniesDelivering")) {
    result.textContent = "Select at least one company delivering.";
    return;
  }

  const payload = {
    delivery_date: document.getElementById("newDeliveryDate").value,
    delivery_time: document.getElementById("newDeliveryTime").value,
    pickup_time: document.getElementById("newPickupTime").value,
    delivery_company: document.getElementById("newDeliveryCompany").value.trim(),
    drivers: document.getElementById("newDeliveryDriver").value.trim(),
    driver_id_number: document.getElementById("newDriverIdNumber").value.trim(),
    van: document.getElementById("newDeliveryVan").value.trim(),
    store: document.getElementById("newStore").value.trim(),
    dispensary_location: document.getElementById("newDispensaryLocation").value.trim(),
    dispensary_address: document.getElementById("newDispensaryAddress").value.trim(),
    companies_delivering: selectedCheckboxValues("newCompaniesDelivering").join(", "),
    needs_display: document.getElementById("newNeedsDisplay").value,
    date_order_received: document.getElementById("newDateOrderReceived").value,
    border_store: document.getElementById("newBorderStore").value
  };

  result.textContent = "Adding delivery...";

  const response = await fetch("/api/deliveries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    result.textContent = data.error || "Delivery did not save.";
    return;
  }

  result.textContent = "Delivery added.";
  form.reset();
  await loadDeliveries();
  calendar.refetchEvents();
}

async function loadDeliveries() {
  const response = await fetch("/api/deliveries");
  deliveries = await response.json();
  renderSummary();
  renderWeekSchedule();
  renderDeliveryList();
}

function renderSummary() {
  document.getElementById("totalCount").textContent = deliveries.length;
  document.getElementById("inProgressCount").textContent = deliveries.filter(
    (d) => d.status === "In Progress"
  ).length;
  document.getElementById("completedCount").textContent = deliveries.filter(
    (d) => d.status === "Completed"
  ).length;
}

function startOfCurrentWeek() {
  const today = new Date();
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  start.setDate(today.getDate() - today.getDay());
  return start;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
}

function isoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatWeekDate(date, options) {
  return date.toLocaleDateString(undefined, options);
}

function renderWeekSchedule() {
  const schedule = document.getElementById("weekSchedule");
  const range = document.getElementById("weekRange");
  const count = document.getElementById("weekCount");
  const start = startOfCurrentWeek();
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const end = days[6];
  const todayIso = isoDate(new Date());
  const weekDeliveries = deliveries.filter((delivery) =>
    days.some((day) => delivery.delivery_date === isoDate(day))
  );

  range.textContent = `${formatWeekDate(start, {
    month: "short",
    day: "numeric"
  })} - ${formatWeekDate(end, { month: "short", day: "numeric" })}`;
  count.textContent = `${weekDeliveries.length} ${
    weekDeliveries.length === 1 ? "delivery" : "deliveries"
  }`;

  schedule.innerHTML = days
    .map((day) => {
      const dayIso = isoDate(day);
      const dayDeliveries = deliveries
        .filter((delivery) => delivery.delivery_date === dayIso)
        .sort((a, b) => String(a.delivery_time || "").localeCompare(String(b.delivery_time || "")));

      return `
        <section class="week-day ${dayIso === todayIso ? "today" : ""}">
          <div class="week-day-header">
            <strong>${formatWeekDate(day, { weekday: "short" })}</strong>
            <span>${formatWeekDate(day, { month: "numeric", day: "numeric" })}</span>
          </div>
          <div class="week-day-deliveries">
            ${
              dayDeliveries.length
                ? dayDeliveries
                    .map((delivery) => renderWeekDelivery(delivery))
                    .join("")
                : '<p class="empty-day">No deliveries</p>'
            }
          </div>
        </section>
      `;
    })
    .join("");
}

function renderWeekDelivery(delivery) {
  const badgeClass =
    delivery.status === "Completed"
      ? "completed"
      : delivery.status === "In Progress"
        ? "in-progress"
        : "";

  const logistics = [
    delivery.pickup_time ? `PU ${delivery.pickup_time}` : "",
    delivery.delivery_time ? `DEL ${delivery.delivery_time}` : "",
    delivery.delivery_company,
    delivery.drivers ? `Driver: ${delivery.drivers}` : "",
    delivery.van ? `Van: ${delivery.van}` : ""
  ].filter(Boolean);

  return `
    <button class="week-delivery ${driverColorClass(delivery.drivers)}" type="button" onclick="openDelivery(${delivery.id})">
      <span class="week-delivery-time">${escapeHtml(logistics.join(" | ") || "Time TBD")}</span>
      <strong>${escapeHtml(delivery.store)}</strong>
      <span>${escapeHtml(delivery.dispensary_location || delivery.companies_delivering || "")}</span>
      <span class="badge ${badgeClass}">${escapeHtml(delivery.status || "Not Started")}</span>
    </button>
  `;
}

function renderDeliveryList() {
  const statusFilter = document.getElementById("statusFilter").value;
  const list = document.getElementById("deliveryList");

  const visible = statusFilter
    ? deliveries.filter((delivery) => delivery.status === statusFilter)
    : deliveries;

  if (!visible.length) {
    list.innerHTML = "<p>No deliveries found.</p>";
    return;
  }

  list.innerHTML = visible
    .map((delivery) => {
      const badgeClass =
        delivery.status === "Completed"
          ? "completed"
          : delivery.status === "In Progress"
            ? "in-progress"
          : "";
      const checklist = renderChecklistPreview(
        delivery.checklist || [],
        delivery.companies_delivering
      );

      return `
        <div class="delivery-row ${driverColorClass(delivery.drivers)}" onclick="openDelivery(${delivery.id})">
          <div class="delivery-row-main">
            <div>${delivery.delivery_date || ""}</div>
            <div><strong>${escapeHtml(delivery.store)}</strong><br>${escapeHtml(delivery.dispensary_location || delivery.dispensary_address || "")}</div>
            <div>${escapeHtml([delivery.pickup_time ? `PU ${delivery.pickup_time}` : "", delivery.delivery_time ? `DEL ${delivery.delivery_time}` : ""].filter(Boolean).join(" / "))}</div>
            <div>${escapeHtml([delivery.delivery_company, delivery.drivers ? `Driver: ${delivery.drivers}` : "", delivery.van ? `Van: ${delivery.van}` : ""].filter(Boolean).join(" / "))}</div>
            <div><span class="badge ${badgeClass}">${escapeHtml(delivery.status || "Not Started")}</span></div>
          </div>
          ${checklist}
        </div>
      `;
    })
    .join("");
}

function renderChecklistPreview(items, companiesDelivering) {
  if (!items.length) {
    return '<div class="checklist-preview"><span class="task-pill task-not-done">Checklist not started</span></div>';
  }

  return `
    <div class="checklist-preview" aria-label="Checklist status">
      ${items
        .map((item) => {
          const active = isChecklistItemActive(item, companiesDelivering);
          const done = Boolean(item.completed);
          const statusText = active ? (done ? "Done" : "Not done") : "Inactive";
          const statusClass = active ? (done ? "task-done" : "task-not-done") : "task-inactive";

          return `
            <span class="task-pill ${statusClass}" title="${escapeHtml(item.label)}: ${statusText}">
              <span class="task-label">${escapeHtml(item.label)}</span>
              <span class="task-state">${statusText}</span>
            </span>
          `;
        })
        .join("")}
    </div>
  `;
}

async function openDelivery(id) {
  const response = await fetch(`/api/deliveries/${id}`);
  const data = await response.json();

  const d = data.delivery;

  document.getElementById("deliveryId").value = d.id;
  document.getElementById("drawerTitle").textContent = d.store || "Delivery";
  document.getElementById("store").value = d.store || "";
  document.getElementById("dispensaryLocation").value = d.dispensary_location || "";
  document.getElementById("dispensaryAddress").value = d.dispensary_address || "";
  setSelectedCheckboxValues("companiesDelivering", d.companies_delivering);
  document.getElementById("borderStore").value = d.border_store || "";
  document.getElementById("needsDisplay").value = d.needs_display || "";
  document.getElementById("dateOrderReceived").value = d.date_order_received || "";
  document.getElementById("deliveryDate").value = d.delivery_date || "";
  document.getElementById("deliveryTime").value = d.delivery_time || "";
  document.getElementById("pickupTime").value = d.pickup_time || "";
  document.getElementById("deliveryCompany").value = d.delivery_company || "";
  document.getElementById("deliveryDriver").value = d.drivers || "";
  document.getElementById("driverIdNumber").value = d.driver_id_number || "";
  document.getElementById("deliveryVan").value = d.van || "";
  document.getElementById("status").value = d.status || "Not Started";
  document.getElementById("notes").value = d.notes || "";

  renderChecklist(data.checklist || [], d.companies_delivering);
  document.getElementById("drawer").classList.add("open");
  document.getElementById("drawer").setAttribute("aria-hidden", "false");
}

function closeDrawer() {
  document.getElementById("drawer").classList.remove("open");
  document.getElementById("drawer").setAttribute("aria-hidden", "true");
}

function renderChecklist(items, companiesDelivering) {
  const checklist = document.getElementById("checklist");

  checklist.innerHTML = items
    .map((item) => {
      const active = isChecklistItemActive(item, companiesDelivering);
      const inactiveText = active ? "" : '<span class="inactive-note">Inactive unless SB delivers</span>';

      return `
        <label class="check-item ${active ? "" : "inactive"}">
          <input
            type="checkbox"
            ${item.completed ? "checked" : ""}
            ${active ? "" : "disabled"}
            onchange="saveChecklistItem(${item.id}, this.checked)"
          />
          <span>${escapeHtml(item.label)}</span>
          ${inactiveText}
        </label>
      `;
    })
    .join("");
}

async function saveChecklistItem(id, completed) {
  const response = await fetch(`/api/checklist/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed })
  });

  if (!response.ok) {
    alert("Checklist item did not save.");
    return;
  }

  const data = await response.json();
  document.getElementById("status").value = data.status || "Not Started";
  await loadDeliveries();
  calendar.refetchEvents();
}

async function saveDelivery(event) {
  event.preventDefault();

  const id = document.getElementById("deliveryId").value;

  if (!hasSelectedCheckbox("companiesDelivering")) {
    alert("Select at least one company delivering.");
    return;
  }

  const payload = {
    store: document.getElementById("store").value.trim(),
    dispensary_location: document.getElementById("dispensaryLocation").value.trim(),
    dispensary_address: document.getElementById("dispensaryAddress").value.trim(),
    companies_delivering: selectedCheckboxValues("companiesDelivering").join(", "),
    border_store: document.getElementById("borderStore").value,
    needs_display: document.getElementById("needsDisplay").value,
    date_order_received: document.getElementById("dateOrderReceived").value,
    delivery_date: document.getElementById("deliveryDate").value,
    delivery_time: document.getElementById("deliveryTime").value,
    pickup_time: document.getElementById("pickupTime").value,
    delivery_company: document.getElementById("deliveryCompany").value.trim(),
    drivers: document.getElementById("deliveryDriver").value.trim(),
    driver_id_number: document.getElementById("driverIdNumber").value.trim(),
    van: document.getElementById("deliveryVan").value.trim(),
    status: document.getElementById("status").value,
    notes: document.getElementById("notes").value
  };

  const response = await fetch(`/api/deliveries/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    alert("Delivery did not save.");
    return;
  }

  await loadDeliveries();
  calendar.refetchEvents();
  closeDrawer();
}

async function deleteDelivery() {
  const id = document.getElementById("deliveryId").value;
  const store = document.getElementById("store").value.trim() || "this delivery";

  if (!id) return;

  const confirmed = window.confirm(`Delete ${store}? This cannot be undone.`);
  if (!confirmed) return;

  const response = await fetch(`/api/deliveries/${id}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    alert("Delivery did not delete.");
    return;
  }

  await loadDeliveries();
  calendar.refetchEvents();
  closeDrawer();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
