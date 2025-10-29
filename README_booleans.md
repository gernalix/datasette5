
# Boolean handling patch (unified)

This patch adds a single JS file that:
- Detects boolean-like columns (1/0, true/false, ✅/❌) automatically
- Renders ✅ for true, ❌ for false
- Leaves NULL/empty cells truly empty (no em-dash)
- Clicking on ✅ filters `<col>=1`; clicking on ❌ filters `<col>=0`
- Hides columns that are completely empty or entirely falsy (0/false/❌)
- Allows excluding specific columns via an optional `static/custom/not_booleans.txt`

## Files included
- `static/custom/booleans.js` (new)

## How to integrate
1) Place `booleans.js` in your project at `static/custom/booleans.js`.

2) In your `templates/base.html`, include it near the end of `<body>` (after the table markup):
   ```html
   <script src="/static/custom/booleans.js" defer></script>
   ```

   If you prefer using `metadata.json` instead of editing `base.html`, add under your root metadata:
   ```json
   {
     "extra_js_urls": ["/static/custom/booleans.js"]
   }
   ```
   (merge with your existing keys; do **not** delete your current entries)

3) (Optional) Create `static/custom/not_booleans.txt` to exclude columns from boolean autodetection.
   Format (one table per line):
   ```
   tabella: col1, col2, col3
   sex: note, descrizione
   partner: bio
   ```

## Notes
- URL filtering fallback uses `?col=1` style. If you use advanced filters, the script clears `_filter_*` params to avoid conflicts.
- The script never replaces NULLs with em-dashes; it leaves them blank.
- Column hiding applies only to columns detected as boolean-like and either (a) fully NULL/empty or (b) entirely falsy across visible rows.
