const ONE_PASSWORD_POPUP = 'chrome-extension://aeblfdkhhhdcdjpifhhbdiojplfjncoa/popup/index.html'
const REWARM_MINUTES = 30

async function findWarmTab() {
  const tabs = await chrome.tabs.query({})
  return tabs.find(tab => tab.url && tab.url.startsWith(ONE_PASSWORD_POPUP))
}

async function openHiddenWarmWindow() {
  try {
    await chrome.windows.create({ url: ONE_PASSWORD_POPUP, state: 'minimized', focused: false })
  } catch (error) {
    // Some Chrome versions refuse cross-extension URLs at window creation;
    // fall back to creating the window empty and navigating the tab into it.
    const fallback = await chrome.windows.create({ state: 'minimized', focused: false })
    await chrome.tabs.update(fallback.tabs[0].id, { url: ONE_PASSWORD_POPUP })
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
}

chrome.runtime.onInstalled.addListener(ensureWarm)
chrome.runtime.onStartup.addListener(ensureWarm)

chrome.alarms.create('rewarm', { periodInMinutes: REWARM_MINUTES })
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'rewarm') ensureWarm()
})
