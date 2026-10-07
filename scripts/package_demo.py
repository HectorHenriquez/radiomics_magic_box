"""Package the five geometry-checked cases for private R2 upload."""

from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data_radiomics"
OUTPUT = DATA / "data_radiomics_demo.zip"
PART_SIZE = 250_000_000


def fields(path):
    with path.open("rb") as source:
        header = bytearray()
        while not header.endswith(b"\n\n"):
            byte = source.read(1)
            if not byte or len(header) > 16384:
                raise ValueError(path)
            header.extend(byte)
    return dict(line.split(": ", 1) for line in header.decode("ascii").splitlines()
                if ": " in line and not line.startswith("#"))


def main():
    masks = sorted((DATA / "masks").glob("*.nrrd"))
    if len(masks) != 5:
        raise ValueError(f"Se esperaban 5 máscaras; hay {len(masks)}")
    files = []
    for mask in masks:
        image = DATA / "images" / mask.name.replace("segmentation", "image")
        mf, imf = fields(mask), fields(image)
        if mf.get("type") != "unsigned char" or any(mf.get(key) != imf.get(key)
            for key in ("dimension", "space", "sizes", "space directions", "space origin")):
            raise ValueError(f"Máscara inválida: {mask.name}")
        files.extend((image, mask))
    with zipfile.ZipFile(OUTPUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6,
                         allowZip64=True) as archive:
        for path in files:
            archive.write(path, Path("data_radiomics") / path.relative_to(DATA))
            print(path.name, flush=True)
    with zipfile.ZipFile(OUTPUT) as archive:
        bad = archive.testzip()
        if bad:
            raise ValueError(f"ZIP corrupto: {bad}")
        if len(archive.namelist()) != 10:
            raise ValueError("El ZIP no tiene exactamente 10 volúmenes")
    with OUTPUT.open("rb") as source:
        for number in (1, 2):
            part = OUTPUT.with_name(f"{OUTPUT.name}.part{number}")
            with part.open("wb") as target:
                remaining = PART_SIZE if number == 1 else OUTPUT.stat().st_size
                while remaining > 0:
                    block = source.read(min(8_000_000, remaining))
                    if not block:
                        break
                    target.write(block)
                    remaining -= len(block)
    if sum(OUTPUT.with_name(f"{OUTPUT.name}.part{n}").stat().st_size for n in (1, 2)) != OUTPUT.stat().st_size:
        raise ValueError("Las partes del ZIP no coinciden con el original")
    print(f"Paquete verificado: {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
