# plugins/sex_form.py
# -*- coding: utf-8 -*-
# v3 - usa sempre il database di default, niente _db in query

import os

from datasette import hookimpl
from datasette.utils.asgi import Response

# Nome del file INI nella root del progetto (stessa cartella di output.db)
BASE_DIR = os.path.dirname(os.path.dirname(__file__))
INI_PATH = os.path.join(BASE_DIR, "sex_fk.ini")


def _load_fk_mapping():
    """
    Ritorna un dict {nome_tabella: colonna_da_mostrare}.

    Legge sex_fk.ini con righe del tipo:
        partner.nome
        luogo.indirizzo
    oppure:
        partner.nome = commento

    Righe vuote o che iniziano con #/; sono ignorate.
    """
    mapping = {}

    if not os.path.exists(INI_PATH):
        return mapping

    with open(INI_PATH, "r", encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line.startswith("#") or line.startswith(";"):
                continue

            # Supporta anche "partner.nome = qualcosa"
            if "=" in line:
                key, _ = line.split("=", 1)
                key = key.strip()
            else:
                key = line

            if "." not in key:
                continue

            table, column = key.split(".", 1)
            table = table.strip()
            column = column.strip()
            if table and column:
                mapping[table] = column

    return mapping


async def _get_sex_columns(db):
    """
    Ritorna lista di dict con le info sulle colonne di sex:
    [{name, pk, type, notnull, dflt_value}, ...]
    """
    info = await db.execute("PRAGMA table_info(sex)")
    cols = []
    for row in info.rows:
        cols.append(
            {
                "name": row["name"],
                "pk": bool(row["pk"]),
                "type": row["type"],
                "notnull": bool(row["notnull"]),
                "dflt_value": row["dflt_value"],
            }
        )
    return cols


async def _build_form_context(datasette, db, message=None):
    """
    Costruisce il contesto per il template sex_insert.html.

    Per ogni colonna aggiunge:
      - is_fk: bool
      - fk_table: nome tabella FK (se presente)
      - options: lista di {id, label} per il select
    """
    fk_mapping = _load_fk_mapping()
    columns_info = await _get_sex_columns(db)

    columns = []
    for col in columns_info:
        name = col["name"]

        # Saltiamo la PK "id" autoincrement se esiste
        if col["pk"] and name == "id":
            continue

        col_dict = {
            "name": name,
            "pk": col["pk"],
            "type": col["type"],
            "notnull": col["notnull"],
            "is_fk": False,
            "fk_table": None,
            "options": [],
        }

        # Convenzione: colonne che finiscono con "_id" sono FK
        if name.endswith("_id"):
            fk_table = name[:-3]  # partner_id -> partner
            display_col = fk_mapping.get(fk_table)
            if display_col:
                try:
                    # Prendiamo id + colonna da mostrare
                    sql = (
                        f"select id, {display_col} as label "
                        f"from {fk_table} order by {display_col}"
                    )
                    res = await db.execute(sql)
                    options = [
                        {"id": row["id"], "label": row["label"]} for row in res.rows
                    ]
                except Exception:
                    # In caso di errore (tabella/colonna mancante) non blocchiamo il form
                    options = []
                col_dict["is_fk"] = True
                col_dict["fk_table"] = fk_table
                col_dict["options"] = options

        columns.append(col_dict)

    table_url = datasette.urls.table(db.name, "sex")
    return {
        "database": db.name,
        "columns": columns,
        "message": message,
        "table_url": table_url,
    }


async def sex_insert(request, datasette):
    """
    View principale per GET/POST su /sex/insert.
    Usa sempre il database di default di Datasette.
    """
    db = datasette.get_database()   # default DB (output.db nel tuo caso)
    message = None

    if request.method == "POST":
        form = await request.post_vars()

        # Costruisco i valori da inserire leggendo lo schema della tabella
        columns_info = await _get_sex_columns(db)
        values = {}

        for col in columns_info:
            name = col["name"]

            # Non inseriamo la PK id autoincrement
            if col["pk"] and name == "id":
                continue

            if name in form and form[name] != "":
                values[name] = form[name]

        if values:
            cols = ", ".join(values.keys())
            placeholders = ", ".join([f":{k}" for k in values.keys()])
            sql = f"insert into sex ({cols}) values ({placeholders})"

            # Eseguiamo la INSERT in modo sincrono (block=True)
            await db.execute_write(sql, values, block=True)

            # Nella tua versione add_message è sincrona -> niente await
            try:
                datasette.add_message(request, "Record inserito nella tabella sex.")
            except Exception:
                # anche se fallisce il messaggio, non blocchiamo l'inserimento
                pass

            table_url = datasette.urls.table(db.name, "sex")
            return Response.redirect(table_url)
        else:
            message = "Nessun dato da inserire."

    # GET o POST senza valori -> mostriamo il form
    context = await _build_form_context(datasette, db, message=message)
    html = await datasette.render_template(
        "sex_insert.html",
        context,
        request=request,
    )
    return Response.html(html)


@hookimpl
def register_routes():
    """
    Registra la route /sex/insert.
    """
    return [
        (r"^/sex/insert$", sex_insert),
    ]


@hookimpl
def menu_links(datasette, actor, request):
    """
    Aggiunge un link al menu in alto a destra per aprire il form.
    """
    return [
        {
            "href": datasette.urls.path("/sex/insert"),
            "label": "Nuovo record sex",
        }
    ]
