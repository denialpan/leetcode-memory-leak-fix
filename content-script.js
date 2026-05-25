"use strict";

const startedAt = Date.now();
let lastActivityAt = Date.now();
let hiddenSince = document.visibilityState === "hidden" ? Date.now() : 0;
let lastFrameAt = performance.now();
let slowFrames = 0;
let verySlowFrames = 0;
let longTasks = 0;
let maxFrameDelay = 0;
let messageCount = 0;

const ACTIVITY_EVENTS = [
  "keydown",
  "pointerdown",
  "pointermove",
  "wheel",
  "input",
  "focus"
];

for (const eventName of ACTIVITY_EVENTS) {
  window.addEventListener(eventName, recordActivity, {
    passive: true,
    capture: true
  });
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    hiddenSince = Date.now();
  } else {
    hiddenSince = 0;
    recordActivity();
  }
});

if ("PerformanceObserver" in window) {
  try {
    const observer = new PerformanceObserver((list) => {
      longTasks += list.getEntries().length;
    });
    observer.observe({ type: "longtask", buffered: true });
  } catch (_) {
    // Firefox support varies by version; frame delay remains the fallback.
  }
}

requestAnimationFrame(trackFrame);
setInterval(sendMetrics, 30000);
sendMetrics();

function recordActivity() {
  lastActivityAt = Date.now();
}

function trackFrame(now) {
  const delay = now - lastFrameAt;
  lastFrameAt = now;

  if (delay > 80) {
    slowFrames += 1;
  }
  if (delay > 250) {
    verySlowFrames += 1;
  }
  if (delay > maxFrameDelay) {
    maxFrameDelay = delay;
  }

  requestAnimationFrame(trackFrame);
}

function sendMetrics() {
  const jankScore = slowFrames + verySlowFrames * 3 + longTasks * 2;
  const now = Date.now();

  browser.runtime.sendMessage({
    type: "leetcode-watchdog:metrics",
    metrics: {
      sessionStartedAt: startedAt,
      lastActivityAt,
      hiddenSince,
      visibilityState: document.visibilityState,
      slowFrames,
      verySlowFrames,
      longTasks,
      maxFrameDelay: Math.round(maxFrameDelay),
      jankScore,
      domNodeCount: document.getElementsByTagName("*").length,
      url: location.href,
      messageCount: ++messageCount,
      sentAt: now
    }
  }).catch(() => {});
}
