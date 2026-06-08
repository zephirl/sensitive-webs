# Sensitive Webs

Sensitive Webs est une petite toile interactive qui réagit au toucher et transforme le geste en ambiance sonore.

L'idée n'est pas de "jouer" un instrument au sens classique. Le projet cherche plutôt une sensation: quelque chose entre la toile, le souffle, la vibration et une musique lente qui bouge avec la main.

## Ce que fait le projet

À l'écran, on voit une toile symétrique en forme d'hexagones. Quand on clique ou qu'on touche la toile, un son se déclenche. Si on reste appuyé, le son prend plus de place. Si on se déplace, la couleur sonore change doucement.

Le rendu mélange trois choses:

- un fond grave et stable, un peu comme une nappe
- une partie mélodique liée aux anneaux de la toile
- un souffle plus léger qui donne de l'air autour

## Les inputs

Les entrées sont volontairement simples.

- `appuyer` ou `cliquer` sur la toile: lance le son
- `rester appuyé`: augmente l'intensité
- `glisser`: change la position et la note selon l'endroit touché
- `relâcher`: laisse le son retomber doucement

En pratique, le projet lit surtout quatre informations:

- si on touche ou non
- la position horizontale
- la position verticale
- l'intensité du geste

Il regarde aussi sur quel anneau de la toile on se trouve.

## Comment le son est mappé

Le mapping reste simple à comprendre:

- plus on va vers l'extérieur de la toile, plus la note monte
- plus on garde le doigt ou la souris appuyé, plus le son s'ouvre et devient présent
- quand on bouge de gauche à droite, le son se décale dans l'espace
- quand on glisse entre les anneaux, la matière musicale change progressivement

Le fond sonore tourne en continu pour éviter le silence complet. Le geste vient ensuite réveiller la partie mélodique et la basse mouvante.

## Lancer le projet

Installer les dépendances:

```bash
npm install
```

Lancer le serveur de développement:

```bash
npm run dev
```

Puis ouvrir l'adresse affichée dans le terminal. En général c'est:

```bash
http://localhost:3000
```

Si le port est déjà pris, Next peut démarrer sur `3001`.

## Stack

- Next.js
- React
- TypeScript
- Tone.js

## Intention

Le projet a été pensé comme une expérience sensible, pas comme une démo technique. Le but est que le geste reste lisible, que le son réponde tout de suite, et que l'ensemble garde quelque chose de calme, étrange et vivant.
