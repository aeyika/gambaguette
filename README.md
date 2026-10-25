# Gambaguette

Local Stockfish hints for supported chess.com boards. Analysis runs on your device; you make the moves.

## Install

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this project's `dist` folder.
3. Open or refresh chess.com.

After an update, reload the extension and refresh chess.com.

## Controls

Open **Settings** to change arrow colour, side detection, and search time.

- **Instant · 0.1 s:** fastest search; deeper options remain available. The 100 ms budget excludes startup and board-reading time.
- **Auto-detect side:** selects White or Black independently in each tab. Without player metadata, it uses the initial board orientation. Choosing a side manually disables detection.
- **Auto hints / Get hint:** automatic or on-demand suggestions.
- **Pause:** clears hints and cancels pending analysis.
- Drag the header to move the panel; use the collapse button to hide its contents.

Evaluations are from White's perspective. Colours and preferences are saved locally.

## Development

```powershell
npm ci --ignore-scripts
npm run build
npx playwright install chromium
npm run check
```

`npm run test:live` also checks the public chess.com computer page. Builds go to `dist`; test screenshots go to `test-results`.

## License

GPL-3.0-only. See [LICENSE](LICENSE) and [THIRD_PARTY.md](THIRD_PARTY.md).
