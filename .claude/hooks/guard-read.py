#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Block unbounded reads above BULK_READ_LINES (builder section 2.5.1). Exit code 2 blocks the tool call."""
import json, os, re, shlex, sys
LIMIT = int(os.environ.get("BULK_READ_LINES", "350"))
def lines(path):
    try:
        with open(path, "rb") as f:
            return sum(1 for _ in f)
    except OSError:
        return 0
def block(path, n):
    print(f"Blocked: {path} has {n} lines (> {LIMIT}). Use offset/limit on a known section, "
          f"or route through scripts/bulk-read with a question.", file=sys.stderr)
    sys.exit(2)
data = json.load(sys.stdin)
tool, inp = data.get("tool_name"), data.get("tool_input", {})
if tool == "Read":
    p = inp.get("file_path", "")
    if not (inp.get("offset") or inp.get("limit")):
        n = lines(p)
        if n > LIMIT:
            block(p, n)
elif tool == "Bash":
    cmd = inp.get("command", "")
    if "|" in cmd:
        sys.exit(0)  # piped reads narrow the corpus first
    try:
        parts = shlex.split(cmd)
    except ValueError:
        sys.exit(0)
    bounded = re.search(r"(-n\s*\d+|\s-\d+)", cmd)
    if parts and (parts[0] in {"cat", "less", "more"} or (parts[0] in {"head", "tail"} and not bounded)):
        for a in parts[1:]:
            if not a.startswith("-") and os.path.isfile(a):
                n = lines(a)
                if n > LIMIT:
                    block(a, n)
sys.exit(0)
