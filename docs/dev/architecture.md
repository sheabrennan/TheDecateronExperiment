# Architecture notes

## Geometry

`src/engine/topology.js` builds the penteract closed-form: cells are
`(axis 0-4, bit 0-1)`, rooms are the cell pairs on differing axes — the edges
of K₅ₓ₂. It cannot fail or emit a partial dungeon. Any two non-antipodal
cells share exactly one room; antipodal cells share none. `npm test` asserts
that pair-overlap histogram is exactly `{0:5, 1:40}`.

Door slots pair opposite faces at (0,3), (1,4), (2,5), matching the
orientation table in `lexicalMap.js`. Note that reciprocal doors are *not* at
opposite indices — in a tesseract you leave toward one axis and return along
another — so the return door is found by position, never by arithmetic.

## Packs

A pack supplies *content*; the generator supplies the 40 *instances* that
fill a dungeon. That split is what lets a pack ship fewer than 40 rooms:
authored rooms each appear at least once, and the rest is drawn from the
pack's filler configuration, with variants and tesseract colour keeping
repeats distinguishable. The minimum playable pack is three rooms — a start,
an exit, and one filler template.

The engine reads only a handful of fields (`gravity`, `role`, `keyEligible`,
the group tags, `maxInstances`, `variants`). Everything else is opaque text,
and anything system-specific belongs under `system`, which the engine never
reads. The engine does not know what d20 is.

Run `npm run validate` before shipping a pack. It never throws — it returns
coded, machine-readable findings, which is also what makes model-assisted
authoring possible. Full field-by-field detail: [pack field reference](../pack-builder/reference.md).

## Parties

Position belongs to a party, not to the game, so a group can split and later
merge. A split leaves both halves where the original stood; keys stay with
the original, since the same physical key cannot be in two places. Merging
is only offered where both are standing in the same room of the *same
tesseract* — the same room reached through a different tesseract is not the
same place.

Room state (`cleared`, `searched`, …) is world-scoped: a room dealt with is
dealt with for everyone. Keys are party-scoped. That split is the whole
reason the two are stored apart.

## Actions and resets

Every creature and feature a room declares becomes a trackable action, so
`resetsOn` can name what comes back and when. A reset event sweeps the
dungeon and undoes only the actions that list it — the room restores, but a
key already carried stays carried. What resets is the pack author's call,
not the tool's.

## Saves

Saves live in IndexedDB and embed their content, so they are self-contained
and survive the pack changing underneath them. Export writes one out as
JSON: drop it in a synced folder to move a game between devices. `version`
and `lastModified` are carried so optional sync can be added later without a
format break, and `src/io/upgrade.js` holds an empty migration chain for the
same reason: the first save that needs migrating is the worst moment to
discover there is nowhere to put the code.
