# Gambaguette 0.1.1 — Dark mode & private overlay

## What's new

- **Dark mode:** a saved theme for the board panel and toolbar popup, synchronized across tabs.
- **Windows private overlay:** draws the arrow and hint card in a separate window using Windows capture exclusion.
- **Automatic hiding:** the native overlay hides when the browser loses focus or stops sending updates. If the helper disconnects, hints stay hidden in the browser until private mode is turned off.

## Update and setup

1. Reload Gambaguette at `chrome://extensions`, then refresh chess.com.
2. Enable **Dark mode** in the panel settings or toolbar popup.
3. For private mode, open the toolbar popup, click **Copy setup command**, and run it from the project folder. This builds and registers the Windows helper without administrator access.
4. Enable **Private overlay** in the popup. Use the popup to adjust settings while the browser panel is hidden.

The helper requires Windows 10 version 2004 or Windows 11, plus Node.js and npm for setup. Keep the project folder and `helper/bin` in place while installed. Run `npm run helper:remove` to unregister it.

## Capture compatibility

Capture exclusion was verified with Windows capture. Compatibility depends on the recording or screen-sharing software's capture method; make a short test recording before sharing. The toolbar popup remains ordinary browser UI, so configure settings before recording.

See [Microsoft's capture-exclusion documentation](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity) for platform limitations.
