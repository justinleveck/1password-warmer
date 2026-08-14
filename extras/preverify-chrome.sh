#!/bin/bash
# Pre-pays the post-update signature toll: after Chrome's updater stages a new
# binary, 1Password's next native-messaging handshake makes macOS hash the
# entire ~1GB framework with cold caches — a 20-40s stall that lands on
# whoever clicks the extension first. Hashing it here, in the background at
# low priority, turns that stall into a cache hit.
nice -n 19 /usr/bin/codesign --verify --deep "/Applications/Google Chrome.app"
