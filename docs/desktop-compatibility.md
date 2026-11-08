# Desktop compatibility

The same application runs on Windows and macOS. Layout follows the available
viewport width, while shortcut hints follow the host platform. Editing accepts
both Control and Command; Windows also supports Control+Y for redo. Native text
editing, input-method composition and AltGr/Option input keep their own keys.

The Pages release waits for `compatibility.yml`. It builds and tests the app on
native Windows and macOS runners, then drives Windows Chromium and Edge, macOS
Chromium and WebKit. WebKit is engine coverage, not a claim that every Safari
release or physical keyboard has been tested.

Each browser checks selection, duplication, undo/redo, deletion, save/reload,
offline local saving, JSON download/reopen, SVG embedded fonts, PDF font embedding
and file structure, and a decoded PNG with visible pixels. Downloads use a Windows
reserved name as a regression fixture. Unit tests also protect IME input, modal
clipboard ownership, save errors, cloud retry/recovery and revision conflicts.
The separate cloud workspace workflow verifies shared-map access and conflicting
saves against a disposable backend.

Run the browser script only in an isolated test environment after building the
app without a library URL and installing the chosen Playwright browser:

```sh
node e2e/compatibility.mjs chromium
```

Screenshots are retained as short-lived CI artifacts. No production accounts or
maps are used by these checks.
