@echo off
echo Starting BlueTraceAI Commit Pacer until 3:00 PM...
uv run python scripts\push_until_3pm.py --daemon --push-first
pause
