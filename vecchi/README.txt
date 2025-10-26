
# Timestamp Auto-Width Patch v2

What changed vs v1:
- Strong CSS overrides (`word-break: normal`, `overflow-wrap: normal`, `hyphens: manual`) to beat Datasette defaults.
- JS replaces `<br>` tags inside timestamp cells with a space to prevent forced line breaks.
- Wider default bounds (18–34ch).

Install:
1) Copy `static/custom/format_overrides.js` and `.css` into your project.
2) Ensure `templates/base.html` includes:
   <link rel="stylesheet" href="/custom/format_overrides.css">
   <script defer src="/custom/format_overrides.js"></script>
