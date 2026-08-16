#!/bin/bash
# Pre-pays the post-update signature toll. After an updater replaces either
# binary on disk, the next 1Password<->browser handshake makes macOS hash the
# changed bundle with cold caches — a 20-40s stall that lands on whoever
# clicks the extension first. Hashing here, in the background at low
# priority, turns that stall into a cache hit. Chrome updates hit the
# browser-verification path; 1Password app updates hit the same wall from
# the other side, so both bundles are covered.
for app in "/Applications/Google Chrome.app" "/Applications/1Password.app"; do
  nice -n 19 /usr/bin/codesign --verify --deep "$app"
done
