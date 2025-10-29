
Patch: boolean ground-truth + normalization
- static/custom/booleans.js: uses not_booleans.txt as sole ground-truth; normalizes any non-1 to 0; NULL stays visually empty; columns all 0 hidden; click badges filter col=1/0.
- static/custom/click_to_filter.js: now ignores boolean cells entirely (ownership moved to booleans.js).
