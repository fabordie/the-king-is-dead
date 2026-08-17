# Déployer The King is Dead sur Render (gratuit)

Une fois déployé, le jeu a une **adresse permanente** du type
`https://the-king-is-dead.onrender.com` : plus de tunnel, plus de machine à
laisser allumée, ton IP reste privée. Tes trois partenaires ouvrent simplement
l'URL, sur ordinateur ou téléphone.

Il te faut deux comptes gratuits : **GitHub** (pour héberger le code) et
**Render** (pour l'exécuter). Compte 10 à 15 minutes la première fois.
Tout se fait dans le navigateur — aucune ligne de commande.

---

## Étape 1 — Mettre le code sur GitHub

1. Crée un compte sur **https://github.com** si tu n'en as pas (bouton *Sign up*).
2. Une fois connecté, va sur **https://github.com/new** :
   - *Repository name* : `the-king-is-dead`
   - Coche **Public** (nécessaire pour le plan gratuit de Render sans lier les
     deux comptes en profondeur ; le code ne contient rien de personnel).
   - Clique **Create repository**.
3. Sur la page du dépôt vide, clique le lien **« uploading an existing file »**.
4. Ouvre le dossier `the-king-is-dead` dézippé sur ton ordinateur, sélectionne
   **tout son contenu** et glisse-le dans la page GitHub.

   ⚠️ **N'inclus pas le dossier `node_modules`** s'il existe (il apparaît après
   un premier lancement local). Tout le reste, oui — y compris le dossier
   `public` et le fichier `render.yaml`.

   Si le glisser-déposer du dossier `public` ne crée pas le sous-dossier :
   glisse d'abord les fichiers de la racine, valide, puis clique
   *Add file → Upload files*, et glisse le dossier `public` entier.
5. En bas de page, clique **Commit changes**.

Vérifie que la page du dépôt montre bien `server.js`, `render.yaml`,
`package.json` et le dossier `public/`.

---

## Étape 2 — Créer le service sur Render

1. Crée un compte sur **https://render.com** — le plus simple est
   **« Sign in with GitHub »** : l'autorisation entre les deux services se fait
   toute seule.
2. Sur le tableau de bord, clique **New +** (en haut à droite) →
   **Blueprint**.
3. Choisis ton dépôt `the-king-is-dead` (bouton *Connect*).
   Render lit le fichier `render.yaml` fourni : tout est déjà configuré
   (installation, démarrage, port, page de contrôle de santé, plan gratuit).
4. Clique **Deploy Blueprint** (ou *Apply*). Le premier déploiement prend
   deux ou trois minutes — tu peux suivre le journal en direct.
5. Quand la ligne du service passe au vert (*Live*), clique sur son nom :
   l'URL publique est affichée en haut, du type
   `https://the-king-is-dead-xxxx.onrender.com`.

C'est fini. **Ouvre l'URL, crée une partie, envoie le code à quatre lettres
aux trois autres** — chacun depuis chez lui, sur ordinateur ou téléphone.

> Si tu ne vois pas l'option *Blueprint* : **New + → Web Service**, choisis le
> dépôt, et vérifie simplement ces trois champs avant de valider :
> *Build command* `npm install` · *Start command* `npm start` ·
> *Instance type* **Free**. C'est équivalent.

---

## Ce qu'il faut savoir sur le plan gratuit

- **Mise en veille.** Sans visite pendant ~15 minutes, le service s'endort.
  Le premier joueur qui ouvre l'URL le réveille : la page met 30 à 60 secondes
  à répondre, une seule fois. Les suivants entrent instantanément.
  Conseil : ouvre l'URL cinq minutes avant l'heure de la partie.
- **Les parties vivent en mémoire.** Une mise en veille ou un redéploiement
  efface les salons en cours. Concrètement : jouez votre partie d'une traite
  (une partie dure 30 à 50 minutes, et tant que vous jouez, le service ne
  s'endort pas). Ne comptez pas reprendre une partie le lendemain.
- **Aucune carte bancaire** n'est demandée pour ce plan.

---

## Mettre à jour le jeu plus tard

Si je te livre une nouvelle version : sur la page GitHub du dépôt,
*Add file → Upload files*, glisse les fichiers modifiés (ils remplacent les
anciens), *Commit changes*. Render redéploie automatiquement dans les minutes
qui suivent.

---

## En cas de problème

- **Le déploiement échoue** : ouvre l'onglet *Logs* du service sur Render et
  cherche la première ligne rouge. Cause la plus fréquente : un fichier
  manquant lors du téléversement GitHub (compare avec la liste de l'étape 1).
- **« Site can't be reached »** : le service est en veille, attends
  30–60 secondes et recharge.
- **La partie a disparu** : mise en veille pendant une pause — c'est la limite
  du plan gratuit, relancez une partie.
