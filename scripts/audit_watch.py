#!/usr/bin/env python
# -*- coding: utf-8 -*-
import os, time, sqlite3, datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(BASE, "output.db")
CUSTOM = os.path.join(BASE, "custom")
OUT_HTML = os.path.join(CUSTOM, "audit.html")

os.makedirs(CUSTOM, exist_ok=True)

HEAD = """<!doctype html><html lang='it'><head><meta charset='utf-8'>
<title>Audit statico</title><meta name='viewport' content='width=device-width,initial-scale=1'>
<style>
body{background:#0f172a;color:#e5e7eb;font:14px/1.45 system-ui,Segoe UI,Roboto,Arial;margin:0;padding:14px}
h1{font-size:18px;margin:0 0 6px}.muted{color:#94a3b8}
.panel{background:#111827;border:1px solid #1f2937;border-radius:12px;padding:12px;margin-bottom:12px}
table{width:100%;border-collapse:collapse}th,td{padding:8px 6px;border-bottom:1px dashed #223049;text-align:left;vertical-align:top}
th{color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:.03em}
code.inline{background:#0b1220;border:1px solid #1f2937;padding:1px 5px;border-radius:6px}
pre{margin:0;background:#0b1220;border:1px solid #1f2937;padding:8px;border-radius:8px;overflow:auto}
.pill{padding:2px 8px;border-radius:999px;border:1px solid #2b3a58;color:#cbd5e1;font-size:12px}
</style></head><body>"""
FOOT = "</body></html>"

def fetch():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    c = con.cursor()
    ddl = c.execute("select ts, action, object_type, table_name, object_name, sql_text from v_audit_ddl order by ts desc limit 200").fetchall()
    dml = c.execute("select ts, event, table_name, rowid, new_values, old_values from v_audit_dml order by ts desc limit 200").fetchall()
    con.close()
    return ddl, dml

def render(ddl, dml):
    now = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    parts = [HEAD, f"<h1>Audit statico</h1><div class='muted'>Aggiornato: {now}</div>"]
    parts += ["<section class='panel'><h2>Schema (DDL)</h2><table><thead><tr><th>Timestamp</th><th>Azione</th><th>Oggetto</th><th>Tabella</th><th>Nome</th><th>SQL</th></tr></thead><tbody>"]
    for r in ddl:
        sql = (r['sql_text'] or '').replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
        parts += [f"<tr><td><code class='inline'>{r['ts']}</code></td><td><span class='pill'>{r['action']}</span></td><td><span class='pill'>{r['object_type']}</span></td><td><code class='inline'>{r['table_name'] or ''}</code></td><td><code class='inline'>{r['object_name'] or ''}</code></td><td><pre>{sql}</pre></td></tr>"]
    parts += ["</tbody></table></section>"]
    parts += ["<section class='panel'><h2>Dati (DML)</h2><table><thead><tr><th>Timestamp</th><th>Evento</th><th>Tabella</th><th>rowid</th><th>new_values</th><th>old_values</th></tr></thead><tbody>"]
    for r in dml:
        nv = (r['new_values'] or '').replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
        ov = (r['old_values'] or '').replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
        parts += [f"<tr><td><code class='inline'>{r['ts']}</code></td><td><span class='pill'>{r['event']}</span></td><td><code class='inline'>{r['table_name']}</code></td><td><code class='inline'>{r['rowid']}</code></td><td><pre>{nv}</pre></td><td><pre>{ov}</pre></td></tr>"]
    parts += ["</tbody></table></section>", FOOT]
    with open(OUT_HTML, "w", encoding="utf-8") as f:
        f.write("".join(parts))

def main():
    last = None
    # first render
    try:
        ddl, dml = fetch()
        render(ddl, dml)
    except Exception as e:
        with open(OUT_HTML, "w", encoding="utf-8") as f:
            f.write(HEAD + "<pre>Errore iniziale: "+str(e)+"</pre>" + FOOT)
    while True:
        try:
            m = os.path.getmtime(DB)
            if last is None or m != last:
                last = m
                ddl, dml = fetch()
                render(ddl, dml)
        except Exception:
            pass
        time.sleep(2)

if __name__ == "__main__":
    main()
