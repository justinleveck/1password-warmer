const ONE_PASSWORD_POPUP = 'chrome-extension://aeblfdkhhhdcdjpifhhbdiojplfjncoa/popup/index.html'
// Chrome freezes hidden pages after ~5 minutes and V8 then flushes compiled
// code that hasn't executed recently — the warm instance quietly goes cold.
// Reloading inside that window keeps the code perpetually "recently used".
const REWARM_MINUTES = 4

async function findWarmTab() {
  const tabs = await chrome.tabs.query({})
  return tabs.find(tab => tab.url && tab.url.startsWith(ONE_PASSWORD_POPUP))
}

async function openHiddenWarmWindow() {
  // A window can't be born minimized reliably (macOS ignores the state), so
  // shrink the flash instead: a tiny popup-type window tucked in the screen
  // corner, minimized right after creation. The 1Password URL goes in at
  // creation time — navigating a blank window afterward proved fragile
  // (windows.create can resolve without tabs populated) and a page that
  // loads fully hidden skips paint-time boot work, leaving it half-warm.
  const warmWindow = await createCornerWindow()
  await chrome.windows.update(warmWindow.id, { state: 'minimized' })
}

async function createCornerWindow() {
  const shape = { type: 'popup', focused: false, width: 250, height: 100 }
  try {
    // Oversized coordinates get clamped to the nearest screen edge, tucking
    // the brief flash into the bottom-right corner.
    return await chrome.windows.create({ ...shape, url: ONE_PASSWORD_POPUP, left: 20000, top: 20000 })
  } catch (error) {
    return await chrome.windows.create({ ...shape, url: ONE_PASSWORD_POPUP })
  }
}

async function minimizeIfEscaped(warmTab) {
  // Only minimize a window that holds nothing but the warm tab — if the tab
  // ever ends up in a window the user actually uses, leave that window alone.
  const warmWindow = await chrome.windows.get(warmTab.windowId, { populate: true })
  if (warmWindow.tabs.length === 1 && warmWindow.state !== 'minimized') {
    await chrome.windows.update(warmWindow.id, { state: 'minimized' })
  }
}

async function ensureWarm() {
  const warmTab = await findWarmTab()
  if (!warmTab) {
    await openHiddenWarmWindow()
    return
  }
  // Reload on every tick: revives a tab Memory Saver discarded, and
  // re-executing the scripts keeps 1Password's compiled code at the
  // front of Chrome's code-cache LRU.
  await chrome.tabs.reload(warmTab.id)
  await minimizeIfEscaped(warmTab)
}

chrome.runtime.onInstalled.addListener(ensureWarm)
chrome.runtime.onStartup.addListener(ensureWarm)

chrome.alarms.create('rewarm', { periodInMinutes: REWARM_MINUTES })
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'rewarm') ensureWarm()
})

// Alarms don't fire while the machine sleeps, so the instance can be cold at
// the exact moment the user sits back down — rewarm as soon as they return.
chrome.idle.onStateChanged.addListener(state => {
  if (state === 'active') ensureWarm()
})
