"""Generate dependency-free PNG app icons. Run: python3 scripts/generate-icons.py."""
from pathlib import Path
import struct
import zlib


def chunk(name, data):
    return struct.pack('!I', len(data)) + name + data + struct.pack('!I', zlib.crc32(name + data))


def icon(size):
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            px, py = (x + .5) * 512 / size, (y + .5) * 512 / size
            notes = ((px - 190) / 46) ** 2 + ((py - 334) / 34) ** 2 <= 1 or ((px - 314) / 46) ** 2 + ((py - 306) / 34) ** 2 <= 1
            stems = (214 <= px <= 238 and 140 <= py <= 334) or (338 <= px <= 362 and 112 <= py <= 306)
            beam = 214 <= px <= 362 and 140 - (px - 214) * 28 / 148 <= py <= 174 - (px - 214) * 28 / 148
            rows.extend((201, 237, 155) if notes or stems or beam else (17, 22, 21))
    header = struct.pack('!2I5B', size, size, 8, 2, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b'')


if __name__ == '__main__':
    directory = Path(__file__).resolve().parent.parent / 'public' / 'icons'
    for size in (192, 512):
        (directory / f'icon-{size}.png').write_bytes(icon(size))
