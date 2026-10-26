# Media Diary

[한국어](README.ko.md)

Keep a diary of what you've watched, read, and listened to — movies, series, anime, webtoons, manga, and albums — right inside Obsidian. Search a title, pick it, and Media Diary creates a note with the poster, credits, and details, then asks for a half-star rating and a one-line review.

Media Diary is Korean-first: Korean titles, broadcasters, streaming services, and K-pop release types come through naturally. English content works just as well.

## Features

- **Six media types in one search window:** movies and series (TMDB), anime, webtoons, and manga (AniList), albums (Apple Music).
- **Three titles per work:** Korean, English, and original titles are all saved, and the extra ones go into `aliases` so any of them finds the note.
- **Korean works first:** search in Korean and Korean titles rise to the top.
- **Details that matter for K-content:** broadcaster (tvN, JTBC…), streaming services in Korea (Netflix, TVING…), Korean age rating, webtoon platform and serial status, album type (studio album, EP, single, OST).
- **Ratings out of 5 in half stars**, shown as ★★★★½ in the note, plus status, a one-line review, and a viewing log (`watched_dates`) that grows each time you revisit something.
- **Quotes, lyrics, and memos:** keep favorite lines and free notes in their own sections of the note.
- **Templates you can edit**, one each for video, comics, and music. Lines whose variables are empty are left out, so a movie note never shows an empty "network" line.
- **Fill an existing note:** search and add details to a note you already have, without touching your rating or review.
- Korean and English interface.

## Getting started

1. Install Media Diary from Community plugins and enable it.
2. For movies and series, get a free TMDB key: sign up at [themoviedb.org](https://www.themoviedb.org/), open [Settings → API](https://www.themoviedb.org/settings/api), and copy the **API key** or the **API Read Access Token**. Paste it in Media Diary settings and press **Test connection**. Webtoons, manga, anime, and albums need no key.
3. Click the clapperboard icon in the ribbon, or run **Search and add to your media diary**.

## Commands

| Command | What it does |
| --- | --- |
| Search and add to your media diary | Choose a type, search, and create a note. |
| Rate and review the current note | Opens the star rating, status, and one-line review window. |
| Add a quote or memo to the current note | Opens a small window for a quote, lyric, or memo only. |
| Fill current note's properties with media info | Adds details to the current note. Your rating, status, and review are kept. |

## Rating window

- **Stars:** click a star (the left half gives half a star), or use ← → to adjust and 0 to clear. Numbers 1–5 set whole stars.
- **One-line review**, **status**, and the **date**, which is added to your viewing log.
- **Words to keep:** a favorite line, quote, or lyric, with an optional source (who said it, episode, track). It goes into the note's *Quotes* section (*Lyrics & lines* for albums) as a quote callout.
- **Memo:** anything else, saved under *Memo* with the date.

Press Ctrl/Cmd + Enter to save. Open the window again any time to add another quote; earlier ones are kept.

The rating is saved twice: as stars you can read at a glance, and as a number for sorting in Bases or Dataview.

```yaml
status: watched
my_rating: 4.5
stars: ★★★★½
one_liner: "Quiet, warm, and devastating."
watched_dates: ["2026-10-23"]
```

```markdown
## Quotes

> [!quote] The lead · Ep. 3 · 2026-10-27
> I'm not a good person, but I want to be.
```

## Data sources

- Movie and series data: [TMDB](https://www.themoviedb.org/). *This product uses the TMDB API but is not endorsed or certified by TMDB.*
- Anime, webtoon, and manga data: [AniList](https://anilist.co/).
- Album data: Apple iTunes Search API.

Media Diary only sends your search terms to these services. Your API key is stored in your vault's plugin settings.

## Support

If Media Diary is useful to you, you can [buy me a coffee](https://buymeacoffee.com/4h9fg59wsgd).

## License

MIT
