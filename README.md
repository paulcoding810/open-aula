# AULA Web Driver

A browser-based configuration tool for AULA keyboards and mice, built from reverse-engineering the vendor's Windows drivers. It talks to the device directly over [WebHID](https://developer.mozilla.org/docs/Web/API/WebHID_API): no installer, no background service.

> **Unofficial.** This project is not affiliated with, endorsed by, or supported by AULA. "AULA" and the product names are trademarks of their respective owners. Use it at your own risk: writing a wrong configuration to a device is usually fixable with the vendor tool, but there is no warranty.

## Supported devices

| Model | Connection | Features | Hardware status |
|---|---|---|---|
| **AULA S75 Pro** | USB, 2.4 GHz dongle | lighting, per-key RGB, keymap (base + Fn), macros, screen GIF and clock (USB only), side lights, settings | **Confirmed** on real hardware |
| **AULA SC620** (mouse) | USB, 2.4 GHz receiver | DPI stages, buttons, lighting, macros, sensor and polling settings, battery | **Button map confirmed** on real hardware; other features untested |
| AULA F87 Pro | USB, dongle | lighting, per-key RGB, keymap (base + Fn), macros, LED matrix, settings | Untested: built from the vendor's code only |
| AULA F75 | USB | lighting, keymap (base layer), macros, settings | Untested: built from the vendor's code only |

Only the S75 Pro, and the SC620's button map, have been checked against a real device. Everything else is implemented from the decompiled or decoded vendor software and covered by offline tests, but may still be wrong in ways only hardware would reveal. Check the **Log** tab while testing; it shows every packet sent and received.

## Running it

WebHID needs a Chromium-based desktop browser (Chrome, Edge, Brave…) and a secure context: HTTPS or `localhost`.

**On GitHub Pages:** `.github/workflows/pages.yml` publishes `web/` as-is on every push to `main` that touches it, or on demand from the Actions tab. There is no build step. To turn it on, set *Settings → Pages → Source* to **GitHub Actions**.

**Locally:**

```sh
cd web
python3 -m http.server 8765
```

1. Open the page (http://localhost:8765 locally) and click **Connect device**.
2. In the browser's device list, select **every** entry for your device. Keyboards and dongles expose several HID interfaces under the same name, and the configuration interface is often not the first one. The app warns you if it finds a device but not its configuration interface.
3. With several devices connected, switch between them from the header.

With nothing connected, the app runs as a **simulator**: pick a model in the header and every action is logged on the Log tab instead of being sent.

Settings are kept per model in the browser's local storage, and can be exported and imported from the Settings tab.

## Repository layout

| Path | Contents |
|---|---|
| `web/` | The app: plain ES modules, no build step |
| `web/protocols/` | One module per device protocol (`aula04`, `aa`, `g5kb`, `mouse55`) |
| `web/models/` | Per-model profiles: USB IDs, features, effects, layouts |
| `web/PROTOCOL.md` | The reverse-engineered protocols, byte by byte |
| `REVERSING.md` | How each driver was reverse-engineered, with commands |
| `tools/` | Ghidra scripts and helpers used for the reversing, and layout generators |

## What is not included

The vendor installers (`*.exe`) and everything extracted or decompiled from them (the `work/` directory: unpacked files, Ghidra projects, decompiled sources) are **left out of the repository for copyright reasons**. Both are already in `.gitignore`. To reproduce the reverse-engineering, download the official drivers from AULA and follow `REVERSING.md`.
