# PLAN — MVP « Quête »

Plan écrit avant de coder. Il fixe l'ordre de livraison, les points de contrôle et les risques.

## Architecture en une phrase

Une PWA Next.js (App Router) dont tout le « cerveau » de jeu tourne côté client, hors ligne,
à partir d'un **pack** (quête + manifeste audio + données de contexte OSM) téléchargé pendant la
préparation. Le serveur ne sert qu'à trois choses : servir l'app, relayer Overpass (`/api/context`,
coordonnées arrondies, sans journalisation) et recevoir les retours anonymes (`/api/feedback`).

```
content/*.json ──(content:lint)──> validé par Zod (lib/content)
        └──(audio:generate)──> ElevenLabs ──> Vercel Blob (ou public/audio) + content/audio-manifest.json
Client : Préparation ─> /api/context ─> Overpass (cache serveur)
                     ─> Cache Storage (audio) + IndexedDB (quête, contexte)
         Quête : PositionProvider (réel | simulé) ─> filtre ─> moteur (machine à états + déclencheurs)
                 ─> file audio (un seul son à la fois) + bips Web Audio + vibration Android
```

## Jalons

| # | Jalon | Livrables | Test d'acceptation |
|---|-------|-----------|--------------------|
| 1 | Contenu et audio | schéma Zod, quête « Braise » provisoire, `poi.json`, `pnpm content:lint`, `pnpm audio:generate` (dry-run par défaut, confirmation, reprise, retries), manifeste | `pnpm content:lint` vert ; `pnpm audio:generate --dry-run` affiche segments / caractères / coût ; génération réelle avec le modèle économique puis écoute de 2-3 fichiers |
| 2 | Moteur et simulation | haversine + filtre, machine à états, déclencheurs, choix de variante, classification d'environnement, fournisseur simulé, 3 trajets Paris | `pnpm test` ; `pnpm sim:replay parc` affiche la séquence d'événements dans la console |
| 3 | Interface PWA | 4 écrans, Wake Lock, pack hors ligne, déverrouillage audio, service worker, manifest/icônes | quête complète en `?sim=1` sur téléphone, puis en mode avion après téléchargement |
| 4 | Rebonds lieux d'intérêt | extraction POI Overpass, déclenchement ~30 m, cooldown, jamais pendant un défi | trajet simulé passant près d'une statue / d'un plan d'eau |
| 5 | Retours et déploiement | `/api/feedback`, stockage, `/admin?` protégé par secret, instructions Vercel | envoyer un retour, le voir dans l'admin |

## Risques identifiés

1. **iOS Safari** : audio bloqué sans geste utilisateur, pas de vibration, géolocalisation stoppée
   écran verrouillé, Wake Lock seulement depuis iOS 16.4 (et PWA installée parfois capricieuse).
   → déverrouillage audio au bouton « Partir », pause auto sur `visibilitychange`, message d'aide.
2. **Précision GPS en forêt / ville dense** : sauts, dérive à l'arrêt qui gonfle la distance.
   → filtre précision (> 30 m ignoré), vitesse max (≈ 3,5 m/s soutenue), déplacement minimal.
3. **Overpass public** : lent, limité, parfois indisponible. → plusieurs endpoints, timeout,
   cache serveur, repli « default » + sélecteur manuel. À auto-héberger en production.
4. **Classification d'environnement** : OSM incomplet ou ambigu. → règles simples et documentées,
   correction manuelle par le parent, tests sur des jeux de données réalistes.
5. **Coût ElevenLabs** : régénération inutile. → hash (texte + voix + modèle), dry-run par défaut.
6. **Service worker + Next 16** : Serwist nécessite le build webpack. → `next build --webpack`.
7. **Pas de test sur vrai appareil en extérieur depuis cet environnement** : à valider par vous.

## Hors périmètre (rappel)

Comptes, paiement, LLM, prénom, partage, conversation, RA, natif, notifications, autres langues,
reconnaissance photo, carte pendant la quête.
