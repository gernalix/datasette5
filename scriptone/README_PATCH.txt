README PATCH — MEMENTO SDK
==========================

- Aggiunto percorso di default del database:
  Z:\download\datasette5\scriptone\noutput.db

- Inclusa versione completa di memento_sdk.py con:
  * Config robusta (config.py -> CONFIG/CFG; poi settings.ini/yaml; poi env MEMENTO_*)
  * Sanificazione api_url e forzatura /v1
  * Token in querystring (?token=...)
  * list_libraries() normalizzata
  * infer_field_mapping() su /libraries/{id}
  * get_one_raw_entry() con fallback a /entries + dettaglio /entries/{id}
  * fetch_all_entries_full() con paginazione e retry 429

Uso rapido
----------
from memento_sdk import (
    DEFAULT_DB_PATH, get_default_db_path,
    list_libraries, infer_field_mapping, get_one_raw_entry, fetch_all_entries_full
)
print(get_default_db_path())
