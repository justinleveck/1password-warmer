#!/bin/bash
# One-shot health report for the 1Password warmer stack.
CHROME_DIR="$HOME/Library/Application Support/Google/Chrome"
EXTENSION_ID="aeblfdkhhhdcdjpifhhbdiojplfjncoa"

section() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

section "Chrome: disk vs running"
disk=$(defaults read "/Applications/Google Chrome.app/Contents/Info.plist" CFBundleShortVersionString)
running=$(python3 -c "import json; print(json.load(open('$CHROME_DIR/Local State'))['user_experience_metrics']['stability']['stats_version'].removesuffix('-64'))" 2>/dev/null)
echo "disk: $disk   running: ${running:-unknown}"
if [ "$disk" = "$running" ]; then
  echo "OK — no pending relaunch"
else
  echo "WARN — update staged; relaunch Chrome (toll pre-paid if the agent log below shows a recent run)"
fi

section "1Password app"
defaults read /Applications/1Password.app/Contents/Info.plist CFBundleShortVersionString
stat -f "bundle modified: %Sm" /Applications/1Password.app

section "1Password extension per profile (skew vs app version above = suspect)"
for profile in "$CHROME_DIR"/Profile\ *; do
  version=$(ls "$profile/Extensions/$EXTENSION_ID" 2>/dev/null | tail -1)
  [ -n "$version" ] && echo "${profile##*/}: ${version%_0}"
done

section "Native helper connections (ages under a few minutes = churn)"
pids=$(pgrep -f "1Password-BrowserSupport" | tr '\n' ',' | sed 's/,$//')
[ -n "$pids" ] && ps -o etime=,command= -p "$pids" | cut -c1-80 || echo "none running"

section "DiskCacheSize policy"
defaults read com.google.Chrome DiskCacheSize 2>/dev/null || echo "not set — code caches at default caps"

section "WASM code caches"
du -sh "$HOME/Library/Caches/Google/Chrome/Profile "*/Code\ Cache/wasm 2>/dev/null || echo "none found"

section "Pre-verify agent"
launchctl list 2>/dev/null | grep -q preverify && echo "loaded" || echo "NOT loaded"
tail -6 "$HOME/Library/Logs/onepassword-warmer.log" 2>/dev/null

section "Memory"
memory_pressure -Q 2>/dev/null | tail -1
sysctl vm.swapusage | cut -d: -f2
