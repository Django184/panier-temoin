"""Diagnostic de la lecture par Mistral, lancé par le workflow « Diagnostic lecture ».

Dessine un ticket fictif (aucune donnée réelle), l'envoie à chaque modèle
d'image avec les mêmes réglages que la fonction lire-ticket, et affiche
le code de réponse, les en-têtes de limite et le début du corps.
"""

import base64
import io
import json
import os
import time
import urllib.error
import urllib.request

from PIL import Image, ImageDraw, ImageFont

LIGNES = [
    "Société Coopérative Migros Vaud",
    "MM Démo Lausanne",
    "",
    "Désignation article    Quant.  Prix  Rabais  Total",
    "Agnesi Linguine N.10       3   2.40   2.88   4.32",
    "Bio lentilles rouges       2   2.80   1.12   4.48",
    "MBud gnocchi               1   1.95          1.95",
    "Aubergines                 1   4.00          2.00",
    "",
    "Total CHF                                   12.75",
    "Vous économisez au total                     4.00",
    "",
    "Filiale 099999   12.10.2026   19:00:05",
]


def ticket_jpeg() -> str:
    image = Image.new("RGB", (900, 700), "white")
    dessin = ImageDraw.Draw(image)
    try:
        police = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 22)
    except OSError:
        police = ImageFont.load_default()
    for i, ligne in enumerate(LIGNES):
        dessin.text((30, 30 + i * 48), ligne, fill="black", font=police)
    tampon = io.BytesIO()
    image.save(tampon, "JPEG", quality=85)
    return base64.b64encode(tampon.getvalue()).decode()


def appeler(modele: str, image: str) -> None:
    corps = {
        "model": modele,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Lis ce ticket et réponds en JSON : {\"total\": \"...\"}"},
                    {"type": "image_url", "image_url": f"data:image/jpeg;base64,{image}"},
                ],
            }
        ],
    }
    requete = urllib.request.Request(
        "https://api.mistral.ai/v1/chat/completions",
        data=json.dumps(corps).encode(),
        headers={
            "Authorization": f"Bearer {os.environ['MISTRAL_API_KEY']}",
            "Content-Type": "application/json",
        },
    )
    debut = time.time()
    try:
        with urllib.request.urlopen(requete, timeout=60) as reponse:
            statut, entetes, texte = reponse.status, reponse.headers, reponse.read().decode()
    except urllib.error.HTTPError as erreur:
        statut, entetes, texte = erreur.code, erreur.headers, erreur.read().decode()
    duree = time.time() - debut
    limites = {k: v for k, v in entetes.items() if "ratelimit" in k.lower() or k.lower() == "retry-after"}
    print(f"\n=== {modele} : HTTP {statut} en {duree:.1f} s")
    print(f"limites : {limites}")
    print(texte[:600])


def main() -> None:
    image = ticket_jpeg()
    for modele in ["mistral-small-latest", "mistral-medium-latest", "pixtral-12b-2409", "pixtral-large-latest"]:
        appeler(modele, image)
        time.sleep(3)


main()
