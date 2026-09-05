# Architecture

[English](architecture.md) · [한국어](architecture.ko.md)

`File → Web Audio decoding → mono PCM → dedicated Worker → Easy/Hard notes → Player`

- **Creator:** file/title input and optional video URL. A `File` reference stays in page memory for playback. No file-fetch/upload endpoint is called.
- **DSP:** 22,050 Hz mono audio, 1,024-point FFT, positive spectral flux, local peak selection and deterministic density limits. v3 lane assignment uses onset spectral brightness when contrasting timbres are present, with accent/phrase motifs as a fallback. It preserves onset times, allows bounded repeat hits and avoids very fast one-hand runs. No trained model or external inference service. The Worker is terminated on completion/cancel; asynchronous decoding results are discarded after cancellation.
- **Player:** canvas renderer, two logical lanes and six physical key bindings. Landscape scrolls right to left; portrait phones scroll downward. Matching star/diamond receptors also accept pointer/touch input. Native audio `currentTime` or the official embedded player clock drives judgment. Pause/buffering do not accumulate misses. Seeking resets the score into practice mode.
- **Sources:** local audio uses a revocable object URL; the optional video uses its own audiovisual playback. Switching sources destroys the old player. Local audio always starts with zero video offset.
- **Localization:** EN/KO language state with a browser preference. Switching languages rerenders React without discarding the selected audio or chart. Worker error messages are translated on receipt.
- **Server:** Vite middleware for development; static `dist/` serving in production. Loopback port 51100 by default. No database, session cookies, upload or publishing path. Compatibility `POST /api/charts` rejects with 403.
- **Privacy:** page-memory session only. Language preference is the only application storage. YouTube embeds and demo infrastructure have their own network behavior.

Tests use generated audio and mocked video events. They do not establish actual-song chart quality or certify platform-policy compliance. Dependencies retain their own licenses; the project license does not license media selected by users.

Repeated two-bar phrases are compared by onset spacing, relative strength and brightness. Close matches reuse hand patterns while preserving note times and run limits. This is a conservative recurrence heuristic, not chorus/verse recognition; tempo drift, different arrangements and phrase boundaries may prevent a match. Regenerate the chart to apply it.
