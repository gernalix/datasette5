# v1
import os, sys, subprocess

HERE = os.path.dirname(__file__)
DB   = os.path.join(HERE, "output.db")
HOST, PORT = "0.0.0.0", 8001

CRT  = r"C:\Users\seste\daniele.tail6b4058.ts.net.crt"
KEY  = r"C:\Users\seste\daniele.tail6b4058.ts.net.key"

PYTHON_EXE = os.path.join(HERE, ".venv313", "Scripts", "python.exe")

args = [
    PYTHON_EXE, "-m", "datasette", "serve", DB,
    "--host", HOST, "--port", str(PORT),
    "--ssl-certfile", CRT, "--ssl-keyfile", KEY,
    "--setting", "force_https_urls", "on",
    "--static", "custom:static/custom",
    "--metadata", os.path.join(HERE, "metadata.json"),
    "--template-dir", os.path.join(HERE, "templates"),
    "--plugins-dir", os.path.join(HERE, "plugins"),
]

print("[LAUNCH]", " ".join(f'"{a}"' if " " in a else a for a in args))
sys.exit(subprocess.call(args))
