const header = document.querySelector("[data-header]");
const navToggle = document.querySelector("[data-nav-toggle]");
const navLinks = document.querySelector("[data-nav-links]");
const year = document.querySelector("[data-year]");
const dashboardRoot = document.querySelector("[data-dashboard-root]");
const dashboardViews = document.querySelectorAll("[data-dashboard-view]");
const dashboardViewLinks = document.querySelectorAll("[data-dashboard-view-link]");
const copyIpButtons = document.querySelectorAll("[data-copy-ip]");
const serverIp = "play.dragonshosting.nl";
const isDashboardRoute = /^\/dashboard(\/|$)/.test(window.location.pathname);

if (isDashboardRoute) {
  document.documentElement.classList.add("dashboard-route");
  document.documentElement.lang = "en";
}

if (year) {
  year.textContent = new Date().getFullYear();
}

const setHeaderState = () => {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 12);
};

setHeaderState();
window.addEventListener("scroll", setHeaderState, { passive: true });

if (navToggle && navLinks) {
  navToggle.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("is-open");
    document.body.classList.toggle("nav-open", isOpen);
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  navLinks.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLAnchorElement)) return;
    navLinks.classList.remove("is-open");
    document.body.classList.remove("nav-open");
    navToggle.setAttribute("aria-expanded", "false");
  });
}

copyIpButtons.forEach((button) => {
  const originalText = button.textContent;
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(serverIp);
      button.textContent = "IP copied";
    } catch (_) {
      button.textContent = serverIp;
    }

    window.setTimeout(() => {
      button.textContent = originalText;
    }, 1800);
  });
});

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const formatNumber = (value) =>
  new Intl.NumberFormat("en-US").format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const getDashboardViewFromPath = (pathname = window.location.pathname) => {
  const match = pathname.match(/^\/dashboard\/\d+\/?([^/]*)/);
  const page = match?.[1] || "";
  return page === "statistics" ? "statistics" : "overview";
};

const normalizePath = (pathname) => pathname.replace(/\/$/, "") || "/";

const setDashboardView = (viewName, pathname = window.location.pathname) => {
  if (!dashboardViews.length) return;

  dashboardViews.forEach((view) => {
    view.classList.toggle("is-active", view.dataset.dashboardView === viewName);
  });

  const currentPath = normalizePath(pathname);
  let activeLink = null;

  dashboardViewLinks.forEach((link) => {
    const linkPath = normalizePath(new URL(link.href, window.location.origin).pathname);
    const isActive = linkPath === currentPath;
    link.classList.toggle("is-active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
    if (isActive) activeLink = link;
  });

  if (!activeLink) {
    const fallback = [...dashboardViewLinks].find((link) => link.dataset.dashboardViewLink === viewName);
    if (fallback) {
      fallback.classList.add("is-active");
      fallback.setAttribute("aria-current", "page");
    }
  }
};

dashboardViewLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const url = new URL(link.href, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/dashboard/")) return;
    event.preventDefault();
    window.history.pushState({}, "", url.pathname);
    setDashboardView(getDashboardViewFromPath(url.pathname), url.pathname);
  });
});

window.addEventListener("popstate", () => {
  setDashboardView(getDashboardViewFromPath(), window.location.pathname);
});

const getDashboardGuildId = () => {
  const routeMatch = window.location.pathname.match(/^\/dashboard\/(\d+)/);
  return routeMatch?.[1] || dashboardRoot?.dataset.guildId || "1482512038788993034";
};

const renderRows = (target, rows, emptyText, mapRow) => {
  const containers = target instanceof Element ? [target] : [...(target || [])];
  containers.forEach((container) => {
    if (!rows.length) {
      container.innerHTML = `<p class="empty-state">${escapeHtml(emptyText)}</p>`;
      return;
    }
    container.innerHTML = rows.map(mapRow).join("");
  });
};

const setTextAll = (selector, value) => {
  document.querySelectorAll(selector).forEach((element) => {
    element.textContent = value;
  });
};

const ticketRow = (ticket) => `
  <a class="live-ticket-row" href="${escapeHtml(ticket.url)}" target="_blank" rel="noopener">
    <span>
      <strong>#${escapeHtml(ticket.channelName || "ticket")}</strong>
      <small>${escapeHtml(ticket.createdBy || "Unknown")} &middot; ${formatDate(ticket.lastActivityAt || ticket.createdAt)}</small>
      <span class="ticket-meta">
        <span>${escapeHtml(ticket.ticketType || "Support")}</span>
        ${ticket.parentName ? `<span>${escapeHtml(ticket.parentName)}</span>` : ""}
      </span>
    </span>
    <span class="row-action">Open</span>
  </a>
`;

const transcriptRow = (ticket) => `
  <a class="live-ticket-row" href="${escapeHtml(ticket.url)}" target="_blank" rel="noopener">
    <span>
      <strong>#${escapeHtml(ticket.channelName || ticket.id)}</strong>
      <small>${escapeHtml(ticket.createdBy || "Unknown")} &middot; ${formatDate(ticket.closedAt || ticket.createdAt)}</small>
      <span class="ticket-meta">
        <span>${escapeHtml(ticket.ticketType || "Support")}</span>
        <span>${formatNumber(ticket.messageCount)} messages</span>
      </span>
    </span>
    <span class="row-action">Transcript</span>
  </a>
`;

const loadDashboard = async () => {
  if (!dashboardRoot) return;

  const guildId = getDashboardGuildId();
  const guildTitle = document.querySelector("[data-dashboard-guild]");
  const statusText = document.querySelector("[data-dashboard-status]");
  const openList = document.querySelectorAll("[data-open-tickets]");
  const transcriptList = document.querySelectorAll("[data-transcripts]");

  if (!isDashboardRoute && window.location.pathname.startsWith("/dashboard/")) {
    dashboardRoot.scrollIntoView({ block: "start" });
  }

  try {
    const response = await fetch(`/api/dashboard/${guildId}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Dashboard API ${response.status}`);
    const data = await response.json();

    if (guildTitle) guildTitle.textContent = `${data.guild?.name || "DragonsHosting"} network dashboard`;
    if (statusText) {
      statusText.textContent = data.ready
        ? `Live updated at ${formatDate(data.generatedAt)}. Tickets and transcripts are active.`
        : "Owner dashboard active. Tickets and transcripts remain visible.";
    }

    const openTickets = Number(data.stats?.openTickets || 0);
    const closedTranscripts = Number(data.stats?.closedTranscripts || 0);

    setTextAll("[data-stat-total]", formatNumber(openTickets + closedTranscripts));
    setTextAll("[data-stat-open]", formatNumber(openTickets));
    setTextAll("[data-stat-closed]", formatNumber(closedTranscripts));
    setTextAll("[data-stat-messages]", formatNumber(data.stats?.transcriptMessages));
    setTextAll("[data-stat-last]", formatDate(data.stats?.lastTranscriptAt));
    setTextAll("[data-open-count]", `${formatNumber(data.stats?.openTickets)} open`);
    setTextAll("[data-closed-count]", `${formatNumber(data.stats?.closedTranscripts)} saved`);

    renderRows(openList, data.openTickets || [], "No open ticket channels found.", ticketRow);
    renderRows(transcriptList, (data.transcripts || []).slice(0, 40), "No transcript files found.", transcriptRow);
  } catch (error) {
    if (statusText) statusText.textContent = "Owner dashboard active. Live ticket data could not be loaded.";
    renderRows(openList, [], "Open tickets could not be loaded.", ticketRow);
    renderRows(transcriptList, [], "Transcripts could not be loaded.", transcriptRow);
    console.error(error);
  }
};

setDashboardView(getDashboardViewFromPath(), window.location.pathname);
loadDashboard();
