const ONE_PASSWORD_POPUP = 'chrome-extension://aeblfdkhhhdcdjpifhhbdiojplfjncoa/popup/index.html'
const REWARM_MINUTES = 30

async function findWarmTab() {
  const tabs = await chrome.tabs.query({})
  return tabs.find(tab => tab.url && tab.url.startsWith(ONE_PASSWORD_POPUP))
}

async function openHiddenWarmWindow() {
  // Asking for state: 'minimized' at creation is unreliable on macOS — the
  // window can appear normally anyway. Create it small and unfocused, then
  // force-minimize, which works everywhere.
  let warmWindow
  try {
    warmWindow = await chrome.windows.create({
      url: ONE_PASSWORD_POPUP,
      focused: false,
      width: 320,
      height: 200
    })
  } catch (error) {
    // Some Chrome versions refuse cross-extension URLs at window creation;
    // fall back to creating the window empty and navigating the tab into it.
    warmWindow = await chrome.windows.create({ focused: false, width: 320, height: 200 })
    await chrome.tabs.update(warmWindow.tabs[0].id, { url: ONE_PASSWORD_POPUP })
  }
  await chrome.windows.update(warmWindow.id, { state: 'minimized' })
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
