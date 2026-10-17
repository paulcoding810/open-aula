"""Build web/models/f87pro.layout.js from the vendor's TKL key rows (work/f87/fighting87.rows.json)."""
import json
import sys

U = 40
ROWS = [
    (0, [(0, 1), (2, 1), (3, 1), (4, 1), (5, 1), (6.5, 1), (7.5, 1), (8.5, 1), (9.5, 1),
         (11, 1), (12, 1), (13, 1), (14, 1), (15.25, 1), (16.25, 1), (17.25, 1)]),
    (1.25, [(i, 1) for i in range(13)] + [(13, 2), (15.25, 1), (16.25, 1), (17.25, 1)]),
    (2.25, [(0, 1.5)] + [(1.5 + i, 1) for i in range(12)] + [(13.5, 1.5), (15.25, 1), (16.25, 1), (17.25, 1)]),
    (3.25, [(0, 1.75)] + [(1.75 + i, 1) for i in range(11)] + [(12.75, 2.25)]),
    (4.25, [(0, 2.25)] + [(2.25 + i, 1) for i in range(10)] + [(12.25, 2.75), (16.25, 1)]),
    (5.25, [(0, 1.25), (1.25, 1.25), (2.5, 1.25), (3.75, 6.25), (10, 1.25), (11.25, 1.25),
            (12.5, 1.25), (13.75, 1.25), (15.25, 1), (16.25, 1), (17.25, 1)]),
]
NAMES = {"None": "]", "Super": "Menu", "Spacebar": "Space", "Print": "PrtSc", "Scroll": "ScrLk"}

src, dst = sys.argv[1], sys.argv[2]
rows = json.load(open(src))
keys = []
for (y, slots), row in zip(ROWS, rows):
    assert len(slots) == len(row), (y, len(slots), len(row))
    for (x, w), k in zip(slots, row):
        name = k["name"].strip().replace("\\\\", "\\")
        parts = name.split()
        name = NAMES.get(name, parts[-1] if parts[0] == "ˉ" else parts[0] if len(parts) == 2 and len(parts[0]) == 1 else name)
        idx = int(k["value"])
        keys.append(dict(code=idx, hid=int(k["key"]), name=name, idx=idx, light=idx,
                         x=round(x * U + 2), y=round(y * U + 2), w=round(w * U - 4), h=U - 4))
with open(dst, "w") as f:
    f.write("export const KEYS = [\n" + ",\n".join("  " + json.dumps(k, ensure_ascii=False) for k in keys) + "\n];\n")
print(len(keys), "keys")
