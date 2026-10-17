import sys
import capstone
import pefile

usage = "peek.py <pe> wstr <va> [count] | u32 <va> [count] | dis <va> [len]"
if len(sys.argv) < 4:
    sys.exit(usage)

pe = pefile.PE(sys.argv[1])
base = pe.OPTIONAL_HEADER.ImageBase
mode, va = sys.argv[2], int(sys.argv[3], 16)
n = int(sys.argv[4], 0) if len(sys.argv) > 4 else 16

if mode == "wstr":
    for i in range(n):
        raw = pe.get_data(va - base, 64)
        s = raw.decode("utf-16le", "replace").split("\0")[0]
        print(hex(va), s)
        va += (len(s) + 1) * 2
        va += (4 - va % 4) % 4
elif mode == "u32":
    data = pe.get_data(va - base, n * 4)
    print([hex(int.from_bytes(data[i:i + 4], "little")) for i in range(0, len(data), 4)])
elif mode == "dis":
    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
    for ins in md.disasm(pe.get_data(va - base, n), va):
        print(hex(ins.address), ins.mnemonic, ins.op_str)
else:
    sys.exit(usage)
