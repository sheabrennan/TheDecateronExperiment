# Building and editing packs

From the library, **Build a pack…** opens the pack builder.

- **New blank pack** starts you from an empty template with the minimum
  required fields.
- **Duplicate** any built-in pack (like the bundled Field Reference Example) to get an
  editable copy — built-in packs themselves are read-only.
- **Import pack…** loads a pack `.json` file exported from another device or
  shared by someone else.
- **Export** (inside the editor) writes your pack out as a portable `.json`
  file.

## Inside the editor

- **Manifest** — name, version, description, license/attribution, and which
  game system it's tagged for (the engine never reads this field; it's for
  humans).
- **Rooms** — the GM's reading order for each room (read-aloud / detail / GM
  notes / orientation), its creatures and features (each can declare what
  makes them reset — a short rest, a long rest, a key changing hands, doors
  closing, a shuffle), rest safety, typed links out to a statblock/map/VTT/
  doc, and content that only shows once the party holds that tesseract's
  key.
- **Filler** — how the remaining room slots (up to 40) get filled once your
  authored rooms are placed: templated variants, reuse, or a mix.
- **Template vars** — reusable placeholders (like the tesseract's colour) you
  can drop into room text so filler variants don't read identically.
- **Validation** — runs continuously and never blocks you from saving. It
  returns every finding with a machine-readable path into the pack (e.g.
  `rooms.mirror-boggles.gravity.type`) so you can jump straight to the
  offending field. Warnings are advisory (a room with no read-aloud text);
  errors mean the pack can't actually generate a playable 40-room dungeon.

Looking for the exact list of fields a room, a creature, or the filler config
can declare? See the [pack field reference](reference.md).

## Validating from the command line

Handy in CI, or before sharing a pack:

```bash
npm run validate -- path/to/pack.json
```

It never throws — it prints coded, machine-readable findings and exits
non-zero only if there are errors (warnings never fail the run).

## Packs and saves are independent

A pack edit never reaches a game already in progress — saves embed their own
content, so they're self-contained even if the pack changes underneath them
later.
