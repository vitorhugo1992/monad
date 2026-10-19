# MONAD

A generative ambient music ecosystem in a single browser tab. Pixel-art phytoplankton live, divide, sync and die in a dark water column, and the music comes from their interactions. Nobody composes it: it emerges.

The user can watch (a tide pool) or play (a hand in the water). There is no mode switch. Playing is only a perturbation of the same system that is always running.

The author is a phytoplankton researcher. The biology is load-bearing, not decoration.

---

## Core principle: emergence over authorship

**Never script a behaviour. Find the local rule that produces it.**

- No archetypes, no hard-coded "pad cell / looper cell" types.
- No scripted events ("every 60s do a bloom"). Blooms, die-offs, rhythms and chords must come out of the rules below.
- No "if the player is playing, then..." branches. The player only changes the inputs to the same rules (nutrients, phases, the harmonic field).
- If something needs to happen and no rule produces it, stop and propose a new **local rule** instead of an authored behaviour. Ask before adding it.

The music works through constraints, not randomness: one shared harmonic field, a voice budget, slow time constants. Freedom inside tight constraints is what makes emergent results beautiful rather than chaotic.

---

## Tech constraints

- **One file: `index.html`.** Vanilla JS, Canvas 2D, Web Audio API. No frameworks, no build step, no external scripts or fonts.
- Must run well on a phone in portrait and on desktop in landscape. Touch and mouse both work.
- **Seeded and deterministic.** All randomness goes through one seeded PRNG (mulberry32). The seed comes from the `?seed=` URL parameter, or is random and then displayed. The same seed must grow the same world.
- **Fixed-timestep simulation** (30 ticks/s with an accumulator), decoupled from rendering. Required for determinism.
- All tunable numbers live in one `PARAMS` object at the top. No magic numbers scattered through the code.
- One `requestAnimationFrame` loop. No `setInterval`.

### File sections (in order, marked `// ===== NAME =====`)
`PARAMS → RNG → Utils → Palette → Fields → Genome → Cells → Rules → Harmony → Audio → Render → Input → Debug → Loop → Init`

---

## The world

A **side view of a water column**. Light enters from the top. The surface is bright, the depths are dark.

### Fields (coarse grid, e.g. 24 × 40, bilinear sampling)
- **Light**: strongest at the top, decays with depth, scaled by a slow day/night cycle (diel cycle; one "day" ≈ 8–12 real minutes, tunable).
- **Nutrients**: diffuse slowly, are consumed by cells, enter from the bottom (upwelling), and return when cells die (remineralisation). Occasional nutrient pulses rise from the bottom at long random intervals drawn from the seeded RNG, never on a fixed schedule.

### Cells (agents)
State: position, velocity, energy, age, phase θ (0–2π), genome, parent id.

### Genome — only perceivable genes
Every gene must change something you can **see or hear**. If it doesn't, it doesn't exist.

| gene | range | perceived as |
|---|---|---|
| `hue` | palette ramp index | pigment colour |
| `size` | 0.6–1.6 | cell size and chloroplast count; larger sounds lower |
| `depthPref` | 0–1 | where it lives in the column, which sets its register |
| `omega` | 0.15–0.6 Hz | natural pulse/flash rate |
| `coupling` | 0–1 | how strongly it syncs with neighbours; length of its setae (spines) |
| `timbre` | 0–1 | soft triangle ↔ soft square; round coccoid cell ↔ glassy box-like frustule |

Mutation on division: small random walk (±8% of range) per gene, with a 5% chance of one larger jump. Daughters look and sound recognisably related to the parent.

---

## Rules (the whole engine)

1. **Drift**: Brownian motion + gentle movement toward the light level matching `depthPref` (phototaxis) + soft separation from close neighbours. Heavy drag. Everything moves slowly.
2. **Metabolism**: `energy += light × nutrients × efficiency − maintenance`. Uptake removes nutrients from the local field.
3. **Division**: when energy passes a threshold, split into two daughters with mutated genomes and half the energy each.
4. **Death**: energy below zero or age past lifespan → the cell fades out, sounds one soft last note, and returns nutrients to the field.
5. **Grazing pressure** (phase 4): density-dependent mortality. Dense areas slowly and quietly lose cells. This is what ends blooms. No visible predator, no voice of its own.
6. **Phase coupling (Kuramoto)**: `dθ/dt = 2π·omega + coupling·K·mean(sin(θj − θi))` over neighbours within radius R. When θ wraps past 2π, the cell **flashes** (bioluminescence) and may sing. Synchronised clusters — colonies — emerge from this rule with no colony code.
7. **Pitch attraction**: each cell holds a scale degree. When it flashes, it nudges its degree toward a consonant interval (unison, 3rd, 4th, 5th, octave) with the degrees its neighbours sang recently. Chords emerge from proximity and sync.

That's it. Colonies, blooms, silence and rhythm must all come out of these rules.

---

## Harmony: the water chemistry

- One shared **harmonic field**: a root and a scale (pentatonic family: major, dorian, minor, hirajoshi). Every note is quantised to it. **Only one tonal centre at a time.**
- The root changes rarely — a major event, minutes apart. It is driven by the population (elders, phase 5) and later pulled by the player. Never on a timer.
- **Register = depth.** Top of the column sings higher octaves, bottom sings lower. Diel migration therefore produces a slow registral arc for free.

---

## Audio

### Absolute rules (never break)
- Never use `cancelScheduledValues`.
- Never ramp to exactly 0. Exponential ramps go to `0.0001`.
- Set `osc.frequency.value` before `osc.start()`.
- Only discrete, enveloped note events. No oscillator runs forever.
- Build the reverb impulse response once at init. Never allocate AudioBuffers during playback.
- Disconnect every node after its envelope ends.

### Voice budget (the most important musical constraint)
- At most **10 simultaneous** ecosystem voices and **~2.5 note onsets per second** overall (tunable).
- When a flash wants to sing and the budget is full, it only flashes visually. Cells in larger synchronised clusters get priority, so colonies are heard over loners.
- Silence is allowed and expected. If the population thins, the music thins.

### Ecosystem voice
- One recipe: soft triangle/square blend from `timbre`, through a lowpass (~1.5–3 kHz), attack 40–400 ms depending on size, release 2–6 s.
- Stereo pan from x position. Deeper cells are quieter and wetter.
- Shared chain: `voices → ecosystemBus → lowpass → (dry + reverb send + subtle delay send) → master → gentle compressor → out`.
- The ecosystem is the room the music happens in: dark, wet, soft. Never harsh, never bright fizz.

### The player (phase 6)
- A mother voice played via QWERTY and Web MIDI (note-on with velocity 0 = note-off; release all notes on window blur).
- Dry, present, clearly in front. Never ducks the ecosystem by more than ~15%.
- A perturbation, not a layer: her notes pull the harmonic field and nudge the phases of nearby cells; a tap/click drops nutrients. When she stops, the water slowly forgets her.

---

## Visual style: pixel art

References: the "bit_wonder" style on Instagram — dark backgrounds, chunky clumped sprites with 3-tone shading, dithered gradients and caustics (top-down koi pond, pixel sunsets), tiny pixel-font HUD numbers.

- **Low internal resolution**: render everything to an offscreen canvas ~180 px on the short side (e.g. 180 × 320 portrait), then upscale by an integer factor. `imageSmoothingEnabled = false`, CSS `image-rendering: pixelated`. Centre with letterboxing.
- **Fixed palette** of ~24 colours defined in `Palette`. Every pixel is a palette colour. No alpha blending, no blur, no canvas gradients.
- **Gradients and glows via ordered dithering** (4×4 Bayer) between neighbouring palette steps.
- **Background**: deep navy/teal water column, dithered from lighter at the top to near-black at the bottom; dithered light shafts near the surface; slow, sparse caustic pattern; marine snow as single drifting pixels.
- **Cells look like phytoplankton, not blobs.** Procedural sprites generated from the genome, as if seen under a microscope: a translucent cell body with a lit rim (upper-left) and a selective dark edge (lower-right), and chloroplasts inside, each shaded on its own (highlight upper-left, shadow lower-right).
  - Form follows the genes continuously, never via cell types: `timbre` turns a round coccoid cell into a glassy box-like frustule with a girdle seam; `coupling` grows setae on larger cells; `size` sets cell size and the number of chloroplasts (one cup in small cells, several discs in large ones); `hue` sets the pigment ramp.
  - A per-lineage sprite seed fixes elongation (squat to pennate-like) and the chloroplast layout, so daughters look recognisably related.
  - 5–20 px body (setae may extend beyond). Cache the sprite per cell with a 2–3 frame wobble (membrane swell, chloroplast drift).
- **Flash**: the sprite briefly shifts to brighter palette steps, plus a 1-px pixel ring expanding for a few frames.
- **Lineage threads**: 1-px dotted line from a young cell to its living parent, fading with the child's age.
- **HUD (minimal, diegetic)**: a microscope readout in a tiny built-in 3×5 pixel font drawn in code: seed, time of day, population. Small, in a corner, fades after inactivity. No panels, menus or knobs anywhere.

---

## Debug (development only)
`D` toggles an overlay: nutrient and light fields, population graph over time, phase-sync order parameter, active voice count, onsets/sec. Never visible in the normal view.

---

## Build phases

**One phase per session. Do not start the next phase. Each phase must look/sound good before moving on. Commit with git after each phase.**

1. **Silent world** — RNG, fixed timestep, fields, cells, rules 1–4, pixel renderer, background, HUD, debug overlay. No audio.
   *Done when*: a 10-minute run shows the population rising and falling without extinction or explosion, it looks charming at pixel level, and it holds 60 fps on a phone.
2. **Harmonic field + voices** — harmony, audio chain, voice budget. Cells sing on a simple flash timer (θ advancing at `omega`, no coupling yet).
   *Done when*: 10 minutes of listening are never harsh, never mush, and include stretches of near-silence.
3. **Coupling and pitch attraction** — rules 6–7.
   *Done when*: you can see and hear clusters synchronise into pulsing chords nobody coded.
4. **Cycles** — diel light, nutrient pulses, remineralisation, grazing (rule 5).
   *Done when*: a 30-minute run contains at least one bloom, a die-off and a recovery.
5. **Elders** — cells that survive long in deep, low-light water slow their metabolism, grow, and sing low drones. The oldest living elder sets the harmonic root; when it dies, the root may shift.
   *Done when*: root changes are rare and feel like events.
6. **The player** — mother voice, QWERTY + MIDI, tap to feed, harmonic pull, phase nudging.
   *Done when*: playing and watching both feel complete, and stopping lets the water drift back on its own.

---

## Never
- Never add UI panels, knobs, menus or settings screens.
- Never add new cell types or scripted events. Propose a local rule instead.
- Never add a gene the listener can't perceive.
- Never make the ecosystem react fast. Responses take seconds; blooms take minutes.
- Never allow more than one tonal centre at a time.
- Never use colours outside the palette, blur, or smooth canvas gradients.
- Never refactor or rename things outside the current phase without asking.
- Never leave `console.log` in committed code.
