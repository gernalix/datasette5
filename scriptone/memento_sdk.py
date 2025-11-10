import os
import re
import json
import time
import requests

# =========================================================
# HTTP con backoff robusto per 429/5xx
# =========================================================
def _get_with_backoff(url, *, params=None, timeout=None, max_tries=8, base_sleep=0.8, max_sleep=20.0):
    """GET con gestione 429/5xx.
    - Rispetta Retry-After se presente (in secondi)
    - Exponential backoff con jitter
    """
    import random
    tries = 0
    last_exc = None
    while tries < max_tries:
        r = requests.get(url, params=params or {}, timeout=timeout or _timeout())
        # ok o client error != 429: esci (poi _raise_on_404 gestisce 404)
        if r.status_code < 400 or r.status_code in (400,401,403,404):
            return r
        # 429 o 5xx → backoff
        if r.status_code == 429 or 500 <= r.status_code < 600:
            retry_after = r.headers.get("Retry-After")
            if retry_after:
                try:
                    sleep_s = float(retry_after)
                except Exception:
                    sleep_s = None
            else:
                # exponential con jitter
                sleep_s = min(max_sleep, base_sleep * (2 ** tries)) + random.uniform(0, 0.4)
            time.sleep(sleep_s or 1.0)
            tries += 1
            last_exc = None
            continue
        # altri errori: lascia gestire fuori
        return r
    # se qui, abbiamo esaurito i tentativi: ritorna comunque l'ultima response per error handling a valle
    return r

# =========================================================
# PERCORSO DB DI DEFAULT
# =========================================================
DEFAULT_DB_PATH = r"Z:\download\datasette5\scriptone\noutput.db"

def get_default_db_path():
    """Restituisce il percorso di default del database SQLite locale."""
    return DEFAULT_DB_PATH

# =========================================================
# CONFIGURAZIONE ROBUSTA (autocaricamento + fallback)
# =========================================================

# 1) Prova ad importare un eventuale config.py dell'utente
CFG = {}
try:
    import config as _user_config
    CFG = getattr(_user_config, "CONFIG", getattr(_user_config, "CFG", {}))
except Exception:
    pass

def _load_local_cfg():
    """
    Carica impostazioni da settings.yaml/settings.yml o settings.ini
    cercando in: CWD, cartella di questo file, cartella padre.
    Ritorna un dict piatto tipo {"sezione.chiave": valore}.
    """
    cfg = {}
    search_dirs = [
        os.getcwd(),
        os.path.dirname(os.path.abspath(__file__)),
        os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ]
    ini_paths = [os.path.join(d, "settings.ini") for d in search_dirs]
    yml_paths = [os.path.join(d, "settings.yaml") for d in search_dirs] +                 [os.path.join(d, "settings.yml") for d in search_dirs]

    # YAML prima (se presente)
    for p in yml_paths:
        if os.path.exists(p):
            try:
                import yaml
                with open(p, "r", encoding="utf-8") as f:
                    data = yaml.safe_load(f) or {}
                for section, kv in (data or {}).items():
                    if isinstance(kv, dict):
                        for k, v in kv.items():
                            cfg[f"{section}.{k}"] = v
                break
            except Exception:
                pass

    # poi INI
    if not cfg:
        try:
            import configparser
            cp = configparser.ConfigParser()
            for p in ini_paths:
                if os.path.exists(p):
                    cp.read(p, encoding="utf-8")
                    for section in cp.sections():
                        for k, v in cp.items(section):
                            cfg[f"{section}.{k}"] = v
                    break
        except Exception:
            pass

    return cfg

def _cfg_get(key, default=None):
    """
    Recupera una chiave dalla configurazione con priorità:
    1) oggetto CFG/CONFIG importato dal modulo utente
    2) settings.yaml/yml/ini (locali)
    3) variabili d'ambiente MEMENTO_*
    """
    val = None
    if hasattr(CFG, "get"):
        try:
            val = CFG.get(key)
        except Exception:
            val = None
    elif isinstance(CFG, dict):
        val = CFG.get(key)

    if val is None:
        local = _load_local_cfg()
        val = local.get(key)

    if val is None:
        env_map = {
            "memento.token": "MEMENTO_TOKEN",
            "memento.api_url": "MEMENTO_API_URL",
            "memento.timeout": "MEMENTO_TIMEOUT"
        }
        env_key = env_map.get(key)
        if env_key:
            val = os.environ.get(env_key, None)

    return val if val is not None else default

# =========================================================
# SUPPORTO HTTP / SANITIZZAZIONE
# =========================================================

def _sanitize_url(url: str) -> str:
    """Rimuove commenti inline (;, #), virgolette e spazi extra da una URL letta da INI/YAML."""
    if not url:
        return url
    # taglia su ; o # (commenti inline tipici nei file .ini)
    url = re.split(r"[;#]", url, maxsplit=1)[0]
    # rimuovi virgolette esterne ed eventuali spazi doppi
    url = url.strip().strip('"').strip("'")
    url = re.sub(r"\s+", " ", url).strip()
    return url

def _base_url():
    """Restituisce l'URL base corretto (aggiunge /v1 se manca)."""
    url = _cfg_get("memento.api_url", "https://api.mementodatabase.com")
    url = _sanitize_url(url or "")
    if not url.endswith("/v1") and not url.endswith("/v1/"):
        url = url.rstrip("/") + "/v1"
    return url

def _token_params():
    """Restituisce i parametri di query con il token Memento (obbligatorio)."""
    token = _cfg_get("memento.token", None)
    if not token:
        raise RuntimeError(
            "Token Memento mancante in settings.ini/settings.yaml (chiave 'memento.token') "
            "e non trovato in variabile d'ambiente MEMENTO_TOKEN."
        )
    return {"token": token}

def _timeout():
    """Timeout in secondi per le chiamate HTTP."""
    t = _cfg_get("memento.timeout", 20)
    try:
        return int(t)
    except Exception:
        return 20

def _raise_on_404(r, path):
    """Solleva errore chiaro in caso di 404 o altra risposta HTML non JSON."""
    if r.status_code == 404:
        raise RuntimeError(
            f"Memento API ha risposto 404 su {path}. "
            f"Possibili cause: token non valido, API non abilitata/endpoint errato.\n"
            f"URL chiamato: {r.request.method} {r.url}\n"
            f"Status: {r.status_code}\n"
            f"Body: {r.text}"
        )
    r.raise_for_status()

# =========================================================
# FUNZIONI PUBBLICHE USATE DAL MENU
# =========================================================

def list_libraries():
    """Restituisce l'elenco delle librerie come list[dict] con chiavi id/name/title normalizzate."""
    url = f"{_base_url()}/libraries"
    r = requests.get(url, params=_token_params(), timeout=_timeout())
    _raise_on_404(r, "/libraries")

    # Prova JSON
    try:
        data = r.json()
    except Exception:
        # Se non è JSON, prova a interpretare testo come JSON, altrimenti fallback
        txt = r.text or ""
        try:
            data = json.loads(txt)
        except Exception:
            return [{"id": "raw", "name": txt.strip(), "title": txt.strip()}]

    items = None

    # 1) Se è già una lista
    if isinstance(data, list):
        items = data

    # 2) Se è un dict con chiave tipica contenente la lista
    elif isinstance(data, dict):
        for key in ("libraries", "items", "data", "results"):
            if key in data and isinstance(data[key], list):
                items = data[key]
                break

        # 3) Mappa semplice id->name
        if items is None:
            if data and all(isinstance(v, str) for v in data.values()):
                items = [{"id": k, "name": v, "title": v} for k, v in data.items()]
            else:
                # 4) Prendi eventuali valori dict come possibili librerie
                dict_values = [v for v in data.values() if isinstance(v, dict)]
                if dict_values:
                    items = dict_values

    # 5) Se è stringa o altro, crea lista di un elemento
    if items is None:
        if isinstance(data, str):
            items = [{"id": data, "name": data, "title": data}]
        else:
            items = [{"id": "raw", "name": str(data), "title": str(data)}]

    # Normalizzazione finale
    norm = []
    for it in items:
        if isinstance(it, dict):
            _id = it.get("id") or it.get("uuid") or it.get("key") or it.get("library_id")
            _name = it.get("name") or it.get("title") or it.get("label") or _id
            _title = it.get("title") or it.get("name") or _name
            norm.append({
                "id": _id or (_name or "unknown"),
                "name": _name or "",
                "title": _title or ""
            })
        else:
            s = str(it)
            norm.append({"id": s, "name": s, "title": s})

    return norm

def infer_field_mapping(library_id):
    """Restituisce i campi della libreria leggendo /libraries/{id} (niente forms)."""
    url = f"{_base_url()}/libraries/{library_id}"
    r = requests.get(url, params=_token_params(), timeout=_timeout())
    _raise_on_404(r, f"/libraries/{library_id}")
    data = r.json()
    return data.get("fields", data)

def get_one_raw_entry(library_id, form_name="default"):
    """
    Restituisce una singola entry.
    1) Prova /forms/{form}/entries
    2) Se 404, prova /entries
    3) Se /entries non include fields, prova /entries/{id}
    """
    base = _base_url()
    params = _token_params(); params["limit"] = 1

    # tentativo 1: con forms
    url1 = f"{base}/libraries/{library_id}/forms/{form_name}/entries"
    r = requests.get(url1, params=params, timeout=_timeout())
    if r.status_code == 404:
        # tentativo 2: senza forms
        url2 = f"{base}/libraries/{library_id}/entries"
        r2 = requests.get(url2, params=params, timeout=_timeout())
        _raise_on_404(r2, f"/libraries/{library_id}/entries")
        data = r2.json()
        items = data.get("entries") or data.get("items") or data
        if isinstance(items, dict):
            items = list(items.values())
        if not items:
            return items
        first = items[0]

        # se non ci sono campi, prova il dettaglio
        if not first.get("fields"):
            eid = first.get("id")
            if eid:
                url3 = f"{base}/libraries/{library_id}/entries/{eid}"
                r3 = requests.get(url3, params=_token_params(), timeout=_timeout())
                if r3.status_code == 429:
                    time.sleep(1.2)
                    r3 = requests.get(url3, params=_token_params(), timeout=_timeout())
                _raise_on_404(r3, f"/libraries/{library_id}/entries/{eid}")
                return r3.json()
        return first

    _raise_on_404(r, f"/libraries/{library_id}/forms/{form_name}/entries")
    return r.json()

# =========================================================
# UTILITÀ PER IMPORT COMPLETI
# =========================================================


def fetch_all_entries_full(library_id, limit=100):
    """Scarica TUTTE le entries di una libreria, seguendo diversi schemi di paginazione.
    - Supporta risposte con chiavi: "entries", "items", "data", o la risposta già lista.
    - Supporta paginazione via: "next", "next_url", {"links":{"next":...}}, "nextPageToken"/"next_page_token",
      "cursor"/"continuation"/"continuationToken", oppure "offset"+"total" / "page"+"pages".
    - Se la lista non contiene i campi completi, fa fetch del dettaglio /entries/{id}.
    """
    import urllib.parse as _up

    base = _base_url().rstrip("/")
    url = f"{base}/libraries/{library_id}/entries"
    params = _token_params().copy()
    params["limit"] = int(limit)

    def _listify(data):
        items = (data.get("entries") if isinstance(data, dict) else None)              or (data.get("items") if isinstance(data, dict) else None)              or (data.get("data") if isinstance(data, dict) else None)              or data
        if isinstance(items, dict):
            # a volte i dati sono in items["results"]
            items = items.get("results") or items.get("entries") or items.get("items") or []
        return items if isinstance(items, list) else []

    def _next_info(data):
        # 1) URL diretto
        next_url = None
        if isinstance(data, dict):
            next_url = data.get("next") or data.get("next_url")
            if not next_url:
                links = data.get("links") or {}
                if isinstance(links, dict):
                    next_url = links.get("next")
        if next_url:
            # Se è relativo, renderlo assoluto
            next_url = _up.urljoin(base + "/", next_url)
            # Assicura che abbia sempre il token
            parsed = _up.urlparse(next_url)
            q = dict(_up.parse_qsl(parsed.query))
            if "token" not in q:
                q.update(_token_params())
            return _up.urlunparse(parsed._replace(query=_up.urlencode(q))), None

        # 2) Token di pagina
        token = None
        if isinstance(data, dict):
            token = data.get("nextPageToken") or data.get("next_page_token") or                     data.get("pageToken") or data.get("paginationToken") or                     data.get("cursor") or data.get("continuation") or data.get("continuationToken")
        if token:
            nxt_params = _token_params().copy()
            nxt_params["limit"] = int(limit)
            # I nomi più comuni per il parametro sono "pageToken" o "cursor"
            nxt_params["pageToken"] = token
            return url, nxt_params

        # 3) Offset/total oppure page/pages
        if isinstance(data, dict):
            total = data.get("total") or data.get("count") or None
            offset = data.get("offset")
            page = data.get("page"); pages = data.get("pages")
            if total is not None and offset is not None:
                nxt_params = _token_params().copy()
                nxt_params["limit"] = int(limit)
                nxt_params["offset"] = int(offset) + int(limit)
                if nxt_params["offset"] >= int(total):
                    return None, None
                return url, nxt_params
            if page is not None and pages is not None:
                page = int(page); pages = int(pages)
                if page + 1 >= pages:
                    return None, None
                nxt_params = _token_params().copy()
                nxt_params["limit"] = int(limit)
                nxt_params["page"] = page + 1
                return url, nxt_params

        return None, None

    all_rows = []
    while True:
        r = _get_with_backoff(url, params=params, timeout=_timeout())
        if r.status_code == 429:
            time.sleep(1.2); r = _get_with_backoff(url, params=params, timeout=_timeout())
        _raise_on_404(r, f"/libraries/{library_id}/entries")
        data = r.json()

        items = _listify(data)
        # fetch dettagli solo se servono
        rows = []
        for it in items:
            if isinstance(it, dict) and it.get("fields"):
                rows.append(it)
            else:
                eid = it.get("id") if isinstance(it, dict) else None
                if not eid:
                    rows.append(it); continue
                durl = f"{base}/libraries/{library_id}/entries/{eid}"
                d = _get_with_backoff(durl, params=_token_params(), timeout=_timeout())
                if d.status_code == 429:
                    time.sleep(1.2); d = _get_with_backoff(durl, params=_token_params(), timeout=_timeout())
                _raise_on_404(d, f"/libraries/{library_id}/entries/{eid}")
                rows.append(d.json())

        all_rows.extend(rows)

        next_url, next_params = _next_info(data)
        if next_url:
            url, params = next_url, (next_params or {})
        else:
            break

    return all_rows
