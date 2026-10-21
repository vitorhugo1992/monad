# MONAD

A generative ambient music ecosystem in a single browser tab. Pixel-art phytoplankton live, divide, sync and die in a dark water column, and the music comes from their interactions. Nobody composes it: it emerges.

The user can watch (a tide pool) or play (a hand in the water). There is no mode switch. Playing is only a perturbation of the same system that is always running.

The author is a phytoplankton researcher. The biology is load-bearing, not decoration.

---

## Core principle: emergence over authorship

**Never script a behaviour. Find the local rule that produces it.**

- No archetypes, no hard-coded "pad cell / looper cell" types.
- No scripted events ("every 60s do a bloom"). Blooms, die-offs, rhythms and chords must come out of the rules below.
- No "if the player is playing, then..." branches. The player only changes the inputs to the same rules (where the water moves, which cells startle, which cells sound).
- If something needs to happen and no rule produces it, stop and propose a new **local rule** instead of an authored behaviour. Ask before adding it.

The music works through constraints, not randomness: one shared harmonic field, a voice budget, slow time constants. Freedom inside tight constraints is what makes emergent results beautiful rather than chaotic.

---

## Tech constraints

- **One file: `index.html`.** Vanilla JS, Canvas 2D, Web Audio API. No frameworks, no build step, no external scripts or fonts. The only other files are what installing needs (phase 8, author-approved): `manifest.webmanifest`, `sw.js` and `icons/`.
- Must run well on a phone in portrait and on desktop in landscape. Touch and mouse both work.
- **Seeded and deterministic.** All randomness goes through one seeded PRNG (mulberry32). The same seed must grow the same world. Without `?seed=` (or `?stress`, `?ff`, `?day`) the page keeps **one world** that lives on between visits (random seed at birth, displayed); with any of them it runs a scratch world that is never saved, so trying a seed never overwrites the kept one.
- **A saved world is the same world** (phase 8): the snapshot holds everything the rules read, including the PRNG states (mulberry32 keeps its state in the open), so a restored world steps on exactly as if it had never stopped. `tools/sim-check.mjs` checks the round trip.
- **Fixed-timestep simulation** (30 ticks/s with an accumulator), decoupled from rendering. Required for determinism.
- All tunable numbers live in one `PARAMS` object at the top. No magic numbers scattered through the code.
- One `requestAnimationFrame` loop. No `setInterval`. Exception (phase 8): the catch-up worker's own loop.

### File sections (in order, marked `// ===== NAME =====`)
`PARAMS → RNG → Utils → Palette → Fields → Genome → Cells → Rules → Harmony → Persist → Audio → Render → Notebook → Input → Debug → Loop → Init`

---

## The world

A **side view of a water column**: a fixed world of 180 × 320 units (portrait, phone-first) with a sediment floor at the bottom. Light enters from the top. The surface is bright, the depths are dark. The world never changes size with the screen, so a seed grows the same world on every device.

### Fields (coarse grid, e.g. 24 × 40, bilinear sampling)
- **Light**: strongest at the top, decays with depth, scaled by a slow day/night cycle (diel cycle; one "day" is 5 real minutes by default, `?day=5|10|30` picks 5, 10 or 30). Sunrise to sunset is 65% of the cycle, surface light follows `sqrt(sin)` (sharp twilights), and night keeps a faint moonlight. The world starts in early morning.
- **Wind** (weather): a slow seeded process. Its target changes at random intervals (calm spells common, storms rarer) and the wind eases toward it. Strong wind drives upwelling (nutrient pulses). It also sets the sea state the renderer draws: wave height, how fast the water moves, refraction, and whether rays form.
- **Nutrients**: diffuse slowly, are consumed by cells, enter from the bottom (upwelling), and return when cells die (remineralisation). Occasional nutrient pulses rise from the bottom as **wind-driven upwelling**, never on a fixed schedule: a plume of deep water climbs from the floor (~1–1.5 min) and releases its nutrients along its path. Resuspended specks rising in it make it visible.

### Cells (agents)
State: position, velocity, energy, age, phase θ (0–2π), genome, parent id.

### Genome — only perceivable genes
Every gene must change something you can **see or hear**. If it doesn't, it doesn't exist.

| gene | range | perceived as |
|---|---|---|
| `hue` | palette ramp index | pigment colour |
| `size` | 0.6–1.6 | cell size and chloroplast count; larger-looking cells (dinoflagellates are drawn big) sing up to two octaves lower and slower |
| `depthPref` | 0–1 | where it lives in the column, which sets its register |
| `omega` | 0.15–0.6 Hz | natural pulse/flash rate |
| `coupling` | 0–1 | how strongly it syncs with neighbours; length of its setae (spines) |
| `timbre` | 0–1 | the form and its instrument, continuously: soft flagellate (felt piano ↔ pad) ↔ armoured dinoflagellate (wood or plucked string) ↔ diatom glass (glockenspiel ↔ vibraphone); round coccoid cell ↔ glassy box-like frustule |

Mutation on division: small random walk (±8% of range) per gene, with a 5% chance of one larger jump. Daughters look and sound recognisably related to the parent.

---

## Rules (the whole engine)

1. **Drift**: Brownian motion + gentle movement toward the light level matching `depthPref` (phototaxis; the target is relative to surface light, so a cell holds its depth all day) + soft separation from close neighbours. Heavy drag. Everything moves slowly.
   - **Night descent**: in darkness cells follow the nutrient gradient down instead of seeking light; phototaxis pulls them back up at dawn (diel vertical migration).
   - **Night rest** (circadian clock): as the sun goes down, upkeep and ageing slow to 12%, so cells survive the night without dividing.
2. **Metabolism**: `energy += light × nutrients × efficiency − maintenance`, per unit biomass, with size allometry: the nutrient term saturates as `N / (N + halfSat × size)` (small cells win in bright, nutrient-poor water) and maintenance scales as `size^-1/2` (large cells endure dim water). Uptake removes nutrients from the local field and stays bound in the cell until it dies.
   - **Turbulence (Margalef's mandala)** (approved local rule): small-scale turbulence inhibits dinoflagellate growth, diatoms don't mind it. Gain × `max(0, 1 − 1.5 · dinoWeight · wind · e^(−depth / 0.5 column))`: wind mixing is strongest at the surface and fades over the mixed layer. Dinoflagellates (including *Alexandrium* and *Dinophysis*) stay a minor share and bloom in long calm spells, sheltering below the mixed layer when it blows.
3. **Division**: when energy passes a threshold, split into two daughters with mutated genomes and half the energy (and bound nutrients) each. The mother continues as one daughter (keeps her id, age resets); the other daughter's parent is her. A hard cell cap only blocks division, as a backstop.
4. **Death**: energy below zero or age past lifespan → the cell fades out, sounds one soft last note, and returns its nutrients: part recycled where it died, the rest exported to the bottom as sinking detritus (the biological pump).
   - **Extinction is an ending** (author's decision): rare when only watching, a matter of hours and bad luck (never ageing, never scripted); in phase 6 the player can also cause it by mismanaging the water. When the last cell and the last cyst are gone the water goes on, empty and silent, and the HUD keeps an epitaph: seed, how long the world lived, EXTINCT. In the kept world a tiny TAP TO SEED NEW WATER follows once the epitaph has appeared and starts fresh water with a new seed; a living world cannot be reset (it is a pet; only the biology ends it). A scratch world starts again on reload. Grazers starve away slowly after a die-off (decay 0.0025/s), so crashes run deep (measured 2026-10-21, 16 seeds x 12 h: 3 extinct (h 2.2, 4.6, 8.8), about one extinction per 57 lived hours, so a kept world lives about 5 days on average; author: right for now): worlds often fall to a handful of cells and recover, and now and then one does not.
   - **Resting cysts**: a dying cell (more often a starving one) may leave a dormant cyst that sinks to the sediment and, after dormancy, germinates where nutrients are rich. A seed bank against extinction.
5. **Grazing pressure and visitors**: density-dependent mortality from an invisible grazer field Z on the nutrient grid. Grazers eat local biomass B with a type III response `f = B²/(B²+K²)` (sparse cells find refuge), grow on it and starve slowly (`dZ/dt = Z(growth·f − decay)` + slow diffusion, never below a floor). Per-cell mortality is `rate·Z·K·B/(B²+K²)`, divided by `1 + refuge·(chain length − 1)` for chained cells (a size refuge). The lag between food and grazers is what ends blooms and lets the water recover. Grazed cells vanish quietly (no cyst, no last note); 70% of their nutrients are excreted in place and the rest sinks as fecal pellets. The grazers are drawn as krill where the field is dense (the field made visible, nothing more): giants beside the cells, so only a sparse share of the swarm is drawn, each detailed (translucent pink-orange body, segmented abdomen and tail fan, big black eyes, long waving feelers, a green gut from eating diatoms, a feeding-leg basket, swimmerets beating in a travelling wave, small blue photophores, no glow), gliding in loose swarms and flicking the tail when they dart; no voice of their own.
   - **Visitors** (approved local rule): filter feeders find plankton-rich water. Arrival chance rises with living biomass, so blooms draw them in; never on a timer. A **sardine school** (big, detailed fish: blue-green backs, spot row, silver flanks whose scales twinkle, beating forked tails; the whole school flashes silver when it wheels round) sweeps across, leaning toward richer water, and swallows cells in its path; a rich pass makes it wheel round for another (up to 3), so it can take half a bloom. A **salp chain** drifts slowly, filtering a modest share, its fecal pellets sinking fast. An **ocean sunfish** (brown-grey back, mottled silver flanks, white belly, tall curved dorsal and anal fins flapping together, scalloped clavus, a small round mouth that gapes open and shut as it sucks in prey) comes for the salps and bites them off one by one; it never eats cells. When it is done it rises to bask just under the surface and drifts away. What visitors eat is partly excreted in place, partly sinks as pellets, and partly leaves the column with them.
6. **Phase coupling (Kuramoto)**: `dθ/dt = 2π·omega + coupling·K·mean(sin(θj − θi))` over neighbours within radius R. When θ wraps past 2π, the cell **flashes** (bioluminescence) and may sing. Synchronised clusters — colonies — emerge from this rule with no colony code. The sum uses the phases from the start of the tick (order-independent) and the arithmetic sine `dsin` (deterministic).
7. **Pitch attraction**: each cell holds a scale degree. When it flashes, it nudges its degree toward a consonant interval (unison, 3rd, 4th, 5th, octave) with the degrees its neighbours sang recently. Chords emerge from proximity and sync.
   - As built: the degree is inherited (a daughter starts one step away 25% of the time); on each flash the cell moves at most one step (down, stay, up) to the degree that scores best against neighbours within 12 units that flashed in the last 4 s (consonance by interval class: 4th/5th > 3rds/6ths > unison/octave > 2nds > tritone, semitone; a small bonus for staying). All moves in a tick are applied after everyone has listened (order-independent). Runs on the music's own seeded stream, so the music never changes the biology. **Choir**: against a neighbour flashing in phase, or a chain mate, a unison only doubles the note and scores nothing, so colony mates spread onto fifths and thirds; chain mates always join each other's phrase and the first note of a phrase rings full length, so a colony flashing together is heard as a chord. Within a phrase, a motif note that would form a semitone or tritone with a note still sounding anywhere in the water bends one scale step (the first note stays).
   - **Lineage motifs** (approved local rule): each lineage carries a short tune, 3–5 scale steps from the cell's degree (mostly steps, some leaps and repeats), on a Euclidean rhythm (notes spread evenly, rotated) over a loop of 3–8 slots spanning one period of the cell's own pulse, so every lineage loops at its own length and tempo and the loops drift against each other. Inherited at division; 12% of the time a note moves a step, 3% a note is added or dropped (repeat with controlled variation). A cell that starts singing keeps singing for a bout of 1–3 flashes, so its tune returns, transposed as rule 7 moves its degree.

That's it. Colonies, blooms, silence and rhythm must all come out of these rules.

---

## Harmony: the water chemistry

- One shared **harmonic field**: a root and a scale (pentatonic family: major, dorian, minor, hirajoshi). Every note is quantised to it. **Only one tonal centre at a time.**
- The root changes rarely — a major event, minutes apart. It is driven by the population (elders, phase 5) and later pulled by the player. Never on a timer.
- **Register = depth.** Top of the column sings higher octaves, bottom sings lower. Diel migration therefore produces a slow registral arc for free.
- As built: the **key is chosen by the seed** (root and scale; the root stays fixed until elders move it in phase 5). Register spans four octaves, C6 at the surface to C2 at the floor; larger cells sing up to an octave lower. The note is the cell's scale degree in the octave nearest its place in the column.

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
- At most **16 simultaneous** ecosystem voices and **~6 note onsets per second** overall (tunable; raised from 10 and 2.5 with the author when motifs arrived).
- When a flash wants to sing and the budget is full, it only flashes visually. Cells in larger synchronised clusters get priority, so colonies are heard over loners.
- Silence is allowed and expected. If the population thins, the music thins.
- As built, the budget is decided in the simulation (sim time, deterministic, so `tools/sim-check.mjs` measures the music): a token bucket (6/s, burst 14) and 16 voices. **Singing urge** (local rule): a flash rarely starts a phrase on its own (4% when the cell is growing well, by its recorded light × nutrient conditions; a floor of 15% of that when resting at night or growing poorly; glowing dinoflagellates sing in the dark; starving cells, energy < 0.25, are silent). A cell flashing within 0.5 s after a neighbour began a phrase joins in with its own (85%), so synchronised colonies sing together (kin motifs in counterpoint) and loners sing alone. A phrase needs a token per note (a loner twice that); each note sounds only if a voice is free. Dying (not eaten) cells sound one soft last note if a voice and a token are free. Measured: ~3 onsets/s median, the cap in blooms, ~20% of the time in near-silence (thin water, nights).
- Time-lapse thins the music: at 2×–8× only a share 1/speed of the phrases plays (whole phrases); the simulation is unchanged.
- Browsers need a gesture before sound: a tiny pixel-font TAP TO LISTEN sits in the water until the first tap/click/key. A small beamed-note glyph beside the notebook glyph (shows with the HUD), or `M`, turns the **music** off and on (author; MUSIC OFF in the HUD): the cells' notes, drones and plucks fade out, while the ambience, bubbles, krill clicks and the school's whoosh go on.

### Ecosystem voice
- The voice follows the form, as the sprite does (author's decision), blended continuously by `timbre`, as real instruments built from partials that each fade at their own rate (higher partials first): soft flagellates are a **felt piano** (small) melting into a **breathing pad** (big, or steadied by an elder: a detuned twin and a slow vibrato); dinoflagellates are **wood** (marimba: *Alexandrium*, *Prorocentrum*) or a **plucked string** (*Dinophysis*, *Tripos*), by lineage form; diatom glass is a **glockenspiel** (small) or a **vibraphone** with its slow tremolo (big). Within a family the size gene picks the instrument, tilted toward the mellow one. A lowpass follows each note (bright at the strike, darker through the fade). Measured mix: glockenspiel ~38%, vibraphone ~28%, piano ~11%, pad ~8%, wood ~8%, string ~7%.
- **The world as macros** (audio only): brightness follows daylight, the delay's echoes follow the sea state (long in glassy calm, broken up in wind), the reverb follows bloom density, and visitors in the water cast an audible shadow (the sound dulls while a school, sunfish or salp chain passes). Eased, never scripted.
- **Predators are heard** (author-approved): visitors have no voice of their own, but cells brushed by a passing sardine school, salp chain or sunfish flash and blurt a short, high staccato note an octave up (startle; one per cell per 3 s, from the same budget), so a school sweeps through a flurry of plucks. Where the grazer field is dense, notes are duller and shorter (muffled), so heavy grazing sounds smothered before the die-off. The eaten simply stop singing, so a feast leaves an audible hole.
- **Melody over chord, chains arpeggiate** (author-approved): in a free colony the cell that starts sings its tune and neighbours who join hold one long chord tone each (release × 1.6). A chain plays its chord as an arpeggio instead: its cells' notes from low to high (and back down for a straight chain; round and round for rings and stars), 4–8 notes over one period of the pulse, once per chain until it has rested.
- **Richer voices**: soft pads breathe (their filter opens through the swell and closes through the fade); pads steadied by an elder add a late shimmer an octave up; every note varies slightly in loudness, brightness (louder is brighter) and timing; drones evolve (a slowly beating second sub, a partial two octaves up blooming late); the delay time drifts with the water's motion like tape flutter.
- **Krill** are drawn mostly where they are eating (hungry swarms vanish within ~2–3 s and need dense food to stay, author: they should leave quickly; so the water clears after a die-off while the grazing pressure lingers) and are heard as a faint crackle of tiny clicks in short trains, denser with the visible swarm but saturating.
- **Ambience** (author-approved): the ocean itself, from filtered noise and short tones, every sound a discrete swell-and-fade event (overlapping, so the bed never stops), all following the world: the surface wash (soft and slow in calm water, loud, bright and quick in wind), a deep hum (darker at night), a groan while an upwelling plume rises, a whoosh as a sardine school sweeps by, and a chirp for every visible bubble. **Bubbles** (render): breaking chop entrains clusters just under the surface that sink a little and rise back to pop; now and then gas seeps from the sediment and a few bubbles rise through the whole column.
- **Singing is seen**: a singing cell swells (a dot becomes a speck at 1×) and brightens with its note's envelope, and one ring of its pigment spreads from it, timed to the audio, at every zoom.
- Stereo pan from x position. Deeper cells are quieter and wetter.
- Shared chain: `voices → ecosystemBus → lowpass → (dry + reverb send + subtle delay send) → master → compressor → output gain → peak limiter → out` (loudened for phone speakers; the limiter holds the peaks).
- The ecosystem is the room the music happens in: dark, wet, soft. Never harsh, never bright fizz.

### The hand in the water (phase 6, redesigned with the author)
No keyboard, no MIDI, no voice of the player's own: the water is the instrument. The author found the original mother-voice player too complicated and off-goal.
- **Tap to scatter**: cells near a tap swim away for a few seconds (an escape response, as real dinoflagellates flee a disturbance), flash and blurt startle notes. Taps work at every zoom. A ripple of light (three rings, render only) spreads from the tap out to the reach of the scatter and fades over ~2 s.
- **Swipe to strum** (at 1× zoom, where dragging can't pan; a mouse drag on desktop): every cell the finger passes through plucks its own note in its own voice and register, so moving up through the water plays low to high and down plays high to low, like strumming a harp. Plucks bypass the voice budget (with a safety cap), ring and flash. The finger also drags the water a little along its path, and leaves a fading pixel wake.
- **Toward the light opens, toward the deep closes** (author): while strumming, moving toward the surface opens (brightens) the master filter and moving toward the deep closes (darkens) it, so an upward strum rises in pitch and into the light together.
- **Sideways makes the filter ring** (author, replacing an earlier sideways octave that was too subtle to hear): sideways travel builds a resonant peak (a peaking filter after the master lowpass, Q 5, up to +12 dB) whose frequency follows the finger across the water, 220 Hz at the left edge to 3.5 kHz at the right, so a sideways strum sweeps a vowel through everything playing. When the finger lifts the peak fades and the filter settles back over ~2 s.
- Player input enters the simulation at tick boundaries; a touched world no longer matches its seed (the seed is the starting point, not a recording).

---

## Visual style: pixel art

References: the "bit_wonder" style on Instagram — dark backgrounds, chunky clumped sprites with 3-tone shading, dithered gradients and caustics (top-down koi pond, pixel sunsets), tiny pixel-font HUD numbers.

- **Low internal resolution**: render everything to an offscreen canvas of 180 × 320 px, then upscale by an integer factor (tolerating 1–2 px of overhang from fractional device pixel ratios). `imageSmoothingEnabled = false`, CSS `image-rendering: pixelated`. Centre with letterboxing.
- **Camera (render only)**: pinch / mouse wheel to zoom between snapped levels 1×–8× (1× shows the whole column), drag to pan. Pixels never get bigger: sprites and backgrounds are re-rasterised at each zoom, so detail appears as you zoom in. Dither is anchored to the world so it doesn't crawl while panning.
- **Fixed palette** of ~53 colours defined in `Palette`: water ramp, light and accents, seven pigment ramps of five hue-shifted tones (gold, green, emerald, light blue, blue, violet, rose — the `hue` gene walks around this wheel, so mutations shift lineages to neighbouring colours), and greener "bloom water" twins of the water ramp. Every pixel is a palette colour. No alpha blending, no blur, no canvas gradients.
- **Gradients and glows via ordered dithering** (4×4 Bayer): flat colour bands with dithered seams only near the band edges. Light is applied with a palette "light-up" table (each colour's next brighter step), so shafts, caustics and flash glows stay on the palette.
- **Background**: deep navy/teal water column, banded from lighter at the top to near-black at the bottom; an undulating surface seen from below with specular glints that twinkle where the wave slope catches the sun; god rays (thin beams focused by the moving surface, fanning from a virtual sun and leaning with it through the day, bent by a refraction shimmer near the surface); a slow cellular caustic network near the surface; a seafloor of sediment, microbial mat and pebbles; marine snow in three parallax layers (far specks, mid snow, near out-of-focus flocs). Water tints greener where cell biomass is dense, so blooms are visible as colour.
- **Cells look like phytoplankton, not blobs.** Procedural sprites generated from the genome, as if seen under a microscope: a translucent cell body with a lit rim (upper-left) and a selective dark edge (lower-right), and chloroplasts inside, each shaded on its own (highlight upper-left, shadow lower-right).
  - Form follows the genes continuously, never via cell types: `timbre` turns a round coccoid cell into a glassy box-like frustule with a girdle seam; `coupling` grows setae on cells large enough on screen (polar spines on elongated cells, corner setae on squat box-like ones, radial spines on round ones); `size` sets cell size and the number of chloroplasts (one cup in small cells, several discs in large ones); `hue` sets the pigment ramp. Soft, low-`timbre` cells carry flagella that beat with the cell's phase θ.
  - A per-lineage sprite seed fixes elongation (squat to pennate-like) and the chloroplast layout, so daughters look recognisably related.
  - Body radius 1.25–4 world units in the simulation; cells are drawn at half of it (dinoflagellates 1.6× larger), so at 1× they are fine 1-px dots and 2×2 specks beside big fish, and the 6× and 8× zoom levels reveal the detailed cell. Cells tumble slowly. Cache the sprite per cell, zoom level and rotation step, with a 2–3 frame wobble (membrane swell, chloroplast drift); rebuilds are rationed per frame.
  - **Mixed chloroplasts**: a cell whose `hue` sits near the next colour on the wheel carries some chloroplasts of that colour (as in kleptoplastic dinoflagellates).
  - **Dinoflagellates** in the middle of the `timbre` range (between soft cells and diatom glass): drawn 1.6× larger than their size gene alone (they are the big cells), whirling as they swim; armoured thecae with a slightly spiralled cingulum groove holding the transverse flagellum, a sulcus, and a trailing flagellum. The lineage picks the form: *Alexandrium* (round, thecal plate seams), *Dinophysis* (laterally flattened, open funnel collar and sail-like sulcal list), *Tripos* (three long curved horns) or *Prorocentrum* (egg-shaped valves with a suture and an apical tooth).
  - **Diatoms, the jewels**: towards the top of the `timbre` range the soft outline becomes glass geometry chosen by the lineage — a round, triangular, square, pentagonal or hexagonal valve seen face-on, or a pointed pennate boat when elongated — with radial striae or areolae lattices, a raphe on pennates, horns at polygon corners, and iridescent rims that shimmer through the bright ends of every pigment ramp as the cell turns (frustules are real photonic crystals).
  - Light shafts and caustics brighten cells passing through them; deep cells are muted.
- **Seafloor scavengers (decoration)**: amphipods, ostracods and isopods walk in where detritus has recently fallen, pick at it, and walk off out of frame. Driven by the simulation's record of exported detritus per column, so they come after die-offs; they never touch the simulation. Zoomed out they are simple shaded shapes; from 3× they show anatomy: amphipods with overlapping body plates, an amber gut, a kidney eye, beaded antennae, a gnathopod claw, jointed legs (front ones forward, back ones back), beating pleopods and uropods; isopods with flattened plates, a tail shield and forked uropods; ostracods with a bean-shaped pitted shell, a naupliar eye, legs at the gape and bristle-fanned antennae. Feeding ones dip their heads to pick at the detritus.
- **Bioluminescent dinoflagellates** (author-approved): an inherited trait of *Alexandrium*-form cells only (gained 3% / lost 15% per division, so glowing clades are rare and come and go; cysts keep it). At night they flash blue-green with a wider dithered halo, on their own phase flash and when disturbed (a sardine school, salp or sunfish brushing past, breaking chop near the surface). The one exception to the one-step flash rule below; still palette colours.
- **Flash**: a soft swell and fade (about 1.5 s), never more than one palette step brighter; a faint dithered halo spills onto the water and nearby cells, and cells very large on screen add faint broken arcs. Calm, never electric.
- **Lineage threads**: 1-px dotted line from a young cell to its living parent, only while the two are still close (a few cell widths), fading with the child's age and with distance; never long lines across the water.
- **Liveliness without speed**: the water (surface, rays, caustics, shimmer, snow) animates on its own clock, livelier than the ecosystem and hurried or slowed by the wind, and every cell moves on its own clock at its own tempo, 1× to 8× real time, so cells at different tempos share the water: at high tempo a cell darts around its simulated position on a wandering leash, spirals and tumbles faster. The species sets the top speed (small, quick-pulsing cells reach 8×; large slow ones ~3–4×; diatoms don't swim and only rock); activity sets how much of it is used. How lively a cell swims shows how it is doing: flagellates follow their recorded growth conditions (light × nutrients) and sleep at night; dinoflagellates are the night swimmers, active in the dark while they have energy. Render only: the ecosystem keeps its slow pace.
- **Rays are occasional**: they need the sun up, some chop on the surface (a glassy surface focuses nothing; rough water shatters them into flickers) and clear water (murky bloom water hides them). They come and go with weather and blooms.
- **Time-lapse**: `?speed=2|4|8` or the `[` / `]` keys run more of the same fixed ticks per second (still deterministic). No on-screen control.
- **HUD (minimal, diegetic)**: a microscope readout in a tiny built-in 3×5 pixel font drawn in code: seed, time, population, magnification (and time-lapse speed when above 1×). Small, in a corner, fades after inactivity. No panels, menus or knobs anywhere.

---

## Debug (development only)
`D` toggles an overlay: nutrient and light fields, population graph over time, phase-sync order parameter, active voice count, onsets/sec. Never visible in the normal view.

---

## Build phases

**One phase per session. Do not start the next phase. Each phase must look/sound good before moving on. Commit with git after each phase.**

The order was changed with the author (visuals first): the world's cycles and coupling come before sound.

1. **Silent world** ✅ — RNG, fixed timestep, fields, cells, rules 1–4, pixel renderer, background, HUD, debug overlay, camera/zoom, cell forms. No audio.
   *Done when*: a 10-minute run shows the population rising and falling without extinction or explosion, it looks charming at pixel level, and it holds 60 fps on a phone (frames are only drawn when a tick ran, so in practice: no dropped ticks and frame work under 8 ms at p95).
   `node tools/sim-check.mjs [seeds] [minutes]` fast-forwards many seeds headlessly to check population behaviour, nutrient conservation and determinism.
2. **Cycles** ✅ — diel light (one day 5 minutes by default, `?day=5|10|30`), night rest, **night descent** (approved local rule: in darkness cells follow the nutrient gradient down instead of seeking light; phototaxis pulls them back up at dawn, giving diel vertical migration), nutrient pulses, grazing (rule 5). Day/night is shown by **palette shifts**: a few hand-curated palettes (day with deep rays, golden evening, moonlit night where bioluminescence glows, dawn) crossfaded by dithering, so every frame still uses only curated colours. Each keyframe hand-picks the environment colours; pigments keep their ramps (at night each tone takes the next darker step), so lineages keep their colour at every hour.
   *Done when*: a 30-minute run contains at least one bloom, a die-off and a recovery, and migration is visible.
3. **Coupling and chains** ✅ — rule 6 (Kuramoto, K = 0.9 rad/s over neighbours within 10 units: kin lock, strangers drift, so several colonies pulse at their own tempos), visible as synchronised flashing and flagella beating together, plus **chain adhesion** (approved local rule: on division daughters may stay linked by a spring, inserted next to the mother so a chain grows from within, more likely with high `coupling` from the point where setae appear, like setae interlocking in *Chaetoceros*; the form sets the length: diatoms up to 8, *Alexandrium* and *Tripos* 2–4 (author: *Dinophysis* and *Prorocentrum* don't chain), soft flagellates never; links break when a cell dies or slowly at random). **Chains are a size refuge from the small grazers**: grazing risk × 1/(1 + 1.5·(length − 1)); sardines and salps filter chains like anything else. **Colony habits** (artistic liberty, author-approved): some glass-diatom lineages build shaped colonies — each joint turns by a fixed angle, so the same springs make straight chains (*Chaetoceros*), coils that close into rings (*C. curvisetus*, box cells) or snowflake stars of pennates radiating from a hub (*Asterionellopsis*). The habit comes from the lineage's sprite seed and form, is fixed when the colony is founded, and is inherited by every daughter born into it. A colony diffuses as one body: its cells share one Brownian kick (÷√length). Chains are drawn swimming and turning as one, cells stacked along the chain (dinoflagellates apex to antapex, pennates end to end, round and box cells valve to valve), with interlocking setae bridging the gaps.
   *Done when*: you can see clusters and chains synchronise, nobody coded.
4. **Harmonic field + voices** ✅ — harmony, audio chain, voice budget, and rule 7 (pitch attraction). Cells sing when they flash.
   *Done when*: 10 minutes of listening are never harsh, never mush, include stretches of near-silence, and synchronised clusters are heard as chords nobody coded.
5. **Elders** ✅ — cells that survive long in deep, low-light water slow their metabolism, grow, and sing low drones. The oldest living elder sets the harmonic root; when it dies, the root may shift.
   *Done when*: root changes are rare and feel like events.
   As built: **dark acclimation** (approved local rule): days spent in deep, dim water (light profile < 0.12, about the lower half of the column; judged by day only) slowly make a cell an elder (0..1 over ~3.3 min of daylight; fades at half that rate in brighter water). Its uptake and upkeep slow by 80%, ageing by 95%, its pulse by 75%, its swimming by 90% (it settles where it is), it stores energy up to 3× before dividing (division halves its elder level) and it is drawn up to 1.5× larger and darker, so it also sings lower. Elders die of old age after ~10–20 min as elders; that is fine (author). Elders (≥ 0.6) drone instead of singing tunes: a sine sub (C1–B1) with soft octave and twelfth pad partials under a filter that opens through a 6–10 s swell and closes through a 16–28 s fade, at most 3 at once, with a slow wide ring. Soft cells singing within 30 units of a droning elder hold their notes 2.5× longer with slower attacks: the pads. **The root**: the oldest full elder holds it; when it dies or stops being an elder, the next oldest takes it and its own note becomes the new tonal centre (the whole water modulates; the new holder drones at once). A new key holds at least 3 min; a holder appointed sooner adopts it. Measured: first elder at ~5–10 min (author asked for sooner), 3–6 key changes per hour, drones 30–80% of the time, ecosystem unchanged (no extinctions, blooms and recoveries in every seed).
6. **The hand in the water** ✅ — tap to scatter, swipe to strum (toward the light opens the filter, the deep closes it), sideways makes the filter ring (see above).
   *Done when*: playing and watching both feel complete, and stopping lets the water drift back on its own.
7. **Field notebook** ✅ (author's request; a deliberate exception to "no UI panels") — infographics behind one subtle button. Pixel-art, palette-only, hidden by default.
   As built: a small open-book glyph in the top-right corner shows and fades with the HUD (so on a phone the first tap reveals it); tapping it or `N` opens a dark log page over the dimmed water (kept in day colours at every hour). The world and the music go on behind it; while it is open the finger belongs to the page (no scatter, no strum). Swipe sideways, tap the arrows or dots, or ← → to turn pages; tap outside, the glyph, `N` or `Esc` to close. **Observation only**: a recorder outside the world writes one row every 5 simulated s for the whole life (when 65 536 rows fill up, every other row is dropped and rows come half as often) and never touches the world (checksums unchanged). Forms are counted as the sprite draws them: flagellate, *Alexandrium*, *Dinophysis*, *Tripos*, *Prorocentrum*, centric and pennate diatom, each with a 7×7 icon and its own ramp. The graphs share one time window, chosen on the page (10M · 30M · 1H · 3H · ALL; wheel or ↑ ↓ too), with nights drawn dark behind them. Pages: **The day** (sun and moon dial over the sea, solar clock, day count, next sunrise or sunset, sunlight, sea state, upwelling, nutrients, grazers, alive for, population and cysts, the whole day as one light strip); **Census** (count per form now, cells in chains, cysts, glowing; the population stacked by form over the window); **Migration** (mean depth of each form over the window, the diel vertical migration figure; tap a form to follow it alone with its spread; a strip of the column now); **Ledger** (deaths by cause in the window; cells, grazers and nutrients each scaled to its own peak; visitor arrivals as ticks). No musical information (author). `?notebook=1..4` opens it on a page (development).

---

8. **The phone app** (planned with the author; Android, installed from the web) — the world keeps living while the app is closed.
   - **8a. Save and restore** ✅: the kept world is saved in IndexedDB every 30 s and when the page is hidden (a save blocks ~5 ms at the cell cap on desktop; a reload can lose the seconds since the last save, which catch-up will re-live). The snapshot keeps shared objects and cycles, stores PARAMS references as paths and leaves render caches out; new fields from later versions are filled from a fresh world. The notebook is stored in chunks, so a save writes only new rows. The music on/off choice is kept.
   - **8b. Catch-up** ✅ (limit to be set from the phone benchmark): on return the kept world lives the time it was away, exactly (the same fixed ticks), up to `persist.maxAway` (12 h, author: a recap of ~2 min at most on the phone, which measured 366–438×); beyond it the water rests (HUD RESTED, a rose notch on the notebook's time axis). A worker built from the page's own simulation and notebook code lives it out of sight and sends a frame every 0.25 s (a silent time-lapse, HUD: AWAY and DAY); the last 40 simulated s play on the page from 8× slowing to real time, so the recap glides into the live world, then it saves. No saving mid catch-up (the last save stands and is caught up again). `?bench` measures how many times real time this device lives a world out of sight. Speed: the neighbour grid became a counting sort (bit-identical, 1.6× faster), and restored cells, genomes, world, fields and music are rebuilt in the shapes fresh ones have (restored objects ran at half speed). Desktop: ~720× in Node, ~440× in a browser worker; 2 h away catches up in ~25 s, 12 h in ~100 s. Notebook rows keep simulated seconds (exact for ~194 days of life).
   - **8c. Installable** ✅: `manifest.webmanifest` (full screen, portrait, darkest water), `sw.js` (network first so updates arrive on the next opening, the kept copy after 3 s or offline), **the logo** (author's pick): the green elder flagellate of seed 2 at 600 s (cell 63, two chloroplasts and a trailing flagellum) captured alone from the renderer itself, staged in the light teal water just under the surface at noon (author: lighter hues, the cell larger), drawn at 11× for the 512 px icon and 8.25× for the 192 px one (beyond the game's zoom levels, for the icon only). The water fits inside the safe area (notch, rounded corners). **Screen-off playing was tried and removed** (author: glitchy and slow on the phone, where Android lets a hidden page's timer fire about once a second; the app goes quiet with the screen off, and the world lives on through catch-up). The notebook glyph became a bigger open book (13 × 9, pages with lines of writing; author: the small one was unreadable), the music button moved left of it. **Hidden is like closed**: a kept world that was hidden (nothing stepping it) catches up on return, so leaving the app in the background and closing it behave the same.
   - **8d. Online** ✅: public repo https://github.com/vitorhugo1992/monad, served by GitHub Pages from `master` at **https://vitorhugo1992.github.io/monad/** (install from Chrome on the phone). A push updates the app on its next opening. Commits use the GitHub noreply address. Renaming the repo changes the Pages address (the kept world survives, the app must be reinstalled).

## Never
- Never add UI panels, knobs, menus or settings screens.
- Never add new cell types or scripted events. Propose a local rule instead.
- Never add a gene the listener can't perceive.
- Never make the ecosystem react fast. Responses take seconds; blooms take minutes.
- Never allow more than one tonal centre at a time.
- Never use colours outside the palette, blur, or smooth canvas gradients.
- Never refactor or rename things outside the current phase without asking.
- Never leave `console.log` in committed code.
