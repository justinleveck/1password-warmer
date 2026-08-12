#!/bin/zsh
# Pre-hash the freshly-updated Chrome bundle so macOS's kernel signature
# cache is warm before 1Password's native helper verifies the browser.
# Without this, the first 1Password use after a Chrome update can stall
# 30-40 seconds while the kernel hashes the ~1GB framework on demand.
codesign --verify --deep "/Applications/Google Chrome.app" 2>/dev/null
exit 0
