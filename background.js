const ONE_PASSWORD_ID = 'aeblfdkhhhdcdjpifhhbdiojplfjncoa'
const ONE_PASSWORD_POPUP = `chrome-extension://${ONE_PASSWORD_ID}/popup/index.html`
// Chrome freezes hidden pages after ~5 minutes and V8 then flushes compiled
// code that hasn't executed recently — the warm instance quietly goes cold.
// Reloading inside that window keeps the code perpetually "recently used".
const REWARM_MINUTES = 4

async function findWarmTabs() {
  const tabs = await chrome.tabs.query({})
  return tabs.filter(tab => tab.url && tab.url.startsWith(ONE_PASSWORD_POPUP))
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

// Startup, alarm, and idle triggers can fire near-simultaneously; without
// serialization two of them race past the "no warm tab yet" check and each
// create a window.
let warming = null

function ensureWarm() {
  warming ??= rewarm().finally(() => { warming = null })
  return warming
}

async function rewarm() {
  const [warmTab, ...duplicates] = await findWarmTabs()
  await Promise.all(duplicates.map(duplicate => chrome.tabs.remove(duplicate.id)))
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

// When 1Password itself updates, its pages die and the new bundle has zero
// compiled code anywhere — rewarm at update time so the first click after an
// update doesn't pay the full compile.
chrome.management.onInstalled.addListener(info => {
  if (info.id === ONE_PASSWORD_ID) ensureWarm()
})
chrome.management.onEnabled.addListener(info => {
  if (info.id === ONE_PASSWORD_ID) ensureWarm()
})
