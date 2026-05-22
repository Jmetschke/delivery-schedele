document.addEventListener("DOMContentLoaded", loadDeliveredOrders);

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDeliveredDate(value) {
  if (!value) return "";
  const isoDateMatch = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (isoDateMatch) {
    return `${Number(isoDateMatch[2])}/${Number(isoDateMatch[3])}/${isoDateMatch[1]}`;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

async function loadDeliveredOrders() {
  const response = await fetch("/api/deliveries?delivered=1");
  const deliveries = await response.json();
  const list = document.getElementById("deliveredOrdersList");
  const count = document.getElementById("deliveredCount");

  count.textContent = `${deliveries.length} ${deliveries.length === 1 ? "delivered" : "delivered"}`;

  if (!deliveries.length) {
    list.innerHTML = "<p>No delivered orders yet.</p>";
    return;
  }

  list.innerHTML = deliveries
    .sort((a, b) => String(b.delivery_date || "").localeCompare(String(a.delivery_date || "")))
    .map((delivery) => {
      const schedule = [
        delivery.delivery_date,
        delivery.pickup_time ? `PU ${delivery.pickup_time}` : "",
        delivery.delivery_time ? `DEL ${delivery.delivery_time}` : ""
      ]
        .filter(Boolean)
        .join(" / ");
      const logistics = [
        delivery.delivery_company,
        delivery.drivers ? `Driver: ${delivery.drivers}` : "",
        delivery.van ? `Van: ${delivery.van}` : "",
        delivery.license_plate ? `Plate: ${delivery.license_plate}` : ""
      ]
        .filter(Boolean)
        .join(" / ");

      return `
        <article class="delivery-row delivered-order">
          <div class="delivery-row-main">
            <div>${escapeHtml(schedule)}</div>
            <div><strong>${escapeHtml(delivery.store)}</strong><br>${escapeHtml(delivery.dispensary_location || delivery.dispensary_address || "")}</div>
            <div>${escapeHtml(logistics)}</div>
            <div>${escapeHtml(delivery.companies_delivering || "")}</div>
            <div><span class="badge completed">Delivered</span></div>
          </div>
          <div class="delivered-meta">Delivered ${escapeHtml(formatDeliveredDate(delivery.delivery_date))}</div>
        </article>
      `;
    })
    .join("");
}
