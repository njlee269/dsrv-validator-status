/**
 * Hash-based SPA router for DSRV Dashboard.
 * Shows/hides page sections and highlights the active sidebar link.
 */
(function () {
  const PAGES = [
    "dashboard",
    "potential-partners",
    "simulation",
    "infra-costs",
    "net-revenue",
    "competitors",
  ];

  const pageInitCallbacks = {};

  window.registerPageInit = function (page, fn) {
    if (!pageInitCallbacks[page]) pageInitCallbacks[page] = [];
    pageInitCallbacks[page].push(fn);
  };

  function navigate() {
    let hash = (location.hash || "#dashboard").replace("#", "");
    if (!PAGES.includes(hash)) hash = "dashboard";

    PAGES.forEach((p) => {
      const section = document.getElementById("page-" + p);
      if (section) section.classList.toggle("active", p === hash);
    });

    document.querySelectorAll(".sidebar-link").forEach((link) => {
      link.classList.toggle("active", link.getAttribute("data-page") === hash);
    });

    if (pageInitCallbacks[hash]) {
      pageInitCallbacks[hash].forEach((fn) => fn());
      delete pageInitCallbacks[hash];
    }
  }

  window.addEventListener("hashchange", navigate);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", navigate);
  } else {
    navigate();
  }
})();
