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

const tabState = new Map();

browser.alarms.create("watchdogTick", { periodInMinutes: 1 });

browser.runtime.onInstalled.addListener(async () => {
  const stored = await browser.storage.local.get(Object.keys(DEFAULTS));
  const missing = {};
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (stored[key] === undefined) {
      missing[key] = value;
    }
  }
  if (Object.keys(missing).length) {
    await browser.storage.local.set(missing);
  }
});

browser.runtime.onMessage.addListener((message, sender) => {
  if (!sender.tab || !message || message.type !== "leetcode-watchdog:metrics") {
    return;
  }

  const tabId = sender.tab.id;
  const previous = tabState.get(tabId) || {};
  tabState.set(tabId, {
    ...previous,
    ...message.metrics,
    tabId,
    url: sender.tab.url || previous.url || "",
    title: sender.tab.title || previous.title || "",
    lastSeenAt: Date.now(),
    reloadCount: previous.reloadCount || 0,
    lastReloadAt: previous.lastReloadAt || 0
  });

  updateBadge(tabId, message.metrics);
});

browser.tabs.onRemoved.addListener((tabId) => {
  tabState.delete(tabId);
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading") {
    const previous = tabState.get(tabId);
    tabState.set(tabId, {
      reloadCount: previous ? previous.reloadCount || 0 : 0,
      lastReloadAt: previous ? previous.lastReloadAt || 0 : 0,
      tabId,
      url: tab.url || "",
      lastSeenAt: Date.now()
    });
    browser.browserAction.setBadgeText({ tabId, text: "" }).catch(() => {});
  }
});

browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "watchdogTick") {
    return;
  }

  const options = await browser.storage.local.get(DEFAULTS);
  if (!options.enabled) {
    return;
  }

  const now = Date.now();
  for (const [tabId, state] of tabState.entries()) {
    if (!state.url || !state.url.includes("leetcode.com")) {
      continue;
    }

    const tab = await getTab(tabId);
    if (!tab) {
      tabState.delete(tabId);
      continue;
    }

    if (shouldDiscard(tab, state, options, now)) {
      await browser.tabs.discard(tabId).catch(() => {});
      continue;
    }

    if (shouldReload(tab, state, options, now)) {
      await browser.tabs.reload(tabId, { bypassCache: false }).catch(() => {});
      tabState.set(tabId, {
        ...state,
        reloadCount: (state.reloadCount || 0) + 1,
        lastReloadAt: now
      });
    }
  }
});

function shouldReload(tab, state, options, now) {
  if (!options.idleReload || tab.active || state.visibilityState === "visible") {
    return false;
  }

  const sessionAge = now - (state.sessionStartedAt || state.lastSeenAt || now);
  const idleAge = now - (state.lastActivityAt || now);
  const cooldownAge = now - (state.lastReloadAt || 0);
  const reloadCount = state.reloadCount || 0;

  return sessionAge >= minutes(options.minSessionMinutes) &&
    idleAge >= minutes(options.idleMinutes) &&
    cooldownAge >= minutes(options.cooldownMinutes) &&
    reloadCount < options.maxReloadsPerTab &&
    Number(state.jankScore || 0) >= Number(options.jankScoreThreshold || 0);
}

function shouldDiscard(tab, state, options, now) {
  if (!options.discardHiddenTabs || tab.active || tab.discarded) {
    return false;
  }

  const hiddenAge = now - (state.hiddenSince || state.lastActivityAt || state.lastSeenAt || now);
  const sessionAge = now - (state.sessionStartedAt || state.lastSeenAt || now);

  return hiddenAge >= minutes(options.hiddenDiscardMinutes) &&
    sessionAge >= minutes(options.minSessionMinutes);
}

function minutes(value) {
  return Number(value || 0) * 60 * 1000;
}

async function getTab(tabId) {
  try {
    return await browser.tabs.get(tabId);
  } catch (_) {
    return null;
  }
}

function updateBadge(tabId, metrics) {
  const score = Number(metrics.jankScore || 0);
  const text = score >= DEFAULTS.jankScoreThreshold ? "J" : "";
  const color = score >= DEFAULTS.jankScoreThreshold ? "#b3261e" : "#2f7d32";

  browser.browserAction.setBadgeText({ tabId, text }).catch(() => {});
  browser.browserAction.setBadgeBackgroundColor({ tabId, color }).catch(() => {});
}
