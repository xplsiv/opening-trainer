Vendored copy of the opening names/ECO dataset from
https://github.com/lichess-org/chess-openings (files a.tsv … e.tsv, columns eco, name, pgn),
downloaded 2026-11-20. License: CC0 Public Domain Dedication (stated in that repository's README).

Used by `scripts/check-eco.ts` to cross-check opening names and ECO codes, and loaded lazily by the game review as its opening book (book moves and opening names).
