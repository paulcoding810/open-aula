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

## Side lights (experimental)

The driver supports this, but `rgb-keyboard.xml` turns it off for the S75 Pro (`sidelight="0"`). It uses the same lighting command, with the mode in byte 0 and the rest zero:
`18` → `13 count=1` → `mode 00 … aa55` → `02` → `f0`.
Modes: `20` Flowing, `21` Red, `22` Yellow, `23` Green, `24` Ice Blue, `25` Blue, `26` Pink, `27` White, `28` Neon, `29` Off.
Tested on an S75 Pro over 2.4 GHz, the firmware doesn't follow the driver's list. `22` shows blue, `23` pink/neon, and `24` turns the side lights off. `25`–`29` (including the driver's Off) do nothing. The web app offers only `20`–`24`, labelled by what the keyboard actually does.
The keyboard's light bar (toggled with Fn+Z) is handled in firmware; the vendor driver has no command for it.
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

---

# AULA F75 (SinoWealth "BYCOMBO4" / `CDevG5KB`)

Reverse-engineered from `OemDrv.exe` in `AULA F75 driver.exe`, decompiled to `work/f75/oem.c`. `KB.ini` has `Fw=24` (0x18), which selects the `CDevG5KB` class.

## Transport
- USB `258A:010C`, on the interface with usage page `FF00`, usage 1. It uses 520-byte feature reports (0x208, including the report ID) with report ID **6**.
- The 2.4 GHz dongle `3554:FA09` goes through a separate delegate class and isn't supported.
- Packet: `06 cmd sub 00 total idx sizeLo sizeHi` + up to 512 data bytes.
- Writes are split into 512-byte chunks (`total` chunks, `idx` 0..total-1).
- Reads send the same header with `cmd | 0x80`, then GetFeature returns the data at byte 8. There's a ~20 ms pause before each packet.

## Commands (vtable of `CDevG5KB`)
| Write | Read | Data |
|---|---|---|
| `03` sub=layer | `83` | key matrix, `MatrixLen`(128) × 4 bytes; with `CRC=1` the last entry is `00 00 5A A5` |
| `04` | `84` | LED/config block, 128 bytes, signature `5A A5` at 126 |
| `05` | `85` | macro buffer |
| `06` sub=group | `86` | colour group (three colour planes) |
| `0A` | `8A` | effect colour table: 21 bytes (7 × RGB) per effect slot, starting at offset 21; padded to 512 bytes with `5A A5` at 0x1FA |
| `0B` | – | screen parameters |
| `11` | – | ResetDevice (1 data byte; the value isn't known, so it isn't used) |

## Key entries (`keyinfo_to_hardware_code`, FUN_0048c820)
- Unset entries mean *no function*, so every key's default must be written. The defaults are `00 00 hid 00`, with Fn = `0D 00 00 00` and the knob = `07 00 00 1D` (from the `KB.ini` raw code).
- `00 mods hid hid2`: keyboard key; modifiers as HID `E0`–`E7` in byte 2.
- `02 00 usageHi usageLo`: consumer key.
- `01 btn 01 00`: mouse button (1 left, 2 right, 3 middle, 4/5 side). `01 01 02 00` is a double click; `01 08` / `01 09` are wheel up/down.
- `03 mode count id`: macro, with mode 1 = repeat count times, 2 = while held, 4 = until any key; `id` is the 0-based index in the macro buffer.

## LED block (read-modify-write)
- byte 3: debounce. byte 10: active hardware effect (`KB.ini` `LedOptN = ui,hw,…`). byte 0x18: sleep (`SleepHW`).
- Effect slot *i* (`LedOpt` order): `0x3A+2i` = brightness (0–9); `0x3B+2i` = `speed<<4 | colourIndex`, where colour index 0–6 picks from the effect's 7 table colours and 7 means random.

## Macro buffer
- Table: one `u16 addr, u16 size` entry per macro, with addresses counted from the buffer start. Only macros bound to keys are written, in binding order.
- Each macro: a name-length byte, the UTF-16LE name, then 4-byte events `type<<4 | up<<7 | delay[19:16], delay[15:8], delay[7:0], code`. Types: 1 key, 2 mouse, 5 wheel.

---

# AULA SC620 mouse (`0x55` protocol)

Reverse-engineered from `AULA SC620.exe` (MFC + YJXUI.dll, statically linked hidapi), decompiled to `work/sc620/sc620.c`. The app has two protocol families, picked by `device_type < 201`. The SC620's `config.xml` has `device_type="101"`, which selects family A (`FUN_0043a400`).

## Transport
- USB `A8A4:2255` and dongle `A8A5:2255` (MI_02) use the same protocol. Both are 64-byte output and input reports with report ID 0.
- Packet (WebHID data, i.e. hidapi buffer minus the report-ID byte): `55 cmd flag chk len offLo offHi profile data[56]`.
- `chk` = sum of bytes 4..63, mod 256. `flag` is `A5` for writes and `AE` for parameters.
- The mouse replies `AA cmd …`. The driver retries after 100 ms and again after 1 s.
- Feature report `0x51` (21 bytes) is used only for version strings.

## Commands
| cmd | data | |
|---|---|---|
| `03` | – | firmware version (reply bytes 3–5 are ASCII digits) |
| `09` | 11 × 4 bytes | button map (see below) |
| `0D` | 56-byte chunks with an offset | macro area, followed by `10` commit |
| `0F` len 46 | parameter block | see below |
| `21` len 3 | `00 00 mode` | light mode: 0 Wave, 1 Neon, 2 Cycling flash, 3 YOYO ball, 4 Single flash, 5 Breathing loop, 6 Off |
| `22` len 3 | `00 00 stage+1 dpiLo dpiHi` | active DPI stage |
| `23` len 3 | `00 00 rate` | polling rate: 1=125, 2=250, 3=500, 4=1000 Hz |
| `30` len 0x2E | – | battery: reply byte 8 = %, byte 9 = charging |

## Parameter block (`0F`)
`profile, lightMode, rate, 6, stage+1, dpi[6] u16 LE (50–26000), rgb[6] (3 bytes each), 0 0 0 0, scrollReverse, liftoff (1/2 mm), sensor, debounce, sleep (minutes), esports`.

Sensor bits: `10` ripple control, `01` angle snap, `20` motion sync.

## Button entries (`FUN_00411110`)
- `20 mask 00 00`: mouse button (1 left, 2 right, 4 middle, 8 back, 10 forward); `20 01 02` is a double click.
- `21 38 01` / `21 38 FF`: wheel up / down. `21 55`: DPI cycle.
- `10 mods hid 00`: keyboard key.
- `30 lo hi 00`: consumer (media) key.
- `70 idx n 00`: macro, repeat n times; `70 idx 01 02` repeats until released, `70 idx 01 03` until any click.
- `00 00 00 00`: disabled.

Slot order, confirmed on hardware (2026-10-17): 0 left, 1 right, 2 wheel click, 3 rear side, 4 front side, 5 DPI button (underside), 6 scroll up, 7 scroll down, 9 side button below the front one. Slots 8 and 10 have no physical button.

## Macro area
- A 32 × u16 offset table, with data from 0x40.
- 4-byte events: `delayLo delayHi flags code`.
- Flags: bit7 = last event, bit6 = press; low bits 1 = modifier key, 2 = key, 3 = mouse button, 4 = wheel.
- An empty macro is a single `00 00 80 00`.
