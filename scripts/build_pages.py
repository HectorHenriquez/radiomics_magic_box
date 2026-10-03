"""Build the public, static Cloudflare Pages artifact without sample data."""

from pathlib import Path
import shutil


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "browser-spike"
OUTPUT = ROOT / "dist"

FILES = (
    "index.html",
    "main.mjs",
    "worker.mjs",
    "batch.mjs",
    "nrrd.mjs",
    "nifti.mjs",
    "preview.mjs",
    "filters.mjs",
    "logFilter.mjs",
    "meshShape.mjs",
    "meshTables.mjs",
    "texture.mjs",
    "glcm.mjs",
    "assets/learnradiomics-logo.png",
    "assets/course-background.jpg",
    "PYRADIOMICS_LICENSE.txt",
    "ITK_LICENSE.txt",
)


def main():
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    for name in FILES:
        source = SOURCE / name
        if not source.is_file():
            raise FileNotFoundError(source)
        target = OUTPUT / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    print(f"Cloudflare Pages: {len(FILES)} archivos en {OUTPUT}")


if __name__ == "__main__":
    main()
