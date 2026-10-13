# Checklist de test sur téléphone

À faire une fois sur un iPhone et une fois sur un téléphone Android, avec l’app publiée sur https://django184.github.io/panier-temoin/. Cocher chaque point ; noter le modèle et la version du système en tête.

Appareil : ____________________  Système : ____________________  Date : __________

## 1. Installation

- [ ] La page s’ouvre et affiche l’accueil « Panier Témoin » avec la mention de non-affiliation.
- [ ] **iPhone** : Partager → « Sur l’écran d’accueil » propose « Ouvrir comme app web » ; après ajout, l’icône (ticket et courbe bleue) apparaît.
- [ ] **Android** : menu ⋮ → « Installer l’application » ; l’icône apparaît dans le tiroir d’applications.
- [ ] Lancée depuis l’icône, l’app s’ouvre en plein écran, sans barre d’adresse.
- [ ] La barre d’onglets du bas n’est pas masquée par la barre système (iPhone avec encoche ou Dynamic Island inclus).

## 2. Connexion

- [ ] Onglet Ajouter sans être connecté : l’écran « Se connecter » s’affiche.
- [ ] Mauvais mot de passe : message « E-mail ou mot de passe incorrect ».
- [ ] Bon mot de passe : l’écran « Ajouter un ticket » s’affiche.
- [ ] Fermer complètement l’app puis la rouvrir : la session est conservée.

## 3. Capture et lecture

- [ ] « Photographier le ticket » ouvre directement l’appareil photo arrière.
- [ ] « Importer une photo ou une capture » ouvre la photothèque.
- [ ] **iPhone** : une photo au format HEIC est acceptée.
- [ ] Premier ticket : la barre de progression affiche « Chargement du moteur de lecture », puis « Lecture du ticket ».
- [ ] Ticket photographié de côté : la lecture le redresse, ou le lien « Relire la photo en la tournant » corrige.
- [ ] Deuxième ticket : la lecture démarre sans recharger le moteur.
- [ ] Mode avion après un premier ticket : la lecture fonctionne encore (l’envoi, lui, attend le réseau).

## 4. Validation et envoi

- [ ] Les valeurs incertaines sont surlignées ; une valeur modifiée passe au bleu « stylo ».
- [ ] Le numéro de filiale connu affiche le nom du magasin.
- [ ] Une ligne pesée affiche « Pesé » et un poids calculé, non modifiable.
- [ ] Modifier un prix fait apparaître ou disparaître l’écart sur la ligne et sur la somme.
- [ ] « Envoyer le ticket » reste grisé tant qu’un problème est listé.
- [ ] Le clavier numérique s’ouvre sur les champs de montant.
- [ ] Fermer l’app en pleine vérification, la rouvrir : « Un ticket est en cours de vérification » propose de le reprendre.
- [ ] Envoi : « Ticket enregistré », avec le nombre de lignes.
- [ ] Renvoyer le même ticket : « Ticket déjà enregistré ».

## 5. Import par l’app Claude

- [ ] « Copier la consigne » affiche « Consigne copiée ».
- [ ] La consigne collée dans l’app Claude avec la photo produit un JSON.
- [ ] La réponse collée ouvre l’écran de vérification, lignes remplies.

## 6. Consultation

- [ ] Explorer : la recherche « linguine » trouve le produit, avec son dernier prix.
- [ ] Fiche produit : la courbe s’affiche ; le toucher montre la date et le prix ; « Voir les valeurs » ouvre le tableau.
- [ ] Les filtres magasin, canton et période modifient la courbe.
- [ ] « Selon le magasin » et « Promotions sur un an » s’affichent ou disent « Pas encore de relevé ».
- [ ] Favori : l’étoile s’allume et le produit apparaît sur l’accueil.
- [ ] Paniers : créer un panier, ajouter deux produits, voir l’indice.
- [ ] Déconnecté, l’Explorer et les fiches restent lisibles.

## 7. Profil, thème et mises à jour

- [ ] Profil liste les tickets envoyés ; la suppression demande confirmation.
- [ ] Un prix mis de côté apparaît dans « Prix à confirmer » et disparaît après « Confirmer ».
- [ ] Mode sombre du téléphone : textes et courbes restent lisibles.
- [ ] Après une nouvelle publication, l’app affiche « Une nouvelle version est disponible » ; « Recharger » l’applique.

## Problèmes relevés

| Écran | Ce qui s’est passé | Capture d’écran |
| --- | --- | --- |
|  |  |  |
