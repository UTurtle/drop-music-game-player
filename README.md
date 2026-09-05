# DROP

**My favorite songs weren’t in rhythm games. So I made this.**

[English](README.md) · [한국어](README.ko.md)

Pick an audio file, choose Easy or Hard, and play with two keys. Add an optional video link if you want to watch along. DROP runs locally in your browser; there is no music upload or public chart publishing.

[Try the temporary demo](https://music-player.ludo-demo.com) · [Use your own music](https://music-player.ludo-demo.com/create)

The demo may go offline. Local execution is the main way to use this project.

![Practice gameplay with large two-key lanes](docs/images/play.png)

## Run locally

Requires **Node.js 22.22.2 or newer** and npm. Use a current desktop browser; Chromium is the browser used for testing.

```bash
git clone https://github.com/UTurtle/drop-music-game-player.git
cd drop-music-game-player
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:51100**. Stop with `Ctrl+C`. These npm commands work on Windows, macOS and Linux; automated validation was run on Linux with Chromium.

For development with live reload:

```bash
npm run dev
```

Stop the existing server before using the same port. `DROP_PORT` changes the port and `DROP_HOST` changes the bind address; the default is loopback (`127.0.0.1`). Do not use `file://` to open the HTML.

## Play

1. Open **Play my music**.
2. Select a WAV, MP3 or FLAC file (up to 50 MB, 1 second–10 minutes).
3. Enter a title. A video link is optional.
4. Press **Make & play**, then choose Easy or Hard.
5. Press **PLAY** and hit notes as they reach the line.

| Action | Keys |
| --- | --- |
| Star | `A`, `←`, or `Z` |
| Diamond | `D`, `→`, or `X` |
| Pause / resume | `Space` |
| Fullscreen | `F` (exit with `Esc`) |

EN / KO switches the interface language without reloading the current session. Your language choice is saved in this browser.

Desktop and landscape screens scroll right to left; portrait phones scroll downward. Match stars with the star outline and diamonds with the diamond outline. On touch screens, tap the matching target.

No file handy? **Practice** uses original synthesized audio included as code.

## Optional video

Video links currently support **YouTube’s official embedded player**, with its own audio. The linked video and local audio are alternative playback sources, not mixed tracks. After generation, select **Play the linked video instead of my audio file**. Internet access and an embeddable video are required.

Generation still needs your local audio file. DROP does not download videos, capture streams or extract audio. If the video has a different intro, adjust the video offset. An offset cannot fix cuts or inserts in the middle of a song.

## Where does my music go?

- File decoding, chart generation and playback happen in your browser.
- Audio and charts stay in page memory. **Refreshing or closing the page clears the session.** There is no saved library yet.
- There are no accounts, audio uploads, chart publishing, rankings or analytics trackers.
- The local server serves the application. No database is required.
- Optional video playback connects to YouTube. The public demo’s tunnel/hosting provider can process ordinary connection metadata; local audio-only play does not require that demo.
- Installing dependencies requires internet access. After installation and a build, local audio-only play works without internet access while the local server is running.

## Expectations

The v2 generator uses onset brightness, accents and short phrase patterns, including repeat hits. Easy caps same-side runs at two; Hard at three, with very fast events alternating to avoid excessive one-hand bursts. Existing sessions must be regenerated to use these rules.

Automatic charts are rough DSP-generated drafts, not hand-mapped charts. They can miss musical accents or feel repetitive. Real-song quality and synchronization vary; the automated tests use synthetic audio and mocked video events. There is no model training, and this is a hobby project, not a commercial service.

Use music you created or files you have the necessary rights to use. The MIT license covers this project’s code, **not third-party music, videos or platform permissions**. No copyrighted songs or videos are bundled. See [YouTube terms](https://www.youtube.com/t/terms) and [Google privacy policy](https://policies.google.com/privacy) for optional video playback.

## Development and checks

```bash
npm test
npm run build
npx playwright install chromium
npm run test:v1
# With npm run dev or npm start running in another terminal:
npm run test:e2e
```

`test:v1` starts an isolated server on port 5191 and verifies real local WAV playback, generation, controls, private-session behavior and blocked uploads. `test:e2e` exercises the practice game and EN/KO UI. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if using an existing Chromium installation.

[Architecture](docs/architecture.md) · [Contributing](CONTRIBUTING.md) · [License](LICENSE)

Empty presses break your combo and deduct 1,000 points, including below zero. Rapid notes still accept correctly timed presses.
