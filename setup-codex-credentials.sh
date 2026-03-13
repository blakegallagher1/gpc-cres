#!/usr/bin/env bash
# setup-codex-credentials.sh
# Adds Codex production credentials to ~/.zshrc
# Run once: bash setup-codex-credentials.sh && source ~/.zshrc

set -euo pipefail

MARKER="# --- Codex Production Credentials ---"

if grep -qF "$MARKER" ~/.zshrc 2>/dev/null; then
  echo "⚠️  Codex credentials block already exists in ~/.zshrc"
  echo "   Remove the existing block first if you want to re-add."
  exit 1
fi

cat >> ~/.zshrc << 'CREDENTIALS'

# --- Codex Production Credentials ---
export CF_ACCESS_CLIENT_ID="1d421d02a1ba42a13cf3bce14e457db7.access"
export CF_ACCESS_CLIENT_SECRET="33541f79acf221e041993e2e28034a081621f36f94b79cc954588081131305b7"
export ADMIN_API_KEY="v6g5qQQ24nkD2ihhg_vxtZ7Fnj0B0lKh5lErdb57Tfo"
export LOCAL_API_KEY="Y9DgsDrlvfDfitSgfp0YtLwjlvY5ocKnYA_4X11tfkc"
export AUTH_SECRET="wMSHcJuTOMRX0MjBjZ7StSxiq8AO+3n4bPt2RBK+ge0="
export NEXTAUTH_SECRET="wMSHcJuTOMRX0MjBjZ7StSxiq8AO+3n4bPt2RBK+ge0="
CREDENTIALS

echo "✅ Codex credentials added to ~/.zshrc"
echo "   Run: source ~/.zshrc"
echo ""
echo "Verification:"
source ~/.zshrc
env | grep -E 'CF_ACCESS|ADMIN_API|LOCAL_API|AUTH_SECRET|NEXTAUTH_SECRET' | sed 's/=.*/=****/'
