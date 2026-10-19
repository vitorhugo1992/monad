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

A **side view of a water column**: a fixed world of 180 × 320 units (portrait, phone-first) with a sediment floor at the bottom. Light enters from the top. The surface is bright, the depths are dark. The world never changes size with the screen, so a seed grows the same world on every device.

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
2. **Metabolism**: `energy += light × nutrients × efficiency − maintenance`, per unit biomass, with size allometry: the nutrient term saturates as `N / (N + halfSat × size)` (small cells win in bright, nutrient-poor water) and maintenance scales as `size^-1/2` (large cells endure dim water). Uptake removes nutrients from the local field and stays bound in the cell until it dies.
3. **Division**: when energy passes a threshold, split into two daughters with mutated genomes and half the energy (and bound nutrients) each. The mother continues as one daughter (keeps her id, age resets); the other daughter's parent is her. A hard cell cap only blocks division, as a backstop.
4. **Death**: energy below zero or age past lifespan → the cell fades out, sounds one soft last note, and returns its nutrients: part recycled where it died, the rest exported to the bottom as sinking detritus (the biological pump).
   - **Resting cysts**: a dying cell (more often a starving one) may leave a dormant cyst that sinks to the sediment and, after dormancy, germinates where nutrients are rich. A seed bank against extinction.
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

- **Low internal resolution**: render everything to an offscreen canvas of 180 × 320 px, then upscale by an integer factor (tolerating 1–2 px of overhang from fractional device pixel ratios). `imageSmoothingEnabled = false`, CSS `image-rendering: pixelated`. Centre with letterboxing.
- **Camera (render only)**: pinch / mouse wheel to zoom between snapped levels 1×–4× (1× shows the whole column), drag to pan. Pixels never get bigger: sprites and backgrounds are re-rasterised at each zoom, so detail appears as you zoom in. Dither is anchored to the world so it doesn't crawl while panning.
- **Fixed palette** of ~38 colours defined in `Palette`: water ramp, light and accents, four pigment ramps of five hue-shifted tones, and greener "bloom water" twins of the water ramp. Every pixel is a palette colour. No alpha blending, no blur, no canvas gradients.
- **Gradients and glows via ordered dithering** (4×4 Bayer): flat colour bands with dithered seams only near the band edges. Light is applied with a palette "light-up" table (each colour's next brighter step), so shafts, caustics and flash glows stay on the palette.
- **Background**: deep navy/teal water column, banded from lighter at the top to near-black at the bottom; an undulating surface seen from below with glints; dithered light shafts; a slow cellular caustic network near the surface; a seafloor of sediment, microbial mat and pebbles; marine snow in three parallax layers (far specks, mid snow, near out-of-focus flocs). Water tints greener where cell biomass is dense, so blooms are visible as colour.
- **Cells look like phytoplankton, not blobs.** Procedural sprites generated from the genome, as if seen under a microscope: a translucent cell body with a lit rim (upper-left) and a selective dark edge (lower-right), and chloroplasts inside, each shaded on its own (highlight upper-left, shadow lower-right).
  - Form follows the genes continuously, never via cell types: `timbre` turns a round coccoid cell into a glassy box-like frustule with a girdle seam; `coupling` grows setae on cells large enough on screen (polar spines on elongated cells, corner setae on squat box-like ones, radial spines on round ones); `size` sets cell size and the number of chloroplasts (one cup in small cells, several discs in large ones); `hue` sets the pigment ramp. Soft, low-`timbre` cells carry flagella that beat with the cell's phase θ.
  - A per-lineage sprite seed fixes elongation (squat to pennate-like) and the chloroplast layout, so daughters look recognisably related.
  - Body radius 1.25–4 world units; on screen that is a 1-px dot or 2×2 speck at 1× and a detailed 10–32 px cell at 4×. Cells tumble slowly. Cache the sprite per cell, zoom level and rotation step, with a 2–3 frame wobble (membrane swell, chloroplast drift); rebuilds are rationed per frame.
  - **Diatoms, the jewels**: towards the top of the `timbre` range the soft outline becomes glass geometry chosen by the lineage — a round, triangular, square, pentagonal or hexagonal valve seen face-on, or a pointed pennate boat when elongated — with radial striae or areolae lattices, a raphe on pennates, horns at polygon corners, and iridescent rims that shimmer through the bright ends of every pigment ramp as the cell turns (frustules are real photonic crystals).
  - Light shafts and caustics brighten cells passing through them; deep cells are muted.
- **Seafloor scavengers (decoration)**: amphipods, ostracods and isopods walk in where detritus has recently fallen, pick at it, and walk off out of frame. Driven by the simulation's record of exported detritus per column, so they come after die-offs; they never touch the simulation.
- **Flash**: the sprite briefly shifts to brighter palette steps, its light spills as a dithered halo onto the water and nearby cells, and large cells add broken pixel arcs.
- **Lineage threads**: 1-px dotted line from a young cell to its living parent, fading with the child's age.
- **HUD (minimal, diegetic)**: a microscope readout in a tiny built-in 3×5 pixel font drawn in code: seed, time, population, magnification. Small, in a corner, fades after inactivity. No panels, menus or knobs anywhere.

---

## Debug (development only)
`D` toggles an overlay: nutrient and light fields, population graph over time, phase-sync order parameter, active voice count, onsets/sec. Never visible in the normal view.

---

## Build phases

**One phase per session. Do not start the next phase. Each phase must look/sound good before moving on. Commit with git after each phase.**

1. **Silent world** — RNG, fixed timestep, fields, cells, rules 1–4, pixel renderer, background, HUD, debug overlay. No audio.
   *Done when*: a 10-minute run shows the population rising and falling without extinction or explosion, it looks charming at pixel level, and it holds 60 fps on a phone (frames are only drawn when a tick ran, so in practice: no dropped ticks and frame work under 8 ms at p95).
   `node tools/sim-check.mjs [seeds] [minutes]` fast-forwards many seeds headlessly to check population behaviour, nutrient conservation and determinism.
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
