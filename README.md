# The King is Dead — adaptation web multijoueur

Application web pour jouer à **The King is Dead (seconde édition)** de Peer Sylvester
à quatre joueurs en ligne, chacun depuis son navigateur. Le serveur arbitre les règles :
il ne propose que des coups légaux et rejette tout le reste.

Deux modes :

- **En ligne** — un joueur crée la partie, les trois autres la rejoignent avec un code
  à quatre lettres. Chacun voit sa propre main ; le plateau se synchronise en temps réel.
- **Un seul écran** — les quatre joueurs jouent à tour de rôle sur le même appareil,
  avec un voile entre les tours pour préserver le secret des mains.

L'interface est **jouable sur téléphone** : sur petit écran, la mise en page passe en
colonne, la carte se déplace au doigt en gardant des cibles tactiles confortables, et
la main défile horizontalement au-dessus du bord de l'écran. Chaque joueur peut donc
rejoindre une partie en ligne depuis son mobile — il suffit d'ouvrir l'URL du serveur
dans le navigateur du téléphone.

Le jeu de base est implémenté (les huit cartes action), avec la variante officielle
à quatre joueurs : **équipes de deux**, les joueurs assis face à face.

---

## Démarrage rapide

Le plus simple : **double-cliquez sur le lanceur** correspondant à votre système —
`Jouer.bat` (Windows), `Jouer.command` (macOS) ou `jouer.sh` (Linux). Un menu
propose de jouer sur cet ordinateur, d'héberger une partie sur Internet (URL
publique temporaire créée automatiquement) ou sur le réseau local. Le lanceur
installe la dépendance au premier démarrage et ouvre le navigateur tout seul.
Il n'y a qu'un prérequis : Node 18 ou plus récent (https://nodejs.org).

> macOS peut bloquer le premier double-clic sur `Jouer.command` (fichier téléchargé) :
> clic droit → Ouvrir, une seule fois. Sous Linux, lancez `./jouer.sh` dans un terminal.

En ligne de commande, si vous préférez :

```bash
npm install
npm start        # serveur seul sur http://localhost:3000
npm run menu     # le même menu que les lanceurs
```

Une seule dépendance : `ws`.

```bash
npm test          # 86 assertions sur le moteur + 400 parties aléatoires simulées
node e2e.mjs      # test bout en bout dans un vrai navigateur (nécessite playwright)
```

---

## Héberger la partie

Vos trois partenaires doivent atteindre le serveur. Trois façons, du plus au moins durable.

### 1. Un hébergeur gratuit — le plus confortable

**Render**, **Railway** ou **Fly.io** conviennent : le projet est un serveur Node
standard qui écoute sur `process.env.PORT`.

Sur Render, par exemple : poussez le dossier sur GitHub, créez un *Web Service*,
laissez la détection automatique faire son travail (`npm install` / `npm start`).
Vous obtenez une URL publique permanente à partager.

Un fichier `render.yaml` est fourni : Render le lit automatiquement.

> Sur le plan gratuit de Render, le service s'endort après une trentaine de minutes
> d'inactivité. Le premier joueur à ouvrir l'URL attend une trentaine de secondes,
> les suivants non. Une partie en cours n'est pas conservée si le service redémarre.

### 2. Chez vous, exposé par un tunnel — aucun compte à créer

```bash
npm start                        # dans un terminal
npx localtunnel --port 3000      # dans un second
```

Le second terminal affiche une URL publique temporaire. Votre machine doit rester
allumée pendant la partie. `cloudflared tunnel --url http://localhost:3000` fait
la même chose si vous préférez.

### 3. Sur le réseau local — si vous êtes tous sous le même Wi-Fi

```bash
npm start
```

L'adresse à partager est affichée par le lanceur (option 3) **et** dans
l'écran « Créer une partie » du jeu.

Si les autres appareils voient « site inaccessible », dans l'ordre :

1. Sur le PC hôte, testez l'adresse réseau (`http://192.168.x.x:3000`) dans
   votre propre navigateur. Si elle marche là mais pas ailleurs, c'est le
   pare-feu ou le réseau.
2. Classez votre Wi-Fi en **« Réseau privé »** : Paramètres → Réseau et
   Internet → Wi-Fi → votre réseau. Sur un réseau « Public », Windows bloque
   tout trafic entrant, quoi qu'on autorise par ailleurs.
3. Lancez **`Autoriser-Parefeu.bat`** par clic droit → *Exécuter en tant
   qu'administrateur* : il ajoute la règle de pare-feu pour le jeu
   (ports 3000-3009, réseaux privés uniquement).
4. Sur le téléphone, tapez l'adresse avec **`http://`** explicite — les
   navigateurs mobiles basculent parfois d'eux-mêmes en `https://`, qui ne
   répond pas.
5. Vérifiez que le téléphone est bien sur le même Wi-Fi (pas en 4G/5G, pas
   sur le réseau « invité » de la box, qui isole les appareils entre eux).

---

## Comment se joue une partie en ligne

1. Un joueur saisit son nom et clique **Créer une partie en ligne**. Un code à quatre
   lettres apparaît.
2. Les trois autres ouvrent la même adresse, saisissent leur nom, cliquent
   **Rejoindre avec un code** et entrent le code.
3. Chacun choisit son siège. **Les sièges opposés — 1 et 3, 2 et 4 — forment une
   équipe**, comme autour d'une vraie table. L'assise est donc un vrai choix.
4. L'hôte clique **Lancer la partie**.

Si quelqu'un recharge la page ou perd la connexion, il revient automatiquement dans
la partie : l'adresse contient un jeton de reprise. Les salons abandonnés sont
effacés après six heures.

---

## Ce que l'interface fait respecter

Le moteur applique le livret ; l'interface ne montre que les coups légaux.

- **Après chaque action, l'invocation d'un suivant à la cour est obligatoire**, et
  toujours depuis une région — jamais depuis la réserve.
- **Régions figées.** Dès qu'une région porte un disque de contrôle ou d'instabilité,
  on ne peut plus y placer, y déplacer ni y prendre de suivant.
- **Actions partielles.** Une carte Soutien avec un seul suivant disponible en réserve
  n'en place qu'un ; une carte sans effet possible reste jouable — l'interface le
  signale (« aucun effet possible ») et vous invoquez tout de même un suivant.
- **Manœuvre obligatoire.** S'il existe un échange possible, vous devez le faire.
  Même chose pour Contre-manœuvre, avec la priorité à l'échange complet 1 contre 2 ;
  l'échange 1 contre 1 n'est proposé que si aucun échange complet n'existe.
- **Interdiction d'annuler.** Vous ne pouvez pas défaire d'un coup exactement la
  Manœuvre (ou la Contre-manœuvre) d'un autre joueur, sauf si au moins une autre
  action a été jouée depuis. Ces échanges ne sont simplement pas cliquables.
- **Négociation.** Seules les cartes région face visible et sans disque sont
  échangeables ; le disque est posé sur l'une des deux, et chaque joueur n'en a qu'un.
- **Luttes de pouvoir.** Déclenchées quand les quatre joueurs passent d'affilée, sur
  la carte région face visible portant le plus petit numéro. Majorité simple, sinon
  instabilité. Les suivants repartent à la réserve, la carte est retournée.
- **Fins de partie.** Trois disques d'instabilité → invasion immédiate ; huit luttes
  résolues → couronnement. Le décompte suit les règles à quatre joueurs, avec tous
  les départages : dernière carte jouée pour l'invasion ; deuxième faction puis
  main vidée en premier pour le couronnement.

---

## Choix d'interprétation

Quelques points que le livret laisse à la lecture de la carte ou à l'usage. Ils sont
tous concentrés dans `public/game.js` et faciles à modifier.

**Les adjacences.** Relevées sur la carte du plateau. Vérifiez-les contre votre
exemplaire — c'est la donnée la plus structurante du jeu.

| Région | Régions bordées |
|---|---|
| Moray | Strathclyde |
| Strathclyde | Moray, Lancaster, Northumbria |
| Lancaster | Strathclyde, Northumbria, Gwynedd, Warwick |
| Northumbria | Strathclyde, Lancaster, Warwick, Essex |
| Gwynedd | Lancaster, Warwick, Devon |
| Warwick | Lancaster, Northumbria, Gwynedd, Essex, Devon |
| Essex | Northumbria, Warwick, Devon |
| Devon | Gwynedd, Warwick, Essex |

Elles se modifient dans la constante `ADJACENCY`, en haut de `public/game.js`.
Le jeu de tests vérifie qu'elles restent symétriques.

**« Une région qui borde une région contrôlée par les Écossais »** est comprise comme
« une région dont au moins une voisine porte un disque de contrôle écossais ». La
région contrôlée elle-même est exclue, puisqu'elle est figée. Au premier tour aucune
faction ne contrôle rien : c'est la clause de repli sur la région d'origine qui
s'applique.

**« Annuler la Manœuvre d'un autre joueur »** est compris strictement : est interdit
le coup qui remet exactement les mêmes suivants dans les mêmes régions. Un échange
qui n'annule que partiellement reste permis. Un joueur peut défaire sa propre Manœuvre.

**Ordre du tour et sièges.** Le sens horaire est celui des sièges du salon. À quatre,
les sièges 1 et 3 sont coéquipiers, de même que 2 et 4.

**Non implémenté.** Le jeu avancé et ses douze cartes Cunning (Spy, Ambush, March,
Plot, Aid, Influence, Dispute, Edict, Resist, Quell, Suppress, Muster). L'ossature est
là : ajouter une entrée dans `CARDS` et une branche dans `resolveCard` suffit.
Les configurations à deux et trois joueurs fonctionnent (la mise en place à deux
retire bien deux suivants par faction) mais n'ont pas été jouées à la table.

---

## Organisation du code

```
server.js            serveur HTTP + WebSocket ; détient l'état, revalide chaque coup
lancer.js            lanceur avec menu (jouer ici / Internet / réseau local)
Jouer.bat, Jouer.command, jouer.sh   lanceurs à double-cliquer par système
public/game.js       moteur de règles — isomorphe, utilisé par le serveur et le client
public/board.js      rendu du plateau : carte, banderoles, châteaux, piste des luttes
public/map-data.js   géométrie de la carte (fichier généré, ne pas éditer)
build-map.mjs        générateur de la carte à partir du littoral Natural Earth
public/ui.js         interface : salon, sélection guidée des cibles, écran de fin
public/index.html    structure
public/style.css     habillage parchemin, cadre enluminé, cartes action
test.js              tests du moteur
e2e.mjs              test bout en bout dans un navigateur
```

Le moteur est la seule source de vérité. `applyMove(state, seat, move)` lève une
exception sur tout coup illégal ; `cardChoices(state, card)` énumère les cibles
légales, ce dont l'interface se sert pour ne rendre cliquable que ce qui est permis.
Le client calcule les mêmes options pour son affichage, mais c'est toujours le
serveur qui tranche.

`viewFor(state, seat)` produit la vue envoyée à un joueur : sa main en clair, celle
des autres réduite à un nombre, et pour chaque adversaire seulement la dernière carte
défaussée — comme sur la table, où l'on voit la dernière action de chacun mais pas
sa pile.

---

## La carte

La carte reprend le **littoral réel de la Grande-Bretagne** (données libres
Natural Earth, résolution 1:10 M), découpé en huit régions le long des frontières
que suit le plateau — ligne des Highlands, frontière anglo-écossaise, crête des
Pennines, ligne Mersey–Humber, marche galloise, Severn — puis projeté en conique
conforme, la projection classique des cartes des îles Britanniques. La France
occupe le coin sud-est avec ses trois emplacements de disques d'instabilité.

Le générateur (`build-map.mjs`) vérifie à chaque exécution que le découpage
produit **exactement les adjacences du jeu** et que la partition ne laisse ni
interstice ni recouvrement. Pour ajuster une frontière, modifiez les polylignes
`L_*` en tête de ce fichier puis relancez `node build-map.mjs` (nécessite
`npm install --no-save world-atlas topojson-client polygon-clipping d3-geo`).

Les cartes action reprennent le langage graphique de celles du jeu : cadre
enluminé rouge et bleu à écoinçons dorés, panneau supérieur portant le schéma de
l'action en pictogrammes (cubes, flèches, régions), écu de faction pour les cartes
Soutien et banderole de titre. Les illustrations originales de Benoit Billion étant
protégées, ces dessins sont des créations originales dans le même esprit
(`public/cards.js`).

L'habillage du plateau — côtes ourlées d'or, banderoles de parchemin, silhouettes de
châteaux, lignes de rhumb, cadre enluminé, coffre de la réserve — est dessiné
en SVG dans le style du plateau imprimé, avec ses couleurs : Moray bleu, Strathclyde
ocre, Lancaster sarcelle, Northumbria rose, Gwynedd brique, Warwick ardoise,
Essex chartreuse, Devon vert. Les polices (**Uncial Antiqua**, **EB Garamond**)
viennent de Google Fonts ; sans Internet, le navigateur retombe proprement sur
des polices système.

---

Jeu original : *The King is Dead, Second Edition* — conception Peer Sylvester,
illustrations Benoit Billion, édité par Osprey Games. Cette adaptation est un
projet personnel non officiel ; procurez-vous le jeu physique.
