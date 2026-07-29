(function () {
  "use strict";

  const config = window.USAPLATES;
  const PERSON_KEY = "usaplates_person";

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

  let statusByCode = {};
  let nameByCode = {};
  let currentCode = null;

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

  function renderDetail(detail) {
    checkEl.checked = detail.him.seen;
    checkElla.checked = detail.her.seen;

    if (detail.first_seen) {
      datesBox.hidden = false;
      emptyMsg.hidden = true;
      dateFirst.textContent = dateFormatter.format(new Date(detail.first_seen));
      dateLast.textContent = dateFormatter.format(new Date(detail.last_modified));
    } else {
      datesBox.hidden = true;
      emptyMsg.hidden = false;
    }

    statusByCode[detail.code] = detail.status;
    window.USAPLATESMap.updateStatuses(statusByCode);
  }

  function openModal(code, name) {
    currentCode = code;
    plateState.textContent = name;
    stateNameEl.textContent = name;
    backdrop.hidden = false;

    fetch(stateDetailUrl(code))
      .then((r) => r.json())
      .then(renderDetail);
  }

  function closeModal() {
    backdrop.hidden = true;
    currentCode = null;
  }

  function toggleSighting(person, seen) {
    if (!currentCode) return;
    const url = sightingUrl(currentCode, person);
    const request = seen
      ? fetch(url, { method: "PUT" })
      : fetch(url, { method: "DELETE" });

    request
      .then((r) => r.json())
      .then(renderDetail);
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
  ]);
})();
