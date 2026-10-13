"""Décode les codes de test avec zxing-cpp (décodeur indépendant) et
compare au texte attendu. Échoue si un seul code est mal lu.
Usage : python scripts/verifier_codes.py <dossier>"""

import json
import sys

import zxingcpp
from PIL import Image

dossier = sys.argv[1]
echecs = 0
for attendu in json.load(open(f"{dossier}/attendus.json", encoding="utf-8")):
    image = Image.open(f"{dossier}/{attendu['fichier']}").convert("L")
    lus = zxingcpp.read_barcodes(image)
    texte = lus[0].text if lus else None
    format_lu = lus[0].format.name if lus else None
    ok = texte == attendu["texte"] and format_lu == attendu["format"]
    print(f"{'OK ' if ok else 'ÉCHEC'} {attendu['fichier']} : {format_lu} {texte!r}")
    if not ok:
        echecs += 1
        print(f"::error::{attendu['fichier']} mal lu ({format_lu}) : attendu {attendu['texte']!r}, lu {texte!r}")

print(f"::notice::Codes vérifiés par zxing-cpp : {echecs} échec(s)")
sys.exit(1 if echecs else 0)
