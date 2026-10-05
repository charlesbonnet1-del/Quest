# DECISIONS

Choix techniques du MVP, leurs raisons, et ce qui est simplifié ou provisoire.

## Architecture

- **Tout le jeu tourne sur le téléphone.** Le moteur (`lib/engine`), la classification d'environnement
  (`lib/environment`) et le filtrage GPS (`lib/geo`) sont des modules purs, sans dépendance au navigateur : ils sont
  testés en Node et réutilisés par `pnpm sim:replay`. Le serveur sert l'app, relaie Overpass et reçoit les retours.
- **Préparation, quête et fin sur une seule page** (`/jouer/[id]`) : aucune navigation réseau pendant la sortie, donc
  aucun risque de chargement de route qui échoue en mode avion.
- **Session client** (`lib/session/session.ts`) : une classe sans React qui assemble position, moteur, lecteur audio,
  Wake Lock et pack hors ligne ; l'interface s'y abonne avec `useSyncExternalStore`.
- **Horloge abstraite** : réelle sur le terrain, accélérée en simulation (les écarts et silences des défis
  raccourcissent avec la vitesse de rejeu ; l'audio, lui, reste en temps réel).

## Contenu

- Schéma Zod partagé (`lib/content/schema.ts`), objets **stricts** : une faute de frappe (`foret_dense`) est refusée.
- Une **variante = liste de segments** (et non un segment unique) : permet d'alterner narrateur et héros.
- Ajouts au modèle demandé : `provisoire`, `resume`, `distanceEstimeeM`, `conclusionEcartS` (délai avant la
  conclusion), `defi.attenteS` (silence d'attente, 20 s par défaut) et `defi.bravo` (réplique après un défi),
  `heros.voixElevenLabs` (voix propre à un héros).
- Les seuils de distance doivent être croissants ; identifiants de segments uniques dans une quête.
- Clé d'un segment : `<idQuête>/<idSegment>` ou `poi/<idSegment>`.
- **Lignes de lieux d'intérêt** génériques par type (`content/poi.json`), dites avec la voix héros par défaut.
  Simplification : elles ne sont pas spécifiques à un héros (le texte actuel parle de « dragon »). À faire quand il y
  aura plusieurs héros : `poi.json` par héros.
- **Quête Braise et `poi.json` : CONTENU PROVISOIRE**, à réécrire.

### `content:lint`

Erreurs : schéma invalide, `default` absent, expressions interdites (escalader, grimper, entrer dans l'eau,
baignade/plonger, traverser, inconnu, quitter le groupe, courir sur la route, s'éloigner seul, **et toute instruction
de direction** : « va vers », « dirige-toi », « rejoins », « tourne à gauche »…), défi physique sans mention de lieu
sûr (« endroit sûr », « loin des voitures », « sans circulation », « sur place »…), introduction de sécurité qui ne
rappelle pas la responsabilité de l'adulte et le fait de garder l'enfant en vue.
Avertissements : variantes d'environnement manquantes, segment estimé à plus de 45 s, défi d'observation sans bouton.
La comparaison ignore accents et majuscules. Liste à enrichir avec l'usage : un linter lexical ne remplace pas une
relecture humaine.

## Audio

- **Hash** = SHA-256 de (texte normalisé + id de voix + modèle + **format de sortie**), tronqué à 24 caractères.
  Le format est ajouté car il change le fichier. Normaliser les espaces évite de payer une régénération pour un retour
  à la ligne. Les réglages de voix (`ELEVENLABS_VOICE_SETTINGS`) ne sont **pas** dans le hash : après les avoir
  changés, utiliser `--force`.
- **Manifeste** `content/audio-manifest.json`, commité : `files` (tout ce qui a été généré, par hash, jamais oublié) et
  `segments` (segment actuel → hash). Écrit après **chaque** fichier (écriture atomique) : un arrêt (Ctrl+C, quota,
  coupure) est repris en relançant la commande.
- **Dry-run par défaut** : sans `--yes`, le script affiche le devis et demande « oui » ; sans terminal interactif, il
  refuse. Le devis fonctionne même sans voix configurées.
- Erreurs : 429 (limite de débit/concurrence) et 5xx réessayés 6 fois avec attente exponentielle + gigue, en
  respectant `Retry-After` ; 401/403 et quota épuisé arrêtent tout ; 4xx autres = échec du segment seulement.
- API vérifiée sur la doc à jour : `POST /v1/text-to-speech/{voice_id}?output_format=…`, en-tête `xi-api-key`,
  corps `{ text, model_id, language_code?, voice_settings? }`. `language_code` n'est envoyé qu'aux modèles
  Flash/Turbo v2.5 (les autres le refusent).
- Modèles : `eleven_flash_v2_5` pour itérer (≈ moitié prix), `eleven_multilingual_v2` (ou `eleven_v3`) avec
  `--quality`. Tarifs par défaut de l'estimation **indicatifs** : renseigner `ELEVENLABS_COST_PER_1K_CHARS` selon
  votre offre.
- **Durée** calculée depuis la taille et le débit (MP3 à débit constant) : exacte à quelques ms, sans dépendance.
- **Stockage : Vercel Blob** (public, nom = hash, cache 1 an). Repli `public/audio` si pas de jeton
  (`AUDIO_STORAGE=local`), utile en local mais déconseillé en production : les MP3 alourdiraient le dépôt et chaque
  déploiement. Blob sert `Access-Control-Allow-Origin: *`, ce qui permet au client de les mettre en cache.

## Lecture audio côté client

- Un **seul `<audio>`**, déverrouillé au clic « Partir » (son silencieux + reprise de l'AudioContext + énoncé vide de
  synthèse vocale), puis réutilisé : condition pour que iOS accepte de jouer ensuite sans geste.
- Les MP3 sont lus depuis **Cache Storage via une URL `blob:`** et non via le service worker : évite les problèmes de
  requêtes partielles (Range) de Safari avec un cache de service worker.
- Ordre de secours : cache → réseau → **voix de synthèse du téléphone** (`speechSynthesis`, fr-FR) → passer au suivant.
  Ce n'est pas un LLM ni ElevenLabs à l'exécution : seulement un filet pour qu'un fichier manquant ne bloque jamais la
  marche. Un minuteur de garde termine la lecture si le navigateur ne signale jamais la fin.
- Signal de fin : deux bips synthétisés (oscillateur Web Audio) + `navigator.vibrate` (ignoré par iOS).
- Media Session renseignée (titre sur l'écran de verrouillage), sans plus.

## Hors ligne

- **Serwist** (`@serwist/next`) : précache des ressources du build et des pages (`/`, `/jouer/<id>`, réglages,
  confidentialité, page hors ligne), cache d'exécution par défaut. Nécessite le build webpack
  (`next build --webpack`) avec Next 16. `reloadOnOnline: false` : **ne jamais recharger la page au retour du réseau**,
  cela couperait une quête. Service worker désactivé en `pnpm dev`.
- **IndexedDB** (`idb-keyval`) : paquet de la quête, dernier contexte OSM, état du moteur (sauvegardé toutes les 3 s et
  à la mise en arrière-plan, pour reprendre après une fermeture), retours en attente d'envoi.
- **Cache Storage** `quete-audio-v1` : MP3. `navigator.storage.persist()` demandé.
- Téléchargement **par priorité** : intro, variantes de l'environnement détecté (+ défis), conclusion, puis lieux
  d'intérêt, puis autres environnements. « Partir » est possible dès l'environnement connu ; le reste continue en
  arrière-plan.
- Préparation sans réseau : paquet déjà enregistré (sinon message clair) ; contexte OSM réutilisé si la dernière zone
  téléchargée couvre la position (à plus de 1 km du bord), sinon `default` + choix manuel.

## Position

- `watchPosition` haute précision, `maximumAge: 3000`. Le navigateur ne permet pas de régler la fréquence du GPS ;
  économies possibles : le suivi est **arrêté pendant les pauses**, l'écran est quasi noir, aucun calcul lourd.
- **Filtre** (`lib/geo/filter.ts`) : précision > 30 m ignorée ; saut au-delà de 4,5 m/s (avec tolérance due à
  l'imprécision) ignoré ; distance ajoutée seulement au-delà de 6 m (ou la moitié de la précision) du dernier point
  retenu, pour que la dérive à l'arrêt ne fasse pas monter le compteur ; recalage après 4 « sauts » cohérents
  (ancrage initial faux). Haversine pour les distances.
- La distance marchée pendant une pause n'est pas comptée (nouvel ancrage à la reprise).

## Détection de l'environnement

- `POST /api/context` (POST pour que les coordonnées n'apparaissent pas dans les URL/journaux d'accès). Position
  arrondie à une grille de ~100 m **côté client et à nouveau côté serveur**. Aucune journalisation.
- Une requête Overpass (rayon 3 km) : bois/forêts, parcs/jardins/aires de jeux/pelouses, plans d'eau, rivières et
  canaux (hors tunnels), rivage, terres agricoles, zones bâties (`landuse=residential|commercial|retail|industrial`),
  éléments remarquables, plus un **comptage** des bâtiments à 300 m (densité urbaine au départ).
- Réponse simplifiée côté serveur (Douglas-Peucker 3 m, coordonnées à 5 décimales) pour un pack léger. Les relations
  multipolygones sont réassemblées (anneaux extérieurs et intérieurs).
- **Règles de priorité** (`lib/environment/classify.ts`), première qui s'applique :
  1. `bord_eau` : plan d'eau d'au moins 1000 m² (les petits bassins ne comptent pas), rivière, canal ou rivage à moins
     de 50 m. Prioritaire car c'est le plus marquant et le plus important pour la sécurité (textes « reste loin du bord ») ;
  2. `foret` : sous `natural=wood` / `landuse=forest` ;
  3. `parc` : sous un parc, jardin, aire de jeux, réserve naturelle, terrain de loisirs, ou pelouse ≥ 2000 m²
     (les bandes d'herbe le long des routes sont ignorées) ;
  4. `campagne` : sous des terres agricoles (champs, prés, vergers, vignes), ou à moins de 150 m sans bâti à moins de 150 m ;
  5. `ville` : zone bâtie à moins de 150 m, ou au moins 30 bâtiments à 300 m du départ ;
  6. sinon `campagne` si des terres agricoles sont à moins de 500 m, sinon `default`.
- Réévaluation tous les 300 m à partir des données déjà téléchargées (aucun réseau). La correction du parent
  (« On est plutôt… ») est prioritaire jusqu'à ce qu'il revienne sur « Automatique ».
- Échec d'Overpass : `default` + sélecteur manuel.
- Simplifications : pas de bâtiments individuels ni de voirie (trop volumineux à 3 km en ville) ; la densité urbaine
  n'est mesurée qu'au départ. Les ruisseaux (`waterway=stream`) ne déclenchent pas `bord_eau`.
- **Instance Overpass publique** : acceptable pour ce test (liste configurable, délai, bascule). **En production, il
  faudra auto-héberger les données** (extrait OSM France + Overpass ou PostGIS, ou tuiles vectorielles pré-calculées) :
  les instances publiques limitent le débit et n'offrent aucune garantie de disponibilité.
- Cache serveur en mémoire par cellule (24 h) : par instance de fonction seulement. À remplacer par un cache partagé
  si le trafic augmente.

## Moteur de jeu

- Machine à états `pret → en_cours ⇄ en_pause → termine`, état entièrement sérialisable. Après un rechargement, la
  quête revient **en pause** et l'audio interrompu est rejoué depuis le début.
- Déclencheur : distance cumulée ≥ seuil **et** temps de jeu actif depuis la **fin** du précédent événement ≥
  `ecartMinS` (la fin, pas le début : un long défi ne « consomme » pas l'écart). Le premier écart part de la fin de
  l'introduction. Les événements sont joués **dans l'ordre**, un à la fois ; les pauses ne comptent pas.
- File d'attente : jamais deux audios en même temps ; pas de nouvel événement tant qu'un audio joue ou qu'un défi est en
  cours.
- Défi : audio → silence `attenteS` → bouton « C'est fait » si `parentConfirme` (pas de validation automatique ; le
  bouton n'existe qu'après le silence) → `bravo` éventuel. Défis sans bouton : terminés après le silence.
- Conclusion `conclusionEcartS` après la fin du dernier événement. « On est fatigués » coupe tout et joue la conclusion.
  « Répéter » rejoue l'audio en cours ou le dernier, sans effet sur le déroulé. « Terminer » arrête sans conclusion
  (avec confirmation, comme « fatigués », pour éviter les appuis involontaires dans une poche).
- Choix de variante : environnement effectif (correction du parent, sinon détection) au moment du déclenchement,
  sinon `default`.

## Rebonds sur les lieux d'intérêt

- Types : statue (`historic=memorial`+`memorial=statue`, `tourism=artwork`+`artwork_type=statue`,
  `historic=statue`), fontaine (`amenity=fountain`), monument (`historic=monument`), point de vue
  (`tourism=viewpoint`), arbre remarquable (`natural=tree` avec `denotation=natural_monument|landmark`), plan d'eau
  (`natural=water` ≥ 200 m², distance mesurée au contour), forêt (≥ 5000 m², au contour), aire de jeux (au contour).
- Déclenchement à **30 m au plus** (élément déjà tout proche : le héros commente, n'envoie jamais), un seul rebond
  toutes les **3 minutes**, jamais pendant un audio ni un défi, pas dans les 20 s après un événement, pas si le
  prochain événement est à moins de 40 m, pas après le dernier événement. Chaque élément une seule fois ; les deux
  variantes d'un type alternent. Pas de rebond « forêt » en forêt ni « plan d'eau » au bord de l'eau (redondant).
- Les déclencheurs à la distance restent le moteur principal : sans élément remarquable, rien ne change.

## Sécurité

- Message à accepter avant chaque départ (case « J'ai compris »), répété à voix haute par le narrateur au début.
- Avertissement non bloquant si le coucher du soleil (SunCalc) tombe avant la fin estimée, ou s'il fait nuit.
- Pause automatique quand l'app passe en arrière-plan ou que l'écran se verrouille, avec message au retour.
  (Désactivée en mode simulation pour pouvoir changer d'onglet au bureau.)

## Interface

- Écran de quête noir, textes gris foncés, aucune carte, aucune animation sauf l'icône « parle ». Boutons larges.
- Mode simulation : `?sim=1` ou Réglages ; panneau replié par défaut sur téléphone.

## Retours et administration

- `POST /api/feedback` : schéma strict (un champ en plus, par ex. une position, est refusé), commentaire ≤ 1000
  caractères. L'adresse IP n'est ni lue ni stockée. Hors ligne : mis en file d'attente sur le téléphone, renvoyé à la
  prochaine ouverture.
- **Stockage : Vercel Blob**, un petit JSON par retour, magasin **privé** conseillé. Raison : déjà utilisé pour l'audio,
  aucune base à provisionner, volume attendu faible (lecture complète dans l'admin, jusqu'à quelques milliers). Au-delà,
  passer à Postgres (Neon) ou Redis (Upstash) via la Marketplace Vercel. En local sans jeton : `.data/feedback.jsonl`.
- `/admin` : page client, le secret est saisi à chaque fois (jamais stocké), envoyé en `Authorization: Bearer`,
  comparé en temps constant ; refus si `ADMIN_SECRET` fait moins de 12 caractères.

## Ce qui est collecté (RGPD)

| Donnée | Où | Durée |
|---|---|---|
| Position précise, trajet | téléphone uniquement (mémoire, état de quête en IndexedDB effacé en fin de quête) | — |
| Position arrondie ~100 m | envoyée une fois à `/api/context`, transmise à Overpass, non journalisée ; cache mémoire du serveur clé = cellule | 24 h max en mémoire |
| Données OSM autour (3 km) | téléphone (IndexedDB) | jusqu'à effacement (Réglages) |
| Retour de fin (quête, environnement, durée, distance, note, oui/non, commentaire, type de fin) | Vercel Blob | à définir (purge manuelle pour le MVP) |

Pas de compte, de cookie, d'analytique ni de pisteur. Page « Confidentialité » dans l'app. Le commentaire libre peut
contenir des données personnelles si le parent en écrit : l'interface le déconseille ; prévoir une purge périodique.

## Tests

- 83 tests Vitest : Haversine, arrondi, polygones, filtre de position ; classification sur jeux de données OSM réalistes
  (Parc Monceau, Berges de Seine, rue Montorgueil, forêt de Fontainebleau avec clairière, Beauce, zone vide) ;
  analyse de réponses Overpass (relations en morceaux) ; moteur (seuils, écarts, file, variantes, défis, pause,
  fatigue, répétition, audio manquant, restauration, rebonds) ; quête complète sur les 3 trajets ; schéma de contenu,
  linter, hash, plan de génération, client ElevenLabs (429/5xx/401/quota) ; ordre de téléchargement ; coucher du soleil ;
  schéma des retours.
- Les jeux de données OSM sont **tracés à la main** (pas d'accès à Overpass depuis l'environnement de développement) :
  proches de la réalité mais pas identiques. Les trajets prédéfinis suivent ces tracés.
- `scripts/e2e-sim.mjs` : parcours complet dans Chromium (préparation, quête à ×20, retour, rechargement et quête en
  mode hors ligne).

## Provisoire / à faire ensuite

- Réécrire la quête et les lignes de lieux (contenu provisoire).
- Auto-héberger les données OSM ; cache serveur partagé.
- Tester sur vrais appareils en extérieur (voir le compte rendu de livraison) et ajuster seuils du filtre GPS et
  règles de classification.
- Lignes de lieux par héros ; plus de types d'éléments.
- Purge automatique des retours.
