# Changelog

## 0.2.3

- Rating window: the stars no longer shift sideways while you move over them. The value beside them now reads "4.5 / 5" in a fixed-width space.

## 0.2.2

- Fixed the out-of-date `package-lock.json` so `npm ci` and the build verification succeed.
- The lint tools moved to `tools/lint` with their own install, so the plugin build only installs what it needs.

## 0.2.1

- Code fixes from the Obsidian plugin review: no callbacks return values where none are expected, one unnecessary type assertion removed, and safer handling of TMDB IDs.
- Added lint checks matching the community plugin review.

## 0.2.0

- Rating window: new fields for words to keep (a favorite line, quote, or lyric, with its source) and a free memo. They go into the note's Quotes (Lyrics & lines for albums) and Memo sections, and stack up each time you add more.
- New command: Add a quote or memo to the current note.
- Ratings are also saved as stars (`stars: ★★★★½`) next to the numeric `my_rating`, and the window shows the stars as you choose.
- Default templates gain Quotes and Memo sections. Older notes get the sections added at the end when needed.
- Ctrl/Cmd + Enter saves the rating window.

## 0.1.1

- Interface language setting (English, Korean, or follow Obsidian) now applies right away, including command names and the ribbon icon. No restart needed.
- The 'Follow Obsidian' option shows which language it currently means.

## 0.1.0

- First release: search movies and series (TMDB), anime, webtoons, and manga (AniList), and albums (Apple Music) and create diary notes.
- Korean, English, and original titles saved together; Korean works listed first when searching in Korean.
- Rating window: 5 stars in half steps, status, one-line review, viewing date log.
- Editable templates for video, comics, and music; empty lines are left out.
- Fill an existing note's properties without touching your rating or review.
- Korean and English interface.
