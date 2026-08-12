# 1Password Warmer

Make the 1Password Chrome extension popup open **instantly** instead of taking 3–5 seconds.

## The problem

The 1Password browser extension is a full application — a ~46MB bundle with a
Rust→WASM core. Chrome destroys extension popup pages the moment they close, so
every click on the toolbar icon cold-boots that entire app: parse, compile,
instantiate, render. On top of that, Chrome's disk code caches (where compiled
JS bytecode and WASM machine code live) have small hard-coded caps — roughly
320MB for JS and 480MB for WASM. Heavy browsing keeps those caches full, so
1Password's compiled core is constantly evicted and the next click pays the
full recompile.

The result: click the icon, wait 3–5 seconds, every time.

## The trick

Chrome runs **all pages of an extension in one shared renderer process with one
V8 isolate**. If any 1Password page is alive anywhere — even in a window you
never see — clicking the toolbar icon joins that already-running process, where
the core is already compiled in memory. No cold boot.

This extension:

1. Opens the 1Password popup page in a separate Chrome window created directly
   in the **minimized** state — it never appears on screen and takes no
   tab-strip space.
2. Reloads it every 4 minutes. Chrome freezes hidden pages after ~5 minutes
   and V8 then flushes compiled code that hasn't run recently, which silently
   turns the warm instance cold again — re-executing inside that window keeps
   the code perpetually "recently used" (and revives the tab if Memory Saver
   discarded it).
3. Rewarms immediately when the system returns from idle, since alarms don't
   fire while the machine sleeps.
4. Rewarms the moment the 1Password extension itself updates — a new bundle
   has zero compiled code anywhere, so the update toll gets paid in the hidden
   window instead of on your next click.
5. Recreates the hidden window automatically if it's ever closed, and on every
   browser startup.

## Install

1. Clone or download this repo.
2. Open `chrome://extensions`, enable **Developer mode** (top right).
3. Click **Load unpacked** and select the repo folder.
4. Repeat per Chrome profile you use 1Password in.

That's it. The next icon click after the hidden window loads should be instant.

## Configuration

Two constants at the top of [background.js](background.js):

- `ONE_PASSWORD_POPUP` — the page to keep warm. The default is the Chrome Web
  Store 1Password extension (`aeblfdkhhhdcdjpifhhbdiojplfjncoa`). The same
  trick works for **any** heavy extension: point this at its popup page
  (find the path in the extension's `manifest.json` under `action.default_popup`).
- `REWARM_MINUTES` — reload cadence. Keep it under 5: that's when Chrome
  freezes hidden pages and V8 starts flushing their compiled code.

## Bonus: raise Chrome's code-cache caps (macOS)

Independent of this extension, you can lift the hard-coded code-cache caps via
Chrome's `DiskCacheSize` policy so compiled code survives longer on disk:

```bash
defaults write com.google.Chrome DiskCacheSize -int 2000000000
```

The value flows into the HTTP cache **and** each code cache as its new cap
(~2GB each; must stay under 2^31). Side effect: Chrome shows "Managed by your
organization" because a policy is set — that's cosmetic. Revert with:

```bash
defaults delete com.google.Chrome DiskCacheSize
```

## Bonus: pre-pay the post-Chrome-update stall (macOS)

When Chrome updates, the first 1Password use afterward can stall 30–40
seconds: 1Password's native helper verifies the browser's code signature, and
macOS must hash the entire ~1GB framework of the brand-new binary on demand.

The [extras](extras/) folder has a launchd agent that watches Chrome's
framework directory and runs `codesign --verify --deep` in the background the
moment an update lands, so the kernel's signature cache is already warm before
you click anything:

```bash
sed "s|REPLACE_WITH_ABSOLUTE_PATH|$(pwd)|" extras/com.onepassword-warmer.chrome-signature-prewarm.plist \
  > ~/Library/LaunchAgents/com.onepassword-warmer.chrome-signature-prewarm.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.onepassword-warmer.chrome-signature-prewarm.plist
```

Run from the repo root. Uninstall with `launchctl bootout` and delete the plist.

## Caveats

- Requires Developer mode for unpacked extensions; Chrome occasionally shows a
  small reminder badge about that.
- The hidden window is visible in Mission Control and Chrome's Window menu.
  That's the cost of "invisible" — Chrome has no truly headless tabs.

## Disclaimer

Not affiliated with, endorsed by, or supported by 1Password / AgileBits Inc.
"1Password" is a trademark of AgileBits Inc. This project just keeps their
excellent extension warm.

## License

[MIT](LICENSE)
