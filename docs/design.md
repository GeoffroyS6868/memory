# Memory — conception

Bloc-notes local : on tape une idée ou une chose à faire en bas de l'écran, elle devient une bulle qui s'envole et flotte, avec les autres, dans un espace 3D derrière.

## Principes

- Une seule vue, plein écran (`h-dvh`, `overflow: hidden`), aucun scroll.
- Monochrome noir/blanc. Couleurs uniquement via les tokens Nuxt UI (`bg-default`, `text-highlighted`, `text-muted`, `border-default`, `bg-elevated`, `bg-inverted`, `text-inverted`…). Clair et sombre suivent le système.
- Aucun composant Nuxt UI sauf `UApp` (racine obligatoire) et `UButton`.
- Données 100 % locales (`localStorage`), rien n'est envoyé.

## Modèle

```ts
interface Memo { id: string; text: string; createdAt: number }
```

Stocké sous la clé `memory:memos:v1` (tableau JSON). Lecture au montage côté client uniquement (la page est prérendue).

## Espace 3D

Coordonnées normalisées : `x ∈ [-1, 1]`, `y ∈ [-1, 0.55]` (on garde le bas libre pour l'input), `z ∈ [0, 1]` (0 = près, 1 = loin).

Le mouvement est une **fonction pure du temps**, pas une simulation qui accumule de l'état :

```
pos(t) = home + Σ amp_i · sin(2π · f_i · t + phase_i)    // 2-3 sinus par axe
```

- `home`, `phase_i`, `f_i` dérivés d'un hash de `memo.id` → disposition stable d'un rechargement à l'autre.
- Fréquences 0.008–0.03 Hz, amplitudes ~0.12 en x/y et ~0.25 en z : dérive très lente, comme des poussières dans l'air, et les bulles avancent / reculent.
- Clamp final dans les bornes.

Projection (pas de CSS `perspective`, on calcule nous-mêmes) :

```
s       = 1 / (1 + z · 2.2)
screenX = cx + x · (W/2) · s
screenY = cy + y · (H/2) · s
opacity = 1 − z · 0.7
blur    = round(z · 4 · 2) / 2 px     // quantifié pour limiter les repaints
zIndex  = round((1 − z) · 1000)
```

Une seule boucle `requestAnimationFrame` écrit `transform`, `opacity`, `zIndex` et une variable `--blur` directement sur les éléments (template refs), sans réactivité Vue par frame.

## Envol

À l'envoi, l'input donne son rectangle (`getBoundingClientRect`). La bulle naît à cet endroit, échelle 1, puis interpole vers sa position projetée *vivante* (qui dérive déjà) en ~1.4 s, easing `easeOutCubic`, avec une légère courbe (arc vers le haut). Une nouvelle bulle a un `z` de départ entre 0.25 et 0.55. `prefers-reduced-motion` : pas de dérive, pas d'envol animé.

## Bulle

Div arrondie, squircle quand le navigateur sait faire :

```css
.squircle { border-radius: 1.25rem; }
@supports (corner-shape: squircle) { .squircle { border-radius: 2rem; corner-shape: squircle; } }
```

`bg-elevated`, `border border-default`, `text-highlighted`, `text-sm`, `max-w-72`, `line-clamp-4`, `filter: blur(var(--blur))`. Au survol : `filter: none`, opacité pleine (via une classe qui surcharge, les styles de la boucle passant par des variables CSS).

## Faite / supprimer

`Memo` gagne `done?: boolean` (absent = pas faite ; les anciennes données restent valides).

- La bulle a `tabindex="0"`. Au survol ou au focus (`:hover`, `:focus-within` — le tap sur mobile donne le focus), une petite barre d'actions apparaît, accrochée sous le coin bas-droit de la bulle (position absolue, `bg-default`, `border-default`, arrondie), en fondu. Elle ne change pas la taille de la bulle.
- Deux `UButton` `size="xs"`, `color="neutral"`, `variant="ghost"`, icône seule :
  - `i-lucide-check` « Marquer comme faite » ↔ `i-lucide-undo-2` « Rétablir » ;
  - `i-lucide-x` « Supprimer ».
- **Faite** : texte barré, `text-muted`. La bulle recule : `z += 0.3` (clampé), atteint en douceur — la boucle fait tendre un facteur `doneBlend` vers 0/1 en ~1 s au lieu de sauter.
- **Supprimer** : la bulle « éclate » (scale → 1.25, opacité → 0, ~450 ms, easeOutCubic) puis est retirée du stockage. Pas de confirmation : le geste est volontaire et l'animation le rend lisible.
- `Suppr` / `Backspace` sur une bulle focalisée = supprimer ; `Entrée` / `Espace` = basculer faite.

## Input

Pilule fixe en bas au centre. Repos : une ligne, ~ `w-80`. Focus ou texte présent : grandit (largeur ~ `w-[36rem]`, max `calc(100vw-2rem)`, hauteur jusqu'à ~6 lignes) avec transition. `Entrée` envoie, `Maj+Entrée` = nouvelle ligne, `Échap` = blur. Texte vide/espaces = rien.

Bouton (`UButton`, `color="neutral"`, `variant="solid"`, rond, icône `i-lucide-arrow-up`) : **« Lâcher »** — on lâche l'idée comme un ballon. Le label sert d'`aria-label` / tooltip ; visuellement icône seule au repos, label visible quand l'input est ouvert.

## Fichiers

| Fichier | Rôle |
|---|---|
| `app/types/memo.ts` | type `Memo` |
| `app/composables/useMemos.ts` | chargement / sauvegarde `localStorage`, `add(text)` |
| `app/utils/drift.ts` | hash, paramètres de dérive, `driftAt(params, t)`, `project(...)` — pur, sans DOM |
| `app/components/MemoField.vue` | champ 3D, boucle rAF, envol |
| `app/components/MemoInput.vue` | input extensible + bouton, émet `submit(text, rect)` |
| `app/pages/index.vue` | assemble les deux |
