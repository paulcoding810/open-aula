# AULA S75 Pro HID protocol

Reverse-engineered from `DeviceDriver.exe` (S75Pro Driver Beta 1.0.0.2, inside the Inno Setup `Driver.exe`).

## Interfaces

| Mode | VID:PID | Interface | Used for |
|---|---|---|---|
| USB | `0C45:800A` | 64-byte feature report, no report ID | all configuration |
| USB | `0C45:800A` | 4096-byte output report | screen image upload |
| 2.4 GHz | `05AC:024F` (MI_03) | 32-byte output and input reports | configuration through the dongle |

## USB framing

Every command is a 64-byte feature report. After sending a control command the driver waits 35 ms (`cmd_delaytime`), then reads one feature report back as an acknowledgement. Data blocks are sent as consecutive 64-byte feature reports with 35 ms between them.

Control command: `04 <op> <b2> 00 00 00 00 00 <count lo> <count hi> …` (`count` = number of 64-byte data packets that follow).

Data blocks end with `aa 55` in their last two bytes.

| Op | Meaning | Data |
|---|---|---|
| `18` | begin session | – |
| `02` | end session / save | – |
| `f0` | apply | – |
| `13` | lighting mode | 1 packet: `mode r g b 0 0 0 0 colorful brightness speed direction … aa55` |
| `17` (b2=1) | settings | 1 packet: `00 01 winLock altF4 altTab fnSwitch sleep 00 response … aa55` |
| `28` | clock | 1 packet: `00 slot 5a yy mm dd hh mi ss 00 weekday … aa55` |
| `11` / `27` | keymap, base / Fn layer | 9 packets (576 bytes), 4 bytes per `key_index` |
| `23` | per-key colours (mode `0x80`) | 9 packets, `[light_index r g b]` per `light_index` |
| `f5` | read per-key colours | 9 feature reports read back |
| `20` (count 8) | live per-key colours (music mode) | 512 bytes |
| `19`, then `15` | macros | `count` packets (see below) |
| `72` (b2=slot) | screen | `count` = number of 4096-byte chunks sent on the screen interface |

Typical write sequence: `18` → `<op>` → data → `02` → `f0`.

### Lighting

Modes: 1 Static, 2 Single On, 3 Single Off, 4 Glittering, 5 Fluttering, 6 Colourful, 7 Breath, 8 Spectrum, 9 Outward, 10 Scrolling, 11 Rolling, 12 Rotating, 13 Explode, 14 Launch, 15 Ripples, 16 Flowing, 17 Pulsating, 18 Tilt, 19 Shuttle, 0 Off, `0x80` per-key.
Brightness and speed range from 0 to 5. Direction: 0 left, 1 right, 2 up, 3 down.

### Keymap entries (4 bytes)

| Bytes | Action |
|---|---|
| `00 00 00 00` | default |
| `05 03 00 00` | disabled |
| `02 mods hid 00` | key or combination (mods = HID modifier bitmask) |
| `01 01/02/04/08/10 00 00` | mouse button (left, right, middle, 4, 5); `01 03` double click |
| `01 03 01 00` / `01 03 ff 00` | wheel up / down (the driver writes this as type `01`, sub `03`) |
| `03 lo hi 00` | consumer usage (media keys, browser, calculator…) |
| `06 index mode loops` | macro; mode 0 once, 1 N times, 2 toggle, 3 while held, 4 click |
| `05 02 id 00` | driver-side functions (run program, open URL, send text) — not portable |

### Macros

The buffer is padded to `count × 64` bytes with `aa 55` at the end, where `count = len/64 + (len % 64 ? 2 : 1)`.
- Bytes 0–399: one 4-byte entry per macro, holding a u16 LE offset (or `ff ff ff ff` if the macro is empty).
- At each offset: u16 step count, 6 zero bytes, then 4-byte steps:
  - `00 00 hid b0` key down, `00 00 hid 30` key up
  - `00 00 btn 90` mouse down, `00 00 btn 10` mouse up (btn: 1 left, 2 right, 4 middle)
  - `lo hi 00 50` delay in ms (minimum 10)

### Screen (135×240)

The image is a 256-byte header followed by the frames, padded with `ff` to a multiple of 4096 bytes:
- Header: byte 0 = frame count (up to 141); bytes 1..n = frame delay in units of 2 ms.
- Frames: RGB565, little-endian, top-down rows.

Sequence: `18` → `72 slot count` → `count` × 4096-byte output reports (each waits up to 300 ms for an input report) → `02`.

## 2.4 GHz framing

A 32-byte output report: `cmd len seq data[28] checksum`, where checksum = sum of the first 31 bytes, mod 256. The dongle echoes `cmd len seq` in an input report.

| cmd | Meaning |
|---|---|
| `05` | lighting (data = USB lighting payload, with `aa55` at data[14]) |
| `07` | settings (same layout) |
| `0c` | clock |
| `10` / `12` | keymap base / Fn — 21 chunks of 28 bytes (the last chunk has `len` 0x10) |
| `14` | per-key colours — 21 chunks |
| `09` | macros — 28-byte chunks |
| `20` (len 1) | battery query; reply byte 3 = percent |
| `7f`, `80+` | screen over the dongle (not used) |

## Bar / side light (experimental)

The driver supports this, but `rgb-keyboard.xml` turns it off for the S75 Pro (`sidelight="0"`). It uses the same lighting command, with the mode in byte 0 and the rest zero:
`18` → `13 count=1` → `mode 00 … aa55` → `02` → `f0`.
Modes: `20` Flowing, `21` Red, `22` Yellow, `23` Green, `24` Ice Blue, `25` Blue, `26` Pink, `27` White, `28` Neon, `29` Off.
Over the dongle: cmd `05`, len `01`, data[0] = mode, `aa55` at data[14].

---

# AULA F87 Pro (`AA` protocol)

Taken from the vendor's own WebHID app (`F87Pro Software.exe` → Electron → `app.asar` → `dist/static/js/app.*.js`, object `Xn`). It belongs to the same Sonix firmware family as the S75 Pro (same lighting payload and key-entry encoding) but uses different framing.

## Transport
- USB `38A6:2710/2711/2712/2713` and `0C45:8803`; dongles `0C45:FEFC` (usage page `FF80`) and `0C45:FEFE` (`FF60`).
- The interface is the vendor-usage-page collection. Output and input reports have report ID 0, and their size (`packLen`) is 32 bytes, or 64 on usage page `0xFF68`.
- Packet: `AA cmd len offLo offHi o5 o6 o7 data[packLen-8]`.
- The keyboard answers **every** packet with an input report echoing `cmd`; the next packet goes out only after that reply. A read reply carries data at byte 8, with `len` and `offset` from bytes 2–4.
- Buffers are split into `packLen-8` byte chunks at increasing offsets. `len` = chunk size, except the last chunk of a multi-chunk transfer, which uses the remainder.

## Commands
| Read | Write | Data |
|---|---|---|
| `10` | – | device info (32 B); bytes 2–3 give the macro area size |
| `11` | `21` | settings (16 B): [3] sleep minutes, [4] response time 1–5, [5] polling rate (3=1K, 4=2K, 5=4K, 6=8K), [6] OS mode, [7] matrix clock format |
| `12` | `22` | base keymap, 512 B = 128 × `[type a b c]` |
| `16` | `26` | Fn layer, 512 B |
| `13` | `23` | lighting, 16 B: `mode R G B FF 0 0 0 colourful brightness speed direction 0 0 AA 55` |
| `14` | `24` | per-key colours, 512 B = `[index R G B]` × index (shown when mode `0x80` is active) |
| `15` | `25` | macros (see below) |
| – | `2A` | 7×7 LED matrix: byte 6 = built-in animation 1–14 |
| – | `00` | save/commit, data `00 00 00 00` (sent after macros and after settings) |
| – | `0F` | reset: `AA 0F 05` resets keys, `AA 0F FF` factory reset |

Lighting modes: 1–19 as on the S75 Pro, plus `17` Rainbow Windmill, `18` Colour Gather, `19` Neon Overlay, `80` custom, and 0 for off. Direction is 0 or 1 (left/right, or up/down).

Key entries use the same encoding as the S75 Pro: `02 mods hid`, `03 lo hi` (consumer), `01 btn …` (mouse), `06 idx mode n` (macro; mode 0 once, 1 repeat n times, 2 toggle). The vendor app reads the keymap (`12`/`16`) and writes back the whole 512 bytes.

## Macros
- Bytes 0–399: one u32 LE address per macro, with the first macro at 400.
- At each address: `u16 (2 × records), 00 00`, then 4-byte records `delayLo delayHi hid flag`.
- Flags: `b0` key down, `30` key up, `90` mouse down, `10` mouse up.
- The delay belongs to the record it's in; there are no separate delay records.
