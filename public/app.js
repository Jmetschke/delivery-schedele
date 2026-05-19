let calendar;
let deliveries = [];

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
  if (item.item_key !== "sb_labels") return true;
  return selectedCompanies(companiesDelivering).has("SB");
}

async function createDelivery(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const result = document.getElementById("newDeliveryResult");
  const payload = {
    delivery_date: document.getElementById("newDeliveryDate").value,
    delivery_time: document.getElementById("newDeliveryTime").value,
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
        <div class="delivery-row" onclick="openDelivery(${delivery.id})">
          <div class="delivery-row-main">
            <div>${delivery.delivery_date || ""}</div>
            <div><strong>${escapeHtml(delivery.store)}</strong><br>${escapeHtml(delivery.dispensary_location || delivery.dispensary_address || "")}</div>
            <div>${escapeHtml(delivery.delivery_time || "")}</div>
            <div>${escapeHtml(delivery.companies_delivering || "")}</div>
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

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
