"""Convert binary NRRD masks to uint8, preserving their spatial header."""

from pathlib import Path
import os
import numpy as np

ROOT = Path(__file__).resolve().parents[1] / "data_radiomics"
GEOMETRY = ("dimension", "space", "sizes", "space directions", "space origin")


def header(path):
    with path.open("rb") as source:
        raw = bytearray()
        while not raw.endswith(b"\n\n"):
            byte = source.read(1)
            if not byte or len(raw) > 16384:
                raise ValueError(f"Encabezado NRRD inválido: {path}")
            raw.extend(byte)
    fields = dict(line.split(": ", 1) for line in raw.decode("ascii").splitlines()
                  if ": " in line and not line.startswith("#"))
    return bytes(raw), fields


def main():
    for mask in sorted((ROOT / "masks").glob("*.nrrd")):
        image = ROOT / "images" / mask.name.replace("segmentation", "image")
        raw, fields = header(mask)
        _, image_fields = header(image)
        if not image.is_file() or any(fields.get(key) != image_fields.get(key) for key in GEOMETRY):
            raise ValueError(f"Geometría incompatible: {mask.name}")
        if fields.get("encoding") != "raw" or fields.get("type") not in ("unsigned short", "unsigned char"):
            raise ValueError(f"Formato de máscara inesperado: {mask.name}")
        count = np.prod([int(n) for n in fields["sizes"].split()])
        dtype = "<u2" if fields["type"] == "unsigned short" else "u1"
        if mask.stat().st_size - len(raw) != count * np.dtype(dtype).itemsize:
            raise ValueError(f"Tamaño de datos incorrecto: {mask.name}")
        values = np.memmap(mask, dtype=dtype, mode="r", offset=len(raw), shape=(count,))
        positives = 0
        for start in range(0, count, 4_000_000):
            block = values[start:start + 4_000_000]
            if np.any((block != 0) & (block != 1)):
                raise ValueError(f"Máscara no binaria: {mask.name}")
            positives += int(np.count_nonzero(block))
        if not positives:
            raise ValueError(f"Máscara vacía: {mask.name}")
        if dtype == "u1":
            print(f"{mask.name}: ya es uint8; {positives} vóxeles positivos")
            continue
        output = mask.with_suffix(".nrrd.tmp")
        try:
            with output.open("wb") as target:
                target.write(raw.replace(b"type: unsigned short", b"type: unsigned char", 1))
                for start in range(0, count, 4_000_000):
                    target.write(values[start:start + 4_000_000].astype(np.uint8).tobytes())
            del values
            os.replace(output, mask)
        finally:
            output.unlink(missing_ok=True)
        _, converted = header(mask)
        if any(converted.get(key) != image_fields.get(key) for key in GEOMETRY):
            raise ValueError(f"Geometría alterada: {mask.name}")
        print(f"{mask.name}: uint8; {positives} vóxeles positivos")


if __name__ == "__main__":
    main()
