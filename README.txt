This package updates the date filter shim to target ONLY the 'giorno' column on /calendar_range.
- Replaces static/custom/date_range_calendar_shim.js
- No other files are changed.
Make sure base.html already includes:
  <script defer src="/custom/date_range_calendar_shim.js?v=1"></script>
If needed, bump the version query (?v=2, etc.) to force cache refresh.
