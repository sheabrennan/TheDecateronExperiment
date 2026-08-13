
# Hexeract (6-cube)
## There's 12 5-cubes, 60 tesseracts and 160 cubes.  
* In the same way each room appears in 2 tesseracts of the 5-cube, each tessaract cgould appear in 2 5-cubes. You could _theoretically_ implement this on top of the 5-cube design with only 40 unique rooms.  Each would have 4 instances.  2 in different tesseracts and those tesseracts in 2 distinct 5-cubes There's all kinds of shinnanigans that opens up re: dichotomy.  Light/Dark, Past/Future, Forward/Backward whatever.  

* Using 80 unique rooms eliminates the dupliction across tesseracts within a 5-cube, but the 5-cubes share tesseracts.  This is more setup work, but makes for a party experience that's really similar to the regular 5-cube version, just 'bigger'.

* The 'which tesseract' determination from the 5-cube stays in place, but there's a new additional 'which 5-cube', resulting in 4 options on the other side of a door.  
  
# Tesseract (4-cube)
A simple 8 room dungeon out of a build pack to drop in where ever.  Could be useful for things like: Teleportation mishaps, some new spell, a dream sequence, etc

# Hepteract (7-cube)
that's *14* 6-cubes.  This would be  unplayable in any configuration i'm pretty sure.  I can write up a description if people **really** want.

# VTT integration 
I ran this 'manually' with Roll20.  I had a folder with maps for each room and just bounced back and forth as needed.  it was fine but sort of annoying.   Haven't done a ton of investigation on the integration options, but we cold make it less necessary to switch tabs a bunch i'm pretty sure.

# Cloud version
I opted not to do this, because managing the cloud infrastructure would be annoying.  If people want it (and will pay for it), it's not that complicated to add.

# Desktop app (Electron/Tauri)
The GitHub Pages link (see README) covers "click to run" for now with near-zero maintenance. A real installable desktop app — double-click icon, works fully offline forever, no browser tab — is a heavier lift: per-OS builds, code signing on Mac/Windows so it doesn't get flagged as unsigned/untrusted, and a release pipeline to keep it updated. Worth doing once there's demonstrated interest, not before.

