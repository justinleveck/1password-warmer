const ONE_PASSWORD_POPUP = 'chrome-extension://aeblfdkhhhdcdjpifhhbdiojplfjncoa/popup/index.html'
const REWARM_MINUTES = 30

async function findWarmTab() {
  const tabs = await chrome.tabs.query({})
  return tabs.find(tab => tab.url && tab.url.startsWith(ONE_PASSWORD_POPUP))
}

async function openHiddenWarmWindow() {
  // A window can't be born minimized reliably (macOS ignores the state), so
  // shrink the flash instead: a tiny blank popup-type window tucked in the
  // screen corner, minimized before anything paints, and only then navigated
  // to the 1Password page — the heavy UI loads entirely while hidden.
  const warmWindow = await createCornerWindow()
  await chrome.windows.update(warmWindow.id, { state: 'minimized' })
  await chrome.tabs.update(warmWindow.tabs[0].id, { url: ONE_PASSWORD_POPUP })
}

async function createCornerWindow() {
  const shape = { type: 'popup', focused: false, width: 250, height: 100 }
  try {
    // Oversized coordinates get clamped to the nearest screen edge, tucking
    // the one visible frame into the bottom-right corner.
    return await chrome.windows.create({ ...shape, left: 20000, top: 20000 })
  } catch (error) {
    return await chrome.windows.create(shape)
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
