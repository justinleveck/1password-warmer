const ONE_PASSWORD_ID = 'aeblfdkhhhdcdjpifhhbdiojplfjncoa'
const ONE_PASSWORD_POPUP = `chrome-extension://${ONE_PASSWORD_ID}/popup/index.html`
// Chrome freezes hidden pages after ~5 minutes and V8 then flushes compiled
// code that hasn't executed recently — the warm instance quietly goes cold.
// Reloading inside that window keeps the code perpetually "recently used".
const REWARM_MINUTES = 4
const LOG_LIMIT = 400

async function log(event, detail = {}) {
  const { events = [] } = await chrome.storage.local.get('events')
  events.push({ at: Date.now(), event, ...detail })
  await chrome.storage.local.set({ events: events.slice(-LOG_LIMIT) })
}

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

function ensureWarm(source) {
  warming ??= rewarm(source).finally(() => { warming = null })
  return warming
}

async function rewarm(source) {
  try {
    const [warmTab, ...duplicates] = await findWarmTabs()
    if (duplicates.length) {
      await Promise.all(duplicates.map(duplicate => chrome.tabs.remove(duplicate.id)))
      await log('swept-duplicates', { source, count: duplicates.length })
    }
    if (!warmTab) {
      await openHiddenWarmWindow()
      await log('created-warm-window', { source })
      return
    }
    // Reload on every tick: revives a tab Memory Saver discarded, and
    // re-executing the scripts keeps 1Password's compiled code at the
    // front of Chrome's code-cache LRU.
    await chrome.tabs.reload(warmTab.id)
    await minimizeIfEscaped(warmTab)
    await log('reloaded', { source })
  } catch (error) {
    await log('error', { source, message: String((error && error.message) || error) })
  }
}

chrome.runtime.onInstalled.addListener(() => ensureWarm('warmer-installed'))
chrome.runtime.onStartup.addListener(() => ensureWarm('browser-startup'))

chrome.alarms.create('rewarm', { periodInMinutes: REWARM_MINUTES })
chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== 'rewarm') return
  // Nobody benefits from a warm popup while the user is away — skip the
  // reload and let the return-from-idle listener rewarm on arrival.
  const state = await chrome.idle.queryState(REWARM_MINUTES * 60)
  if (state === 'active') ensureWarm('alarm')
})

// Alarms don't fire while the machine sleeps, so the instance can be cold at
// the exact moment the user sits back down — rewarm as soon as they return.
chrome.idle.onStateChanged.addListener(state => {
  if (state === 'active') ensureWarm('returned-from-idle')
})

// When 1Password itself updates, its pages die and the new bundle has zero
// compiled code anywhere — rewarm at update time so the first click after an
// update doesn't pay the full compile.
chrome.management.onInstalled.addListener(info => {
  if (info.id === ONE_PASSWORD_ID) ensureWarm('1password-updated')
})
chrome.management.onEnabled.addListener(info => {
  if (info.id === ONE_PASSWORD_ID) ensureWarm('1password-enabled')
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.rewarm) {
    ensureWarm('manual').then(() => sendResponse({ done: true }))
    return true
  }
})
