let calendar;
let deliveries = [];

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

document.addEventListener("DOMContentLoaded", () => {
  setupCalendar();
  setupHandlers();
  loadDeliveries();
});

function setupCalendar() {
  const calendarEl = document.getElementById("calendar");
  const phoneView = window.matchMedia("(max-width: 640px)");

  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: phoneView.matches ? "listWeek" : "dayGridMonth",
    height: "auto",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: phoneView.matches ? "" : "dayGridMonth,dayGridWeek"
    },
    eventSources: ["/api/calendar-events"],
    eventClassNames(info) {
      const classes = [driverColorClass(info.event.extendedProps.drivers)];

      if (Number(info.event.extendedProps.delivered)) {
        classes.push("delivered-calendar-event");
      }

      return classes;
    },
    eventContent(info) {
      return renderCalendarEvent(info.event);
    },
    eventClick(info) {
      openDelivery(info.event.id);
    },
    windowResize() {
      const isPhone = phoneView.matches;
      calendar.setOption("headerToolbar", {
        left: "prev,next today",
        center: "title",
        right: isPhone ? "" : "dayGridMonth,dayGridWeek"
      });

      if (isPhone && calendar.view.type !== "listWeek") {
        calendar.changeView("listWeek");
      } else if (!isPhone && calendar.view.type === "listWeek") {
        calendar.changeView("dayGridMonth");
      }
    }
  });

  calendar.render();
}

function renderCalendarEvent(event) {
  const props = event.extendedProps;
  const wrapper = document.createElement("div");
  wrapper.className = "calendar-event-content";

  const details = [
    props.pickup_time ? `PU ${props.pickup_time}` : "",
    props.delivery_company ? `Company: ${props.delivery_company}` : "",
    props.drivers ? `Driver: ${props.drivers}` : "",
    props.van ? `Van: ${props.van}` : ""
  ].filter(Boolean);

  if (props.delivery_time) {
    const deliveryTime = document.createElement("span");
    deliveryTime.className = "calendar-event-delivery-time";
    deliveryTime.textContent = `DEL ${props.delivery_time}`;
    wrapper.appendChild(deliveryTime);
  }

  const store = document.createElement("span");
  store.className = "calendar-event-store";
  store.textContent = props.store || event.title || "Delivery";
  wrapper.appendChild(store);

  if (details.length) {
    const detail = document.createElement("span");
    detail.className = "calendar-event-detail";
    detail.textContent = details.join(" | ");
    wrapper.appendChild(detail);
  }

  if (isDueDeliveryDate(event.startStr)) {
    const label = document.createElement("label");
    label.className = "calendar-delivered-check";
    label.addEventListener("click", (event) => event.stopPropagation());

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(Number(props.delivered));
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", (changeEvent) => {
      changeEvent.stopPropagation();
      setDeliveredStatus(event.id, checkbox.checked);
    });

    const text = document.createElement("span");
    text.textContent = "Delivered";

    label.appendChild(checkbox);
    label.appendChild(text);
    wrapper.appendChild(label);
  }

  return { domNodes: [wrapper] };
}

function isDueDeliveryDate(dateText) {
  if (!dateText) return false;
  return dateText.slice(0, 10) <= isoDate(new Date());
}

async function setDeliveredStatus(id, delivered) {
  const response = await fetch(`/api/deliveries/${id}/delivered`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delivered })
  });

  if (!response.ok) {
    alert("Delivered status did not save.");
    calendar.refetchEvents();
    return;
  }

  await loadDeliveries();
  calendar.refetchEvents();
}

function setupHandlers() {
  document.getElementById("newDeliveryForm").addEventListener("submit", createDelivery);
  document.getElementById("statusFilter").addEventListener("change", renderDeliveryList);
  document.getElementById("closeDrawer").addEventListener("click", closeDrawer);
  document.getElementById("deliveryForm").addEventListener("submit", saveDelivery);
  document.getElementById("deleteDelivery").addEventListener("click", deleteDelivery);
  document.getElementById("checkAllChecklist").addEventListener("click", checkAllChecklistItems);
  bindDriverIdAutofill("newDeliveryDriver", "newDriverIdNumber");
  bindDriverIdAutofill("deliveryDriver", "driverIdNumber");
  bindLicensePlateAutofill("newDeliveryVan", "newLicensePlate");
  bindLicensePlateAutofill("deliveryVan", "licensePlate");
  bindTimeAutofill(["newDeliveryTime", "newPickupTime", "deliveryTime", "pickupTime"]);
  setupMobileViewSwitcher();
}

function setupMobileViewSwitcher() {
  const phoneView = window.matchMedia("(max-width: 640px)");
  const buttons = Array.from(document.querySelectorAll(".mobile-view-button"));
  const sections = Array.from(document.querySelectorAll(".mobile-view-section"));

  function showMobileView(target, shouldScroll = true) {
    const isPhone = phoneView.matches;

    buttons.forEach((button) => {
      const active = button.dataset.mobileTarget === target && isPhone;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    sections.forEach((section) => {
      const sectionViews = String(section.dataset.mobileSection || "").split(/\s+/);
      section.classList.toggle("mobile-hidden", isPhone && !sectionViews.includes(target));
    });

    if (!isPhone) return;

    if (target === "calendar" && calendar) {
      calendar.updateSize();
    }

    if (shouldScroll) {
      document.querySelector(".mobile-view-switcher").scrollIntoView({ block: "start" });
    }
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => showMobileView(button.dataset.mobileTarget));
  });

  phoneView.addEventListener("change", () => {
    const activeButton = buttons.find((button) => button.classList.contains("is-active"));
    showMobileView(activeButton?.dataset.mobileTarget || "calendar", false);
  });

  showMobileView("calendar", false);
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

function bindLicensePlateAutofill(vanInputId, plateInputId) {
  const vanInput = document.getElementById(vanInputId);
  const plateInput = document.getElementById(plateInputId);

  vanInput.addEventListener("change", () => {
    const selectedVan = vanInput.value.trim();
    const licensePlate = LICENSE_PLATE_BY_VAN[selectedVan];

    if (licensePlate) {
      plateInput.value = licensePlate;
    }
  });
}

function bindTimeAutofill(inputIds) {
  inputIds.forEach((inputId) => {
    const input = document.getElementById(inputId);

    input.addEventListener("blur", () => normalizeTimeInput(input));
    input.addEventListener("change", () => normalizeTimeInput(input));
  });
}

function normalizeTimeInput(input) {
  const normalized = normalizePartialTime(input.value);

  if (normalized) {
    input.value = normalized;
  }

  return input.value;
}

function normalizePartialTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  let text = raw.toUpperCase().replace(/\./g, "").replace(/\s+/g, "");
  let meridiem = "AM";
  const meridiemMatch = text.match(/(AM|A|PM|P)$/);

  if (meridiemMatch) {
    meridiem = meridiemMatch[1].startsWith("P") ? "PM" : "AM";
    text = text.slice(0, -meridiemMatch[1].length);
  }

  if (!text) return raw;

  let hour;
  let minutes = 0;

  if (text.includes(":")) {
    const [hourText, minuteText = ""] = text.split(":");
    hour = Number(hourText);
    minutes = minuteText ? Number(minuteText.padEnd(2, "0").slice(0, 2)) : 0;
  } else if (/^\d{3,4}$/.test(text)) {
    hour = Number(text.slice(0, -2));
    minutes = Number(text.slice(-2));
  } else if (/^\d{1,2}$/.test(text)) {
    hour = Number(text);
  } else {
    return raw;
  }

  if (!Number.isInteger(hour) || !Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
    return raw;
  }

  if (!meridiemMatch && hour > 12 && hour <= 23) {
    meridiem = "PM";
  }

  hour = hour % 12 || 12;

  return `${hour}:${String(minutes).padStart(2, "0")} ${meridiem}`;
}

function timeSortValue(value) {
  const normalized = normalizePartialTime(value);
  const match = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (!match) return Number.MAX_SAFE_INTEGER;

  let hour = Number(match[1]) % 12;
  const minutes = Number(match[2]);

  if (match[3].toUpperCase() === "PM") {
    hour += 12;
  }

  return hour * 60 + minutes;
}

function compareWeekDeliveries(a, b) {
  const driverCompare = String(a.drivers || "")
    .trim()
    .localeCompare(String(b.drivers || "").trim(), undefined, { sensitivity: "base" });

  if (driverCompare !== 0) return driverCompare;

  return timeSortValue(a.delivery_time) - timeSortValue(b.delivery_time);
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
    delivery_time: normalizeTimeInput(document.getElementById("newDeliveryTime")),
    pickup_time: normalizeTimeInput(document.getElementById("newPickupTime")),
    delivery_company: document.getElementById("newDeliveryCompany").value.trim(),
    drivers: document.getElementById("newDeliveryDriver").value.trim(),
    driver_id_number: document.getElementById("newDriverIdNumber").value.trim(),
    van: document.getElementById("newDeliveryVan").value.trim(),
    license_plate: document.getElementById("newLicensePlate").value.trim(),
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
  renderUnscheduledOrders();
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
    isScheduledDelivery(delivery) && days.some((day) => delivery.delivery_date === isoDate(day))
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
        .filter((delivery) => isScheduledDelivery(delivery) && delivery.delivery_date === dayIso)
        .sort(compareWeekDeliveries);

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

function isScheduledDelivery(delivery) {
  return Boolean(
    String(delivery.delivery_date || "").trim() && String(delivery.delivery_time || "").trim()
  );
}

function missingScheduleText(delivery) {
  const missing = [];

  if (!String(delivery.delivery_date || "").trim()) missing.push("date");
  if (!String(delivery.delivery_time || "").trim()) missing.push("delivery time");

  return missing.length ? `Needs ${missing.join(" and ")}` : "";
}

function renderUnscheduledOrders() {
  const list = document.getElementById("unscheduledList");
  const unscheduled = deliveries
    .filter((delivery) => !isScheduledDelivery(delivery))
    .sort((a, b) =>
      String(a.store || "").localeCompare(String(b.store || ""), undefined, { sensitivity: "base" })
    );

  if (!unscheduled.length) {
    list.innerHTML = "<p>No orders waiting to be scheduled.</p>";
    return;
  }

  list.innerHTML = unscheduled
    .map(
      (delivery) => `
        <button class="unscheduled-order ${driverColorClass(delivery.drivers)}" type="button" onclick="openDelivery(${delivery.id})">
          <strong>${escapeHtml(delivery.store)}</strong>
          <span>${escapeHtml(delivery.dispensary_location || delivery.dispensary_address || "")}</span>
          <span>${escapeHtml([delivery.delivery_company, delivery.drivers ? `Driver: ${delivery.drivers}` : "", delivery.van ? `Van: ${delivery.van}` : ""].filter(Boolean).join(" / "))}</span>
          <em>${escapeHtml(missingScheduleText(delivery))}</em>
        </button>
      `
    )
    .join("");
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
  document.getElementById("licensePlate").value = d.license_plate || "";
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

async function checkAllChecklistItems() {
  const id = document.getElementById("deliveryId").value;

  if (!id) return;

  const response = await fetch(`/api/deliveries/${id}/checklist/check-all`, {
    method: "PATCH"
  });

  if (!response.ok) {
    alert("Checklist items did not save.");
    return;
  }

  const data = await response.json();
  document.getElementById("status").value = data.status || "Not Started";
  await openDelivery(id);
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
    delivery_time: normalizeTimeInput(document.getElementById("deliveryTime")),
    pickup_time: normalizeTimeInput(document.getElementById("pickupTime")),
    delivery_company: document.getElementById("deliveryCompany").value.trim(),
    drivers: document.getElementById("deliveryDriver").value.trim(),
    driver_id_number: document.getElementById("driverIdNumber").value.trim(),
    van: document.getElementById("deliveryVan").value.trim(),
    license_plate: document.getElementById("licensePlate").value.trim(),
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
