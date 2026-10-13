// Textes de tickets servant aux tests du lecteur.
//
// Les deux tickets réels du 12 octobre 2026 (MM Métropole Renens) sont
// donnés sous deux formes : transcription idéale, et sortie réelle de
// Tesseract 5.3.4 sur les photos. Le numéro Cumulus, les chiffres de
// carte et les identifiants de transaction ont été remplacés par des
// valeurs fictives : ces données ne doivent jamais entrer dans le dépôt.

export const TICKET_1_IDEAL = `
MIGROS
Société Coopérative Migros Vaud
MM Métropole Renens
Tel. 058 573 67 50
Désignation article Quant. Prix Rabais Total #
Poivrons rouges 1 3.80 1.15 1
MClass fromage salade 1 1.90 1.90 1
Migros lait coco light 1 1.40 1.40 1
MClass YogQuark 1 1.95 1.95 1
Total CHF 6.40
TWINT QR 6.40
Total en EUR 7.11
*** Reçu du client ***
Vente
TWINT
XXXXXXXXXXXXXXXX0000
12.10.2026 12:45:24
Trm-Id: 11111111
Trx. Ref-No: 99999999999
Total EFT CHF: 6.40
Numéro Cumulus 1234.567.890.123
Total points au 11.10.2026 100.00
Points acquis 6.40
# Numéro TVA CHE-105.896.913 TVA
Gr TVA% Total TVA
1 2.60 % 6.40 0.16
Merci de votre confiance
Filiale Utilis. Emp Tick. Date Heure
064590 0000000 261 0067 12.10.2026 12:43:59
`;

export const TICKET_2_IDEAL = `
MIGROS
Société Coopérative Migros Vaud
MM Métropole Renens
Tel. 058 573 67 50
Désignation article Quant. Prix Rabais Total #
Agnesi Linguine N.10 3 2.40 2.88 4.32 1
Bio lentilles rouges 2 2.80 1.12 4.48 1
MBud gnocchi 1 1.95 1.95 1
Bio Feta 1 3.20 3.20 1
Aubergines 1 4.00 2.00 1
Bio yogourt nature 1 1.40 1.40 1
Bio courgettes 1 3.30 3.30 1
Bio Fairtrade bananes 1 2.95 2.60 1
Pommes rou. douce Gala 1 2.80 1.35 1
Vous économisez au total 4.00
Total CHF 24.60
Visa 24.60
Total en EUR 27.33
*** Reçu du client ***
Vente
Visa Debit contactless
XXXXXXXXXXXX0000
12.10.2026 19:00:57
Trm-Id: 11111111
Total EFT CHF: 24.60
# Numéro TVA CHE-105.896.913 TVA
Merci de votre confiance
Filiale Utilis. Emp Tick. Date Heure
064590 0000000 253 0178 12.10.2026 19:00:05
`;

/** Sortie brute de Tesseract (modèle anglais, page entière) sur la photo du ticket 1. */
export const TICKET_1_OCR_BRUT = `
44 MIGROS
_ a = Societe Coopératiya Niarce
inns ~ a NN Nétropale Rend Vaud
—— : _——_ Tel 058 573 67 50 Z
= SS Sy Designation article — Quant Prix Rabais Total #
— Poivrons rouges 1
NClass fromage salade re | 15 |
Migros lait coco light it i | ZB
HClass YooQuark , 195 (45 -
Total CHF 6.40
TWINT QR er
Total en EUR 6.40 =
Boat : eM al
kX Recu du client xxx
Vente =
TWINT =
KXXXXKXXKKXKKHKG000 ;
12.10.2026 12:45:24 A
Trn-Id: 11111111
Trx. Ref-No: 99999999999
Total EFT CHF: 6.40
Numéro Cumulus i 1234.567.890. 123
Total points au 11.10.2026 100.00
Points acquis Bs 6.40
# Numéro TVA CHE-105. 896,913 Wa
Gr TVA Total TVA
1 2,60 % 6.40 0.16
Rie a Herci de votre confiance
Filiala Utilis. Emp Tick. Vat ee oe
`;

/** Sortie brute de Tesseract (modèle anglais, page entière) sur la photo du ticket 2. */
export const TICKET_2_OCR_BRUT = `
———— =|
= — ——— | R AIGR : \\
— = - ; Societe Poopérative Higros Vaud
== = WH Hétropole Renen
— a —— = : ( tion article quant Prix aba 4 4
== : ane Linguine N.10 4() 2.88 4 . N
=— entilles rouges 2 2 B0mi walla é 4.4
—— Bud gnocchi 1 1.95 fe “
——- a = io Feta 1 3.20 VA aL ~
SSS ———= = jubergines | 4,00 2.00
——e —— oe yogourt nature | 1.40 1.40
——— = == io courgettes 1 3.30 530 4 = :
3 ———-—siédh Fairtrade bananes 1 2.95 2.60 1
— Sse ‘onnes rou. douce Gala 1 9.80 {acu 4 =
—————S =
—S Ses ous écononisez au total 4.00 “
[otal CHF 24.60 —<——S——>
13d 24.60 —
otal en EUR 27.33
¥*«x Regu du client ***
Vente
Visa Debit contactless
XXXXXXKARAXKZ000
12.10.2026 19:00:57
Trn-Id: 11111111 :
Total EFT CHF: 4.60 :
tele Werci de votre conf iance
010100645902531210260178000002460 i
jliale utilis. Emp Tick. Date Heure
(064590 000000 253 0178 12.10.2026 19:00:05
`;

/** Sortie de Tesseract sur le bloc d'articles du ticket 2, recadré et seuillé. */
export const TICKET_2_OCR_ARTICLES = `
HH Hétropole Renens a
| Tel, 058 573 67 50 :
ésignation article Quant. _ Prix Rabais Total §
9 ignesi Linguine N.10 3 0.40 2.88 4.32 1
ao Yentilles rouges 42 «=° (2.80 © 112 4.48 1
Bud gnocchi { 1.95 | 1.95 1
jofeta  . ° ' 3,20 9,20 «1
* jwbergines : 7 1 400 | 9.00 1
4g yogourt nature 1. 4.40 0°, 1.40 1
jo courgettes ee | er)
vig Fairtrade bananes 1°. 2.95 . 260 1
onnes rou. douce Gala 1 = 2,80 . 435
`;
