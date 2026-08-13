# Using the app

## Structure: the app vs. the pack

The tool is split into two pieces on purpose:

- **The engine and app** know nothing about dwarves, tarrasques, or d20s. They
  know geometry (which rooms connect through which tesseracts), party
  position, keys, resets, and saves. This half is open source and free
  forever.
- **A pack** supplies the *content* — forty rooms' worth of read-aloud text,
  creatures, features, and traps. The engine reads only a handful of fields
  from a room (gravity, role, key eligibility, grouping); everything else is
  prose the GM reads at the table.

This split is what lets someone run an entirely different dungeon — different
genre, different system, different tone — without touching a line of code.
It's also why a pack can ship with as few as 3 rooms (a start, an exit, one
filler template) or all 40 hand-authored.

## Library

The app opens to a list of your saved games. Name a new one, pick a pack,
choose who decides which tesseract a door opens into (you, or chance), and
hit **Generate**. Existing games reopen with one click; **Import save…**
brings in a game exported from another device.

## Running a session

The **room panel** is the GM's view of wherever the party currently stands:

- read-aloud text, a closer look, and GM-only notes
- creatures and features, each toggleable as the party deals with them
- rest safety
- content that only appears once a key is held

The **Doors** drawer shows what's on the other side of each exit before you
commit to opening it. A running **Log** tracks what's happened this session,
and the **cube diagram** shows the party's current tesseract at a glance.

## Party

Position belongs to a party, not to the whole game, so a group can split down
two doors and merge again later — merging is only offered where both halves
actually stand in the same room of the same tesseract. Keys stay with
whichever half of the party was carrying them.

## Menu (☰)

Theme, cell-choice mode, the pack's catalog of monsters/items, exporting the
current save, resetting, and leaving back to the library.

## Saves

Everything lives in this browser's storage. Use **Export** to write a save
out as a JSON file — drop that in a synced folder (Dropbox, iCloud, a USB
stick) to carry a game between devices, and **Import save…** on the other end
to pick it back up.
