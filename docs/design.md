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
s       = 1 / (1 + z · 1.3)
spread  = 0.88 · (1 − 0.35 · (1 − s))  // perspective douce : le fond occupe tout l'écran
screenX = cx + x · (W/2) · spread
screenY = cy + y · (H/2) · spread
opacity = 1 − z · 0.6
blur    = round(z · 2.5 · 2) / 2 px   // quantifié pour limiter les repaints
zIndex  = round((1 − z) · 1000)
```

Une seule boucle `requestAnimationFrame` écrit `transform`, `opacity`, `zIndex` et une variable `--blur` directement sur les éléments (template refs), sans réactivité Vue par frame.

## Détachement : la goutte

Avant l'impulsion, la bulle **se détache de l'input comme une goutte d'une flaque** : elle sort du bord haut de la pilule, un col s'étire, casse, et la bulle part. Organique mais court (~295 ms) et sobre.

**Technique — filtre « gooey » SVG**, uniquement autour de l'input et uniquement pendant un détachement :

```html
<filter id="memo-goo" x="-20%" y="-20%" width="140%" height="140%">
  <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
  <feColorMatrix in="blur" mode="matrix"
    values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" result="goo" />
  <feComposite in="SourceGraphic" in2="goo" operator="atop" />
</filter>
```

- Dans le conteneur fixe de l'input, un **calque goo** (`absolute`, collé au bas, largeur de la pilule, hauteur pilule + ~14rem, `pointer-events-none`, derrière le texte) contient : la **forme de la pilule** (un div `bg-elevated rounded-3xl` aux dimensions de la pilule, en bas du calque) et les **gouttes** en cours. La pilule réelle garde son texte, son bouton et sa bordure, mais son fond devient transparent : c'est la forme du calque qui le dessine. Sans détachement en cours, pas de filtre : rendu identique à aujourd'hui.
- `filter: url(#memo-goo)` n'est appliqué au calque que tant qu'au moins une goutte existe. Pendant ce temps, la bordure de la pilule passe en transparent (transition ~100 ms) pour qu'aucun trait ne coupe le col.
- Le texte ne passe jamais dans le filtre : il reste net.

**Une goutte** = un div `bg-elevated` aux **dimensions exactes de la future bulle à `z = 0`** (mesurées sur l'élément de la bulle, déjà monté mais tenu invisible), squircle comme les bulles. Animation WAAPI (`element.animate`), 295 ms :

- `transform` du centre, de `pillTop + 12px` à `pillTop − 40px − h/2`, centré horizontalement par `left: 50%` (suit la pilule si sa largeur change) ; échelle `(0.35, 0.45)` → `(0.62, 1.1)` à 55 % (étroite et étirée) → `(0.9, 1.04)` à 85 % → `1` ;
- easing **`cubic-bezier(0.45, 0, 0.75, 0.75)`** : elle se tire lentement puis s'arrache, et finit avec de la vitesse, que l'impulsion prolonge ;
- une **queue** (rond de 28 px) suit entre la pilule et la goutte : de `pillTop + 6px` à `pillTop − 22px`, échelle 1 → 0.85 (60 %) → 0, `ease-in`. Le filtre en fait un col effilé qui casse vers 75 % de l'animation.

La distance finale (40 px de vide sous la goutte, flou de 8) suffit à ce que le seuil du filtre coupe le col.

**Continuité goutte → impulsion.** La goutte et l'impulsion forment **un seul mouvement** : même direction, même vitesse au moment du relais. Sinon on voit une goutte lente puis une accélération brutale.

- La vitesse de lancement est tirée **avant** le détachement (`launchVelocity()`, unités normalisées / s), puis convertie en px/s à `z = 0` : `v_px = (vx · W/2 · spread(0), vy · H/2 · spread(0))`. On note `v = |v_px|` et `dir = v_px / v`.
- **Direction** : la goutte suit une ligne droite selon `dir`. Sa course verticale reste celle d'au-dessus (`D = 52 + h/2` px, de `pillTop + 12` à `pillTop − 40 − h/2`), donc la longueur du trajet est `L = D / |dir.y|` et le décalage horizontal final `dir.x · L`. Les keyframes intermédiaires (55 %, 85 %) sont posées aux mêmes fractions de cette ligne. La queue penche dans la même direction : décalage horizontal `dir.x / |dir.y|` × sa propre course verticale.
- **Vitesse** : easing **`cubic-bezier(0.4, 0, 0.8, 0.4)`** — départ à vitesse nulle (elle se tire), pente finale `(1 − 0.4) / (1 − 0.8) = 3`. La vitesse en fin de goutte vaut donc `3 · L / T`. On choisit la **durée** pour qu'elle égale `v` : `T = 3 · L / v`, bornée à `[200, 450]` ms (ordre de grandeur : ~300 ms). Si `T` brut passe sous 200 ms (grands écrans), on garde 200 ms et on **allonge la course** d'autant : la vitesse au relais reste exacte. La queue et le contrecoup prennent la même durée `T` (contrecoup : `0.9 · T`).
- Au relais, la bulle reçoit **exactement** cette vitesse (pas un nouveau tirage). `vz` ne commence qu'à ce moment : la bulle se met à reculer en douceur après le relais.

**Passage de relais** à la fin de l'animation : on lit le rectangle de la goutte, on la retire, et la vraie bulle est lancée depuis ce rectangle (impulsion de la section suivante) à pleine opacité. Son texte apparaît en fondu (~140 ms) : la goutte devient une idée. La pilule fait un **contrecoup** au même instant : `scaleY(0.97)` → `scaleY(1.01)` → `1` en ~265 ms (origine en bas). Rien de plus.

**Flux** (`index.vue`) :

```ts
const memo = add(text)
field.hold(memo.id)               // bulle montée mais invisible, ignorée par la boucle
await nextTick()
const size = field.size(memo.id)  // { w, h } en cache, z = 0
const vel = launchVelocity()      // tirée avant : la goutte et la bulle partagent direction et vitesse
const rect = await input.detach(size, toPixelVelocity(vel))
field.launch(memo.id, rect, vel)  // lève le hold, lance l'impulsion avec cette vitesse
```

Plusieurs envois rapides : chaque envoi a sa propre goutte, en parallèle. `prefers-reduced-motion` : `detach` résout tout de suite avec le rectangle de la pilule, pas de goutte, et la bulle apparaît directement à sa place (comme aujourd'hui).

## Lâcher : impulsion et rebonds

Pas de trajectoire scriptée : on donne une **impulsion** à la bulle, la physique fait le reste.

Chaque bulle a un **décalage physique** `kick = { offset: Vec3, vel: Vec3 }` (nul au repos) qui s'ajoute à la dérive :

```
pos = driftAt(t) + kick.offset     // puis + recul « faite », puis project()
```

**Au lâcher** : la bulle naît au centre de l'input, à `z = 0` (taille 1). On inverse la projection pour obtenir le point normalisé de départ, et `offset = départ − driftAt(t)`. Vitesse initiale (unités normalisées / s, tirée au hasard) :

- `vy ∈ [−2.6, −1.4]` (vers le haut), `vx ∈ [−0.8, 0.8]`, `vz ∈ [0.3, 0.6]` (elle s'enfonce en montant).

**Chaque frame** (`dt` borné à 0.05 s, intégration d'Euler semi-implicite) :

- traînée de l'air : `vel *= exp(−dt / 1.2)` ;
- rappel très faible vers la dérive normale : `vel += −0.15 · offset · dt` — avec cette traînée, c'est à peu près l'amortissement critique : pas d'oscillation, la bulle glisse vers sa place en ~10 s, donc rien ne saute au rechargement ;
- `offset += vel · dt`.

**Murs** : les bords de la page, testés en **pixels** après projection, avec la demi-taille réelle de la bulle (`offsetWidth/Height · scale / 2`, tailles mises en cache — pas de lecture de layout à chaque frame). Gauche, droite, haut = bords du viewport ; bas = haut de la zone de l'input. Si un bord dépasse et que la vitesse va vers ce mur : la composante est inversée et multipliée par la **restitution 0.6**, et la bulle est replacée contre le mur (correction convertie en unités normalisées). En `z`, mêmes rebonds sur `[0, 1]`. Selon l'impulsion tirée, une bulle touche le plafond ou un côté, ou s'arrête avant : « rebondir ou non ».

Opacité, flou et taille découlent de `z` comme pour les autres bulles : pas d'interpolation spéciale. `prefers-reduced-motion` : pas d'impulsion, la bulle apparaît directement à sa place.

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

Pilule fixe en bas au centre. Repos : une ligne, à la largeur du placeholder. Focus ou texte présent : grandit (largeur `26rem`, max `calc(100vw-2rem)`, hauteur jusqu'à ~6 lignes) avec transition. `Entrée` envoie, `Maj+Entrée` = nouvelle ligne, `Échap` = blur. Texte vide/espaces = rien.

Bouton (`UButton`, `color="neutral"`, `variant="solid"`, rond, icône seule `i-lucide-arrow-up`, `aria-label` « Lâcher »). Placeholder : « Qu'avez-vous en tête ? ».

## Fichiers

| Fichier | Rôle |
|---|---|
| `app/types/memo.ts` | type `Memo` |
| `app/composables/useMemos.ts` | chargement / sauvegarde `localStorage`, `add(text)` |
| `app/utils/drift.ts` | hash, paramètres de dérive, `driftAt(params, t)`, `project(...)` — pur, sans DOM |
| `app/components/MemoField.vue` | champ 3D, boucle rAF, envol |
| `app/components/MemoInput.vue` | input extensible + bouton, émet `submit(text)`, expose `detach(size)` |
| `app/pages/index.vue` | assemble les deux |
