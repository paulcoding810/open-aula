"""Build web/models/f75.layout.js from the BYCOMBO4 KB.ini [KEY] section."""
import json
import re
import sys

VK_TO_HID = {
    0x08: 0x2A, 0x09: 0x2B, 0x0D: 0x28, 0x13: 0x48, 0x14: 0x39, 0x1B: 0x29, 0x20: 0x2C,
    0x21: 0x4B, 0x22: 0x4E, 0x23: 0x4D, 0x24: 0x4A, 0x25: 0x50, 0x26: 0x52, 0x27: 0x4F, 0x28: 0x51,
    0x2C: 0x46, 0x2D: 0x49, 0x2E: 0x4C, 0x5B: 0xE3, 0x5C: 0xE7, 0x5D: 0x65, 0x91: 0x47,
    0xA0: 0xE1, 0xA1: 0xE5, 0xA2: 0xE0, 0xA3: 0xE4, 0xA4: 0xE2, 0xA5: 0xE6,
    0xBA: 0x33, 0xBB: 0x2E, 0xBC: 0x36, 0xBD: 0x2D, 0xBE: 0x37, 0xBF: 0x38, 0xC0: 0x35,
    0xDB: 0x2F, 0xDC: 0x31, 0xDD: 0x30, 0xDE: 0x34,
}
VK_TO_HID.update({0x41 + i: 0x04 + i for i in range(26)})
VK_TO_HID.update({0x31 + i: 0x1E + i for i in range(9)})
VK_TO_HID[0x30] = 0x27
VK_TO_HID.update({0x70 + i: 0x3A + i for i in range(12)})

src, dst = sys.argv[1], sys.argv[2]
lines = open(src, encoding="utf-8", errors="replace").read().replace("\r", "").split("\n")
keys, extra, name, in_key = [], [], None, False
for line in lines:
    if line.startswith("["):
        in_key = line.strip() == "[KEY]"
        if not in_key and keys:
            break
        continue
    if not in_key:
        continue
    if line.startswith(";"):
        name = line[1:].strip()
        continue
    raw = re.match(r"K(\d+)=\s*0,\s*0,\s*0,\s*0,\s*0x09,\s*0x01,\s*(0x[0-9a-fA-F]+),\s*(\d+)", line)
    if raw:
        v = int(raw.group(2), 16)
        extra.append(dict(idx=int(raw.group(3)), name=name, def_=[v >> 24, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF]))
        continue
    m = re.match(r"K(\d+)=\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(0x[0-9a-fA-F]+),\s*(0x[0-9a-fA-F]+),\s*\S+?,\s*(\d+)", line)
    if not m:
        continue
    l, t, r, b = map(int, m.group(2, 3, 4, 5))
    kind, vk, idx = int(m.group(6), 16), int(m.group(7), 16), int(m.group(8))
    if r <= l:
        continue
    hid = VK_TO_HID.get(vk, 0) if kind == 2 else 0
    default = [0x0D, 0, 0, 0] if vk == 0xFA else [0x0D, 1, 0, 0] if vk == 0xFB else [0, 0, hid, 0]
    keys.append(dict(code=idx, hid=hid, name=name or f"K{m.group(1)}", idx=idx, light=idx,
                     x=l, y=t, w=r - l, h=b - t, def_=default))
with open(dst, "w") as f:
    dump = lambda xs: ",\n".join("  " + json.dumps(k, ensure_ascii=False).replace('"def_"', '"def"') for k in xs)
    f.write("export const KEYS = [\n" + dump(keys) + "\n];\n\nexport const EXTRA_DEFAULTS = [\n" + dump(extra) + "\n];\n")
print(len(keys), "keys;", "no HID:", [k["name"] for k in keys if not k["hid"]], "extra:", extra)
