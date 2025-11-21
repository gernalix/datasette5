# -*- coding: utf-8 -*-
from __future__ import annotations
from memento_import import memento_import_batch
from util import resolve_here

def _ask(prompt: str, default: str = "") -> str:
    v = input(f"{prompt} [{default}]: ").strip()
    return v or default

def _menu_import_batch():
    print("\n============== MEMENTO – Import batch da YAML/INI ============== ")
    db_path = _ask("Percorso DB sqlite", "noutput.db")
    batch   = _ask("Percorso batch (.ini o .yaml)", "memento_import.ini")
    db_path = str(resolve_here(db_path))
    batch   = str(resolve_here(batch))
    n = memento_import_batch(db_path, batch)
    print(f"Import riuscito: {n} righe")

def main_menu():
    while True:
        print("\n------ MEMENTO --------")
        print("1) Elenca librerie (SDK)")
        print("2) Deduci mappatura campi (SDK)")
        print("3) Mostra 1 entry grezza (SDK)")
        print("4) Importa libreria (auto)")
        print("5) Importa batch da YAML/INI")
        print("0) Indietro / Esci")
        sel = input("> ").strip()
        if sel == "5":
            _menu_import_batch()
        elif sel == "0" or sel.lower() in ("q","quit","exit"):
            break
        else:
            print("Funzione non implementata in questa build: seleziona 5 o 0.")
