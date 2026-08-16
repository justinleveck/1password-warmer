const ONE_PASSWORD_POPUP = 'chrome-extension://aeblfdkhhhdcdjpifhhbdiojplfjncoa/popup/index.html'

function relative(ts) {
  const seconds = Math.round((Date.now() - ts) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`
  return `${Math.round(seconds / 86400)}d ago`
}

async function render() {
  const status = document.getElementById('status')
  const tabs = await chrome.tabs.query({})
  const warmTabs = tabs.filter(tab => tab.url && tab.url.startsWith(ONE_PASSWORD_POPUP))

  if (warmTabs.length === 1) {
    const warmWindow = await chrome.windows.get(warmTabs[0].windowId)
    const discarded = warmTabs[0].discarded ? ', discarded — next tick revives it' : ''
    status.textContent = `Warm tab alive (window ${warmWindow.state}${discarded})`
    status.className = 'ok'
  } else if (warmTabs.length === 0) {
    status.textContent = 'No warm tab — next tick will create one'
    status.className = 'bad'
  } else {
    status.textContent = `${warmTabs.length} warm tabs — sweep pending`
    status.className = 'warn'
  }

  const { events = [] } = await chrome.storage.local.get('events')
  const list = document.getElementById('log')
  list.innerHTML = ''
  for (const entry of [...events].reverse()) {
    const item = document.createElement('li')
    if (entry.event === 'error') item.className = 'error'
    const detail = Object.entries(entry)
      .filter(([key]) => key !== 'at' && key !== 'event')
      .map(([key, value]) => `${key}=${value}`)
      .join(' ')
    item.textContent = `${relative(entry.at)} — ${entry.event}${detail ? ` (${detail})` : ''}`
    list.append(item)
  }
}

document.getElementById('rewarm').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ rewarm: true })
  render()
})

document.getElementById('clear').addEventListener('click', async () => {
  await chrome.storage.local.set({ events: [] })
  render()
})

render()
