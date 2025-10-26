
# HTTPS + formatting overrides for Datasette

Included:
- `run_datasette_https_plus_checks.bat` — starts Datasette over HTTPS using your cert/key and checks assets.
- `static\custom\format_overrides.js` —
  - converts `sex.link` cells into a single emoji ➡️ that links to the existing URL in the cell;
  - auto-detects timestamp/date columns (e.g., `inizio`, `fine`, `*_at`, `*_timestamp`, `*_date`, `*_time`) and prevents wrapping so they stay on one line.
- `static\custom\format_overrides.css` — styles used by the JS.

## Hook into your pages
Make sure `templates\base.html` contains:
```html
<link rel="stylesheet" href="/custom/format_overrides.css">
<script defer src="/custom/format_overrides.js"></script>
```
Launch with the BAT. Logs go to `logs\datasette_*.log`.
