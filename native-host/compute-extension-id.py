#!/usr/bin/env python3
"""Print Chrome's unpacked-extension ID for a folder path (same algorithm as Chromium)."""
import hashlib
import os
import sys

path = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "../browser-extension"))
h = hashlib.sha256(path.encode("utf-8")).hexdigest()
ext_id = "".join(chr(int(c, 16) + ord("a")) for c in h[:32])
print(ext_id)
print("# path:", path, file=sys.stderr)
