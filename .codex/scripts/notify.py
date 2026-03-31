#!/usr/bin/env python3
"""
Codex notification handler — triggers macOS desktop notifications
on agent-turn-complete events via terminal-notifier or osascript.

Install: brew install terminal-notifier  (preferred, supports click-to-activate)
Fallback: osascript (built-in, no click action)

Wired via config.toml:
  notify = ["python3", ".codex/scripts/notify.py"]
"""

import json
import shutil
import subprocess
import sys


def notify_terminal_notifier(title: str, message: str, thread_id: str) -> None:
    """Send notification via terminal-notifier (supports click-to-activate)."""
    cmd = [
        "terminal-notifier",
        "-title", title,
        "-message", message,
        "-group", f"codex-{thread_id}",
        "-sound", "default",
        "-activate", "com.googlecode.iterm2",
    ]
    subprocess.run(cmd, capture_output=True, timeout=5)


def notify_osascript(title: str, message: str) -> None:
    """Fallback: send notification via osascript (always available on macOS)."""
    script = f'display notification "{message}" with title "{title}" sound name "default"'
    subprocess.run(["osascript", "-e", script], capture_output=True, timeout=5)


def main() -> int:
    if len(sys.argv) < 2:
        return 0

    try:
        payload = json.loads(sys.argv[1])
    except (json.JSONDecodeError, IndexError):
        return 1

    event_type = payload.get("type", "")
    if event_type != "agent-turn-complete":
        return 0

    # Build notification content
    last_msg = payload.get("last-assistant-message", "Turn complete")
    # Truncate long messages for notification display
    if len(last_msg) > 120:
        last_msg = last_msg[:117] + "..."

    thread_id = payload.get("thread-id", "unknown")
    cwd = payload.get("cwd", "")
    project = cwd.split("/")[-1] if cwd else "Codex"

    title = f"Codex: {project}"
    message = last_msg

    # Prefer terminal-notifier, fall back to osascript
    if shutil.which("terminal-notifier"):
        notify_terminal_notifier(title, message, thread_id)
    else:
        notify_osascript(title, message)

    return 0


if __name__ == "__main__":
    sys.exit(main())
