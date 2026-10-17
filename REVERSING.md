# Reversing the AULA S75 Pro driver

How the vendor's Windows driver (`Driver.exe`) was turned into the WebHID app in `web/`. The protocol itself is documented in `web/PROTOCOL.md`; this file covers how it was recovered.

Function addresses (`FUN_xxxxxxxx`) refer to `DeviceDriver.exe` from **S75Pro Driver Beta 1.0.0.2**. A different build will move them, but the method is the same.

## 0. Tools

```sh
brew install innoextract ghidra openjdk@21
python3 -m pip install capstone pefile
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
export WORK=$PWD/work && mkdir -p $WORK/proj   # gitignored
```

Helper scripts in `tools/`:

| Script | Purpose |
|---|---|
| `DumpAll.java` | Ghidra post-script: decompile every function into one `.c` file |
| `DumpMatch.java` | Same, but only for functions whose name matches a regex |
| `callers.py` | List functions in the decompiled dump that call the given functions |
| `fn.py` | Print named functions from the dump |
| `peek.py` | Read UTF-16 strings or dwords, or disassemble at a virtual address of a PE |

## 1. Identify and unpack the installer

```sh
file Driver.exe                                   # PE32 GUI
strings -n 6 Driver.exe | grep -iE "inno|nsis|delphi" | sort -u
# -> "Inno Setup Setup Data (6.1.0)": an Inno Setup installer
innoextract -e -d $WORK/ex Driver.exe
find $WORK/ex -type f | sort
```

Interesting output:

- `app/DeviceDriver.exe`: the real program (MFC/C++, 32-bit).
- `app/mui.dll`: the UI library (image and GIF handling).
- `app/config.xml`: USB IDs per connection mode.
- `app/layouts/rgb-keyboard.xml`: key codes, `key_index`, `light_index`, on-screen rectangles, feature flags, and screen size.
- `app/language/1033.lan`: UTF-16 string table (effect names and so on).
- `app/skins/theme1/keyboard/img_keyboard_layout.png`: keyboard picture that matches the rectangles.

```sh
cat $WORK/ex/app/config.xml
#   USB   VID 0C45 PID 800A  MI_00
#   2.4G  VID 05AC PID 024F  MI_03
head -20 $WORK/ex/app/layouts/rgb-keyboard.xml
iconv -f utf-16 -t utf-8 $WORK/ex/app/language/1033.lan | less
```

## 2. Decompile

```sh
/opt/homebrew/opt/ghidra/libexec/support/analyzeHeadless $WORK/proj dd \
  -import $WORK/ex/app/DeviceDriver.exe \
  -scriptPath tools -postScript DumpAll.java $WORK/dd.c -overwrite
wc -l $WORK/dd.c          # ~295k lines
```

## 3. Find the HID transport

```sh
grep -n -E "HidD_|SetupDi|WriteFile|ReadFile|DeviceIoControl" $WORK/dd.c | head -60
```

The `GetProcAddress("HidD_…")` table and the SetupDi enumeration show the driver uses statically linked **hidapi**. The wrappers it uses:

| Function | Real call | Meaning |
|---|---|---|
| `FUN_00451350` | `HidD_SetFeature(h, buf, 0x41)` | send a 64-byte feature report, report ID 0 |
| `FUN_004513f0` | `DeviceIoControl(0xB0192)` = `IOCTL_HID_GET_FEATURE` | read a feature report |
| `FUN_00451130` | `WriteFile` | output report |
| `FUN_00451210` | `ReadFile` with timeout | input report |

One level up are the transport routines everything else calls:

```sh
python3 tools/callers.py $WORK/dd.c FUN_00451350 FUN_004513f0 FUN_00451130 FUN_00451210
sed -n '/FUN_0044edb0 @/,/FUN_0044efa0 @/p' $WORK/dd.c
```

| Function | Behaviour |
|---|---|
| `FUN_0044edb0(buf, len, readback)` | len ≤ 0x41: sleep(cmd_delay), SetFeature, optionally GetFeature. Longer buffers go out as 64-byte SetFeature chunks with retries. |
| `FUN_0044efa0` | like `0044edb0`, but retries when the reply byte 3 is `0xff` |
| `FUN_0044f280` | send a command, then read up to 9 × 64 bytes back (used for `04 f5`) |
| `FUN_0044f4d0` | 2.4 GHz: 33-byte `WriteFile` with a checksum in byte 32, then waits for an input report whose first 3 bytes echo bytes 1–3 |
| `FUN_0044f1b0` | 4097-byte `WriteFile` on a second handle (the screen), then a 300 ms read |

Which handle is which comes from the open routine `FUN_0044f980`:

- Feature report length 0x41 → the config interface.
- Input and output length 0x21 → the dongle.
- Output length 0x1001 → the screen interface.

## 4. Extract every command builder

Dump every function that calls the transport routines into one file, with the noise stripped out:

```sh
python3 tools/callers.py $WORK/dd.c FUN_0044edb0 FUN_0044efa0 FUN_0044f1b0 FUN_0044f280 FUN_0044f4d0 \
 | while read n s l rest; do sed -n "${s},$((s+l-1))p" $WORK/dd.c; done \
 | grep -v -E "^\s*(undefined|uint|int|char|short|byte|bool)[0-9 ]*\**\s*(local_|uStack|puVar|iVar|uVar|bVar|cVar)[^;]*;$" \
 > $WORK/proto.c                                   # ~3.5k lines
```

**Reading Ghidra's byte offsets.** The 64-byte command lives in a stack buffer such as `local_58`. Every other local's name is its frame offset, so byte index = `0x58 − N` for `local_N`. A multi-byte store is little-endian, so `local_58 = 0x1804` puts `04` in byte 0 and `18` in byte 1. For example:

```c
local_58 = 0x1704; local_56 = 1; local_50 = 1;   // -> 04 17 01 00 00 00 00 00 01
local_1a = 0x55aa;                               // -> bytes 62..63 = aa 55
```

From the opcodes and the hidapi `readback` flag you get the pattern used by every feature:

```
04 18                     begin
04 <op> .. count@b8       header (count = 64-byte packets that follow)
<data packets, aa 55 at the end>
04 02                     end/save
04 f0                     apply
```

Mapping functions to features:

- `FUN_00434230` is the worker that runs queued UI jobs. Its `switch` cases show which handler belongs to which job.
- `FUN_00434ee0` sends the full config. Its bits in `this+0x7a4` match the feature flags parsed from the layout XML (`grep -n "0x7a4) =" $WORK/dd.c`).

| Function | Feature |
|---|---|
| `FUN_0042afd0` / `FUN_0042b170` | lighting, USB / 2.4G (`04 13`) |
| `FUN_004141a0` / `FUN_00414410` | settings (`04 17`) |
| `FUN_00418550` / `FUN_00418df0` | keymap (`04 11` base, `04 27` Fn) |
| `FUN_0044b7f0` + `FUN_0044b900` | per-key light (`04 13` mode 0x80, then `04 23`) |
| `FUN_0042adb0` | read per-key colours (`04 f5`) |
| `FUN_0042d5d0` / `FUN_0042db50` | macros (`04 19`, `04 15`) |
| `FUN_00423a80` / `FUN_00423bb0` | clock (`04 28`) |
| `FUN_00422ac0` / `FUN_00423360` | screen GIF (`04 72` + 4 KB chunks) |
| `FUN_00433fd0` / `FUN_00434900` | side ("bar") light |
| `FUN_004357d0` | battery over the dongle (cmd `0x20`) |

## 5. Give the payload bytes meaning

**Lighting fields.** The lighting builder fills its payload from a struct loaded by `FUN_00408520`, which runs `SELECT * FROM t_light_data`. The column order comes from the embedded SQL:

```sh
strings -n 8 $WORK/ex/app/DeviceDriver.exe | grep -A3 "CREATE TABLE IF NOT EXISTS t_light_data"
python3 tools/fn.py $WORK/dd.c FUN_00407e80 FUN_00408520
```

Matching column index to stack offset gives `mode, r, g, b, -, -, -, -, colorful, brightness, speed, direction`.

**Mode numbers and names.** These come from the default-row seeding in `FUN_0042b280`, which inserts one row per mode with `name` = a language-ID string:

```sh
grep -n "FUN_00408020(" $WORK/dd.c | head -3     # the INSERT helper's callers
sed -n '/FUN_0042b280 @/,/FUN_0042b6c0 @/p' $WORK/dd.c
python3 tools/peek.py $WORK/ex/app/DeviceDriver.exe wstr 0x56e3e4 20   # "521", "523", ...
python3 tools/peek.py $WORK/ex/app/DeviceDriver.exe u32  0x575180 4    # default dir/colorful/index/colour
```

`config_func` (0x31, 0x33, …) is a bitmask of which controls are shown. `FUN_0042aa10` tests it bit by bit: 1 brightness, 2 speed, 4 left/right, 8 up/down, 0x10 colourful, 0x20 colour. Its `SetCheck` calls give the direction values (right = 1, left = 0, up = 2, down = 3).

**Key and light indexes.** In the layout parser (`grep -n 'L"key_index"' $WORK/dd.c`), XML `code` maps to `key_index` (map at `this+0x81c`) and to `light_index` (`this+0x824`). Keymap entries sit at `key_index × 4`; per-key colours at `light_index × 4`.

**Keymap entry types.** Read the `switch` on the record type in `FUN_00418550`, plus the helpers:

```sh
python3 tools/fn.py $WORK/dd.c FUN_00451bb0 FUN_00419440   # modifier→bit, consumer usages
```

**Combo-box values.** Ghidra drops the hidden stack arguments of `MComboBox::AddItem`, so disassemble the call sites and read the `push imm` placed right before each one:

```sh
python3 tools/peek.py $WORK/ex/app/DeviceDriver.exe dis 0x410409 0x1a0   # macro play modes 0..4
python3 tools/peek.py $WORK/ex/app/DeviceDriver.exe dis 0x43b680 0x200   # sleep time 0..3
python3 tools/peek.py $WORK/ex/app/DeviceDriver.exe dis 0x433e59 0x40    # side light: data = langID-0x275
```

**Macro steps.** In `FUN_0042d5d0`, the four write pointers (`base+0..3`) and their constants give the step format:

- `0xb0` key down, `0x30` key up.
- `0x90` mouse down, `0x10` mouse up.
- `0x50` delay, minimum 10 ms.
- `FUN_00451480` converts Windows VK codes to HID usages.

## 6. Screen pixel format (mui.dll)

```sh
/opt/homebrew/opt/ghidra/libexec/support/analyzeHeadless $WORK/proj mui \
  -import $WORK/ex/app/mui.dll -scriptPath tools \
  -postScript DumpMatch.java $WORK/mui.c ".*(RGB565|GIF|Gif).*" -overwrite
grep -n -A12 "GdipDrawImageRectI();" $WORK/mui.c
grep -n "0x5100" $WORK/mui.c                     # PropertyTagFrameDelay, ×10 -> ms
```

- The packing loop reads BGRA input and writes `((R&0xF8)<<8) | ((G&0xFC)<<3) | (B>>3)`, low byte first: **RGB565 little-endian**.
- Frame delays are stored in ms. The driver writes `delay/2` into header byte `1+i`.
- The buffer is laid out as: header (`gif_headlength` = 256) → frames of 135 × 240 × 2 bytes → padding with `0xFF` to a multiple of 4096.

## 7. 2.4 GHz framing

Every wireless builder writes into `buf[1..]` and calls `FUN_0044f4d0`, which stores `sum(buf[0..])` in `buf[32]`. Comparing each wireless builder with its USB twin shows that the dongle carries the same payload, re-framed:

```
[cmd][len][seq][28 data bytes][checksum]     (32-byte output report, report ID 0)
```

Bulk blocks go out as 21 × 28-byte chunks (the last one has `len` 0x10). Keymap blocks use `seq` = chunk number.

## 8. Generate the web layout

```sh
cp $WORK/ex/app/skins/theme1/keyboard/img_keyboard_layout.png web/assets/keyboard.png
python3 - <<'EOF'
import xml.etree.ElementTree as ET, json, os
t = ET.parse(os.environ["WORK"] + "/ex/app/layouts/rgb-keyboard.xml")
keys = [dict(code=int(a["code"], 16), name=a["name"], idx=int(a["key_index"]), light=int(a["light_index"]),
             x=int(a["rect_left"]), y=int(a["rect_top"]), w=int(a["rect_width"]), h=int(a["rect_height"]),
             fnLock=a.get("fnlayer_disable") == "1") for a in (k.attrib for k in t.iter("key"))]
open("web/layout.js", "w").write("export const KEYS = [\n" + ",\n".join("  " + json.dumps(k, ensure_ascii=False) for k in keys) + "\n];\n")
EOF
```

## 9. Check the encoders offline

The web encoders in `web/protocol.js` are plain ES modules, so they can be checked in Node against the bytes worked out above:

```sh
node -e "import('./web/protocol.js').then(P => {
  console.log(P.hex(P.command(P.OP.LIGHT, {count: 1}).slice(0, 10)));   // 04 13 .. 01
  console.log(P.hex(P.lightPayload({mode: 1, r: 255}).slice(60)));      // .. aa 55
  console.log(P.hex(P.dongleShort(5, P.lightPayload({mode: 1}))));      // checksum in last byte
})"
```

With no device connected, the app runs in simulator mode and logs every packet on the Log tab. That trace can be diffed against a USBPcap/Wireshark capture of the Windows driver.

## Open questions

- None of this has been tested on hardware yet. The best confirmation is a USBPcap capture of the official driver doing the same action.
- Side light: the S75 Pro layout disables it (`sidelight="0"`), so the firmware may ignore it.
- The `04 f5` read-back path (`FUN_0044f280`) decompiles badly; the order of the reads is a best guess.
- Not ported: functions handled by the driver itself (run program, URL, send text; entries `05 02 id`), music mode (`04 20`), firmware update.
