# Gambaguette

Local Stockfish hints for supported chess.com boards. Analysis runs on your device; you make the moves.

## Install

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this project's `dist` folder.
3. Open or refresh chess.com.

After an update, reload the extension and refresh chess.com.

## Controls

Open **Settings** to change arrow colour, side detection, and search time.

- **Dark mode:** switch themes from the panel or toolbar popup. The choice is saved and shared across tabs.
- **Instant · 0.1 s:** fastest search; deeper options remain available. The 100 ms budget excludes startup and board-reading time.
- **Auto-detect side:** selects White or Black independently in each tab. Without player metadata, it uses the initial board orientation. Choosing a side manually disables detection.
- **Auto hints / Get hint:** automatic or on-demand suggestions.
- **Pause:** clears hints and cancels pending analysis.
- Drag the header to move the panel; use the collapse button to hide its contents.

Evaluations are from White's perspective. Colours and preferences are saved locally.

## Private overlay (Windows)

1. Reload the extension after updating.
2. In its toolbar popup, click **Copy setup command** and run the command from this project folder. The helper is built locally and registered for your extension; no administrator access is needed.
3. Enable **Private overlay**. The browser panel and arrow disappear, and the Windows helper draws the hints instead. Configure colour, dark mode and other preferences from the toolbar popup.

Requires Windows 10 version 2004 or Windows 11. The helper uses [Windows capture exclusion](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity); support depends on the recorder's capture method. Check a test recording before sharing. The toolbar popup itself is normal browser UI, so configure it before recording.

The helper hides when the browser loses focus or stops sending updates. If it disconnects, browser hints stay hidden. Turn **Private overlay** off in the popup to restore them. Keep `helper/bin` in place while installed. `npm run helper:remove` unregisters the helper.

## Development

```powershell
npm ci --ignore-scripts
npm run build
npx playwright install chromium
npm run check
```

`npm run test:live` also checks the public chess.com computer page. Builds go to `dist`; test screenshots go to `test-results`.

Windows helper checks: `npm run test:helper` and `npm run test:private` (the latter registers the local native host).

## License

GPL-3.0-only. See [LICENSE](LICENSE) and [THIRD_PARTY.md](THIRD_PARTY.md).
