# Quête

PWA d'aventures audio en extérieur pour les familles (enfants de 6 à 10 ans). Le parent lance une quête, range le
téléphone, et un héros raconte une histoire qui s'adapte au décor (ville, parc, forêt, bord de l'eau, campagne) et
déclenche ses événements selon la distance marchée. Tout se joue hors ligne une fois la quête préparée.

- [PLAN.md](PLAN.md) : jalons et risques.
- [DECISIONS.md](DECISIONS.md) : choix techniques, simplifications, ce qui est provisoire, données collectées.

## Installation

Prérequis : Node 20 ou plus, pnpm 10.

```bash
pnpm install
cp .env.example .env.local   # puis remplir (voir ci-dessous)
pnpm dev                     # http://localhost:3000
```

## Commandes

| Commande | Rôle |
|---|---|
| `pnpm dev` | serveur de développement (service worker désactivé) |
| `pnpm build && pnpm start` | build de production (avec service worker) et serveur |
| `pnpm test` | tests unitaires (Vitest) |
| `pnpm typecheck` | vérification TypeScript stricte |
| `pnpm content:lint` | vérifie les contenus (schéma, `default`, expressions interdites, lieu sûr des défis physiques) |
| `pnpm audio:generate --dry-run` | devis : segments à générer, caractères, coût estimé. Aucun appel payant |
| `pnpm audio:generate` | génère ce qui manque, **après confirmation** (`--yes` pour ne pas demander) |
| `pnpm audio:generate --quality` | idem avec le modèle de qualité (`ELEVENLABS_MODEL_QUALITY`) |
| `pnpm audio:generate --only=<idQuête\|poi>` / `--force` | limiter à une quête / tout régénérer |
| `pnpm sim:replay [parc\|berge\|rue]` | rejoue la quête sur un trajet simulé, en console, sans navigateur |
| `pnpm sim:replay parc --live` | idem mais avec les vraies données Overpass |
| `pnpm test:e2e` | parcours complet dans Chromium (voir l'en-tête de `scripts/e2e-sim.mjs`) |
| `pnpm fixtures:generate` | régénère les données OSM de test de `lib/sim/fixtures` |

## Variables d'environnement

Toutes sont décrites dans [`.env.example`](.env.example). Aucune n'est exposée au navigateur.

| Variable | Utilisée par | Rôle |
|---|---|---|
| `ELEVENLABS_API_KEY` | script audio | clé API |
| `ELEVENLABS_VOICE_NARRATEUR`, `ELEVENLABS_VOICE_HEROS` | script audio | identifiants des deux voix (un héros peut avoir sa propre voix : `heros.voixElevenLabs` dans la quête) |
| `ELEVENLABS_MODEL` / `ELEVENLABS_MODEL_QUALITY` | script audio | modèle économique (défaut `eleven_flash_v2_5`) / de qualité (défaut `eleven_multilingual_v2`) |
| `ELEVENLABS_OUTPUT_FORMAT` | script audio | défaut `mp3_44100_64` (MP3 mono 64 kbps) |
| `ELEVENLABS_COST_PER_1K_CHARS`, `ELEVENLABS_COST_CURRENCY` | script audio | tarif de l'estimation du coût |
| `ELEVENLABS_CONCURRENCY`, `ELEVENLABS_VOICE_SETTINGS`, `ELEVENLABS_LANGUAGE_CODE` | script audio | réglages fins |
| `BLOB_READ_WRITE_TOKEN` | script audio, serveur | Vercel Blob (audio public) |
| `AUDIO_STORAGE` | script audio | `blob` ou `local` (dossier `public/audio`) |
| `FEEDBACK_BLOB_READ_WRITE_TOKEN`, `FEEDBACK_BLOB_ACCESS` | serveur | magasin Blob des retours (privé conseillé) |
| `OVERPASS_ENDPOINTS`, `OVERPASS_TIMEOUT_MS` | serveur | instances Overpass (essayées dans l'ordre) et délai |
| `ADMIN_SECRET` | serveur | secret de la page `/admin` (12 caractères minimum) |

## Ajouter ou modifier une quête

1. Déposer un fichier `content/quests/<id>.json` (copier la quête Braise comme modèle ; le schéma est dans
   `lib/content/schema.ts`). Lignes des lieux d'intérêt : `content/poi.json`.
2. `pnpm content:lint` doit passer.
3. `pnpm audio:generate --dry-run`, puis `pnpm audio:generate`. Seuls les segments nouveaux ou modifiés sont
   synthétisés (identifiés par le hash texte + voix + modèle + format). Le manifeste `content/audio-manifest.json` est
   mis à jour : **le commiter**.
4. Redéployer. La quête apparaît sur l'accueil.

Un segment sans audio est lu par la voix de synthèse du téléphone (repli), et signalé à la préparation.

## Tester

### Au bureau (mode simulation)

1. `pnpm dev`, puis ouvrir `http://localhost:3000/?sim=1` (ou cocher « Mode simulation » dans Réglages).
2. Préparer le départ. Un panneau bleu « SIM » permet de choisir un trajet (Parc Monceau, Berges de Seine,
   Rue Montorgueil), un GPX, un point de départ, d'avancer de 20/50/200 m, de marcher à vitesse ×1 à ×20, et de
   cocher « Données OSM de test » pour se passer d'Overpass.
3. La séquence des événements s'affiche dans le panneau et dans la console (`[Quête] …`).

Sans navigateur : `pnpm sim:replay parc` (ou `berge`, `rue`).

### Sur téléphone

- La géolocalisation, le service worker et le Wake Lock exigent **HTTPS** : utiliser un déploiement Vercel de
  prévisualisation (le plus simple), ou un tunnel HTTPS vers `pnpm build && pnpm start`.
- Installer sur l'écran d'accueil : iPhone (Safari) → Partager → « Sur l'écran d'accueil » ; Android (Chrome) → menu →
  « Installer l'application ».
- Test simulé sur téléphone : ouvrir `https://<déploiement>/?sim=1`.
- Test hors ligne : préparer la quête jusqu'à « prêt pour le mode avion », passer en mode avion, puis « Partir ».
  Recharger la page en mode avion doit aussi fonctionner (page et quête en cache).
- Test réel : préparer dans un parc, mode avion, marcher. Événements à ~80, 300, 550, 800 et 1050 m.

## Déploiement Vercel

1. Importer le dépôt dans Vercel (framework Next.js détecté ; la commande de build `pnpm build` utilise
   `next build --webpack`, requis par Serwist pour générer le service worker).
2. Storage → créer un magasin **Blob public** pour l'audio, le relier au projet (crée `BLOB_READ_WRITE_TOKEN`).
   Pour les retours, créer de préférence un second magasin **Blob privé** et copier son jeton dans
   `FEEDBACK_BLOB_READ_WRITE_TOKEN`. Avec un seul magasin public, mettre `FEEDBACK_BLOB_ACCESS=public`.
3. Définir `ADMIN_SECRET` (et éventuellement `OVERPASS_ENDPOINTS`).
4. En local, avec `BLOB_READ_WRITE_TOKEN` dans `.env.local` : `pnpm audio:generate` envoie les MP3 sur Blob et
   écrit leurs URL dans `content/audio-manifest.json`. Commiter le manifeste, pousser : Vercel redéploie.
5. Vérifier : `/`, une préparation complète, `/admin` avec le secret.

Les clés ElevenLabs n'ont **pas** besoin d'être sur Vercel : l'app ne contacte jamais ElevenLabs.
