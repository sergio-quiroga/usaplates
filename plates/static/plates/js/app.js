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
  // Last request issued per state code. Responses from older requests are
  // ignored so a slow response never overwrites newer data.
  let requestSeq = 0;
  const latestSeqByCode = {};

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

  function fetchStates() {
    return fetch(config.apiStatesUrl)
      .then((r) => r.json())
      .then((states) => {
        statusByCode = {};
        nameByCode = {};
        states.forEach((s) => {
          statusByCode[s.code] = s.status;
          nameByCode[s.code] = s.name;
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
    checkEl.checked = false;
    checkElla.checked = false;
    setChecksEnabled(false);
    datesBox.hidden = true;
    emptyMsg.hidden = true;
    loadingMsg.hidden = false;
  }

  function renderDetail(detail) {
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
        if (latestSeqByCode[code] !== seq) return;
        statusByCode[detail.code] = detail.status;
        window.USAPLATESMap.updateStatuses(statusByCode);
        if (currentCode === code) renderDetail(detail);
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

    requestDetail(code, stateDetailUrl(code));
  }

  function closeModal() {
    backdrop.hidden = true;
    currentCode = null;
  }

  function toggleSighting(person, seen) {
    if (!currentCode) return;
    // Block further clicks until the server confirms, so requests for the
    // same state can't be processed out of order.
    setChecksEnabled(false);
    requestDetail(currentCode, sightingUrl(currentCode, person), {
      method: seen ? "PUT" : "DELETE",
    });
  }

  checkEl.addEventListener("change", () => toggleSighting("el", checkEl.checked));
  checkElla.addEventListener("change", () => toggleSighting("ella", checkElla.checked));

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
