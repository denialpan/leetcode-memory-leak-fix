"use strict";

const DEFAULTS = {
  enabled: true,
  idleReload: true,
  discardHiddenTabs: true,
  minSessionMinutes: 45,
  idleMinutes: 3,
  hiddenDiscardMinutes: 20,
  jankScoreThreshold: 18,
  maxReloadsPerTab: 4,
  cooldownMinutes: 12
};

const ids = Object.keys(DEFAULTS);
const statusEl = document.getElementById("status");

restore();

for (const id of ids) {
  document.getElementById(id).addEventListener("change", save);
}

async function restore() {
  const options = await browser.storage.local.get(DEFAULTS);
  for (const id of ids) {
    const input = document.getElementById(id);
    if (input.type === "checkbox") {
      input.checked = Boolean(options[id]);
    } else {
      input.value = Number(options[id]);
    }
  }
}

async function save() {
  const options = {};
  for (const id of ids) {
    const input = document.getElementById(id);
    options[id] = input.type === "checkbox" ? input.checked : Number(input.value);
  }

  await browser.storage.local.set(options);
  statusEl.textContent = "Saved";
  setTimeout(() => {
    statusEl.textContent = "";
  }, 1200);
}
