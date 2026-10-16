(function () {
  "use strict";

  const config = window.USAPLATES;
  const PERSON_KEY = "usaplates_person";
  const RETRY_DELAY_MS = 2000;

  const personButtons = document.querySelectorAll(".person-btn");
  const backdrop = document.getElementById("modal-backdrop");
  const closeBtn = document.getElementById("modal-close");
  const plateState = document.getElementById("modal-plate-state");
  const stateNameEl = document.getElementById("modal-state-name");
  const checkEl = document.getElementById("check-el");
  const checkElla = document.getElementById("check-ella");
  const datesBox = document.getElementById("modal-dates");
  const dateFirst = document.getElementById("date-first");
  const dateLast = document.getElementById("date-last");
  const emptyMsg = document.getElementById("modal-empty");
  const loadingMsg = document.getElementById("modal-loading");

  let statusByCode = {};
  let nameByCode = {};
  let currentCode = null;
  let currentDetail = null;
  // Every request gets an increasing number. latestSeqByCode is the newest
  // detail/write request per state (only its response may fill the modal);
  // appliedSeqByCode is the newest response already painted on the map, so an
  // older response (detail or full list) never overwrites newer data.
  let requestSeq = 0;
  const latestSeqByCode = {};
  const appliedSeqByCode = {};
  // Unconfirmed mark/unmark per state, so list refreshes and reopening the
  // modal don't show data read before the write was committed.
  const pendingWrites = new Map();

  const dateFormatter = new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  function getPerson() {
    return localStorage.getItem(PERSON_KEY) || "el";
  }

  function setPerson(person) {
    localStorage.setItem(PERSON_KEY, person);
    personButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.person === person);
    });
  }

  personButtons.forEach((btn) => {
    btn.addEventListener("click", () => setPerson(btn.dataset.person));
  });

  function applyMapStatus(code, status, seq) {
    if ((appliedSeqByCode[code] || 0) > seq) return;
    appliedSeqByCode[code] = seq;
    statusByCode[code] = status;
  }

  function fetchStates() {
    const seq = ++requestSeq;
    return fetch(config.apiStatesUrl, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then((states) => {
        states.forEach((s) => {
          nameByCode[s.code] = s.name;
          if (!pendingWrites.has(s.code)) applyMapStatus(s.code, s.status, seq);
        });
        window.USAPLATESMap.updateStatuses(statusByCode);
      });
  }

  function stateDetailUrl(code) {
    return config.apiStateDetailUrl.replace("__CODE__", code);
  }

  function sightingUrl(code, person) {
    return config.apiSightingUrl.replace("__CODE__", code).replace("__PERSON__", person);
  }

  function setChecksEnabled(enabled) {
    checkEl.disabled = !enabled;
    checkElla.disabled = !enabled;
  }

  function showLoading() {
    currentDetail = null;
    checkEl.checked = false;
    checkElla.checked = false;
    setChecksEnabled(false);
    datesBox.hidden = true;
    emptyMsg.hidden = true;
    loadingMsg.hidden = false;
  }

  function renderDetail(detail) {
    currentDetail = detail;
    checkEl.checked = detail.him.seen;
    checkElla.checked = detail.her.seen;
    setChecksEnabled(true);
    loadingMsg.hidden = true;

    if (detail.first_seen) {
      datesBox.hidden = false;
      emptyMsg.hidden = true;
      dateFirst.textContent = dateFormatter.format(new Date(detail.first_seen));
      dateLast.textContent = dateFormatter.format(new Date(detail.last_modified));
    } else {
      datesBox.hidden = true;
      emptyMsg.hidden = false;
    }
  }

  // Runs a request for a state and applies its response only if it is still
  // the latest one for that state (map) and that state is still open (modal).
  function requestDetail(code, url, options) {
    const seq = ++requestSeq;
    latestSeqByCode[code] = seq;

    return fetch(url, Object.assign({ cache: "no-store" }, options))
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then((detail) => {
        applyMapStatus(code, detail.status, seq);
        window.USAPLATESMap.updateStatuses(statusByCode);
        if (latestSeqByCode[code] === seq && currentCode === code) renderDetail(detail);
      })
      .catch(() => {
        // Resync with the server so the modal never shows unconfirmed data.
        setTimeout(() => {
          if (latestSeqByCode[code] !== seq || currentCode !== code) return;
          requestDetail(code, stateDetailUrl(code));
        }, RETRY_DELAY_MS);
      });
  }

  function openModal(code, name) {
    currentCode = code;
    plateState.textContent = name;
    stateNameEl.textContent = name;
    showLoading();
    backdrop.hidden = false;

    // If a mark/unmark for this state is still in flight, read after it lands.
    (pendingWrites.get(code) || Promise.resolve()).then(() => {
      if (currentCode === code) requestDetail(code, stateDetailUrl(code));
    });
  }

  function closeModal() {
    backdrop.hidden = true;
    currentCode = null;
  }

  // Unmarking deletes the sighting and its first-seen date for good, so it
  // needs an explicit confirmation.
  function confirmUnmark(person) {
    const sighting = person === "el" ? currentDetail.him : currentDetail.her;
    const who = person === "el" ? "él" : "ella";
    const since = sighting.first_seen
      ? " (" + dateFormatter.format(new Date(sighting.first_seen)) + ")"
      : "";
    return window.confirm(
      `¿Desmarcar que ${who} vio la patente de ${stateNameEl.textContent}?\n\n` +
        `Se borrará la fecha en que ${who} la vio por primera vez${since} y no se podrá recuperar.`
    );
  }

  function toggleSighting(checkbox, person) {
    const code = currentCode;
    if (!code || !currentDetail) return;
    const seen = checkbox.checked;
    if (!seen && !confirmUnmark(person)) {
      checkbox.checked = true;
      return;
    }
    // Block further clicks until the server confirms, so requests for the
    // same state can't be processed out of order.
    setChecksEnabled(false);
    const write = requestDetail(code, sightingUrl(code, person), {
      method: seen ? "PUT" : "DELETE",
    });
    pendingWrites.set(code, write);
    write.then(() => {
      if (pendingWrites.get(code) === write) pendingWrites.delete(code);
    });
  }

  checkEl.addEventListener("change", () => toggleSighting(checkEl, "el"));
  checkElla.addEventListener("change", () => toggleSighting(checkElla, "ella"));

  // Pick up changes made from the other phone when coming back to the app.
  function refresh() {
    fetchStates().catch(() => {});
    if (currentCode && currentDetail && !pendingWrites.has(currentCode)) {
      requestDetail(currentCode, stateDetailUrl(currentCode));
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) refresh();
  });

  closeBtn.addEventListener("click", closeModal);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !backdrop.hidden) closeModal();
  });

  setPerson(getPerson());

  Promise.all([
    window.USAPLATESMap.init({
      onStateClick: (code) => openModal(code, nameByCode[code] || code),
    }),
    fetchStates(),
  ]).then(() => window.USAPLATESMap.updateStatuses(statusByCode));
})();
