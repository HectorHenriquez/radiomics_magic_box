"""Configurable, unfiltered PyRadiomics extraction from paired NRRDs."""

import argparse
import csv
import json
from pathlib import Path

import radiomics
import SimpleITK as sitk
from radiomics import featureextractor

FEATURE_CLASSES = {name: [] for name in ("shape", "firstorder", "glcm", "glrlm", "glszm", "gldm", "ngtdm")}
INTERPOLATORS = {"Nearest neighbor": "sitkNearestNeighbor", "Linear": "sitkLinear", "B-spline": "sitkBSpline"}


def normalize_image(image, method):
    """Scale the full image before PyRadiomics; z-score uses its native setting."""
    if method != "minmax":
        return image
    stats = sitk.MinimumMaximumImageFilter()
    stats.Execute(image)
    low, high = stats.GetMinimum(), stats.GetMaximum()
    if low == high:
        raise ValueError("Cannot apply 0–1 normalization to a constant image")
    return sitk.ShiftScale(sitk.Cast(image, sitk.sitkFloat32), shift=-float(low), scale=1.0 / (high - low))


def extract(data, out, cases=None, normalization="zscore", spacing=(1.0, 1.0, 1.0), interpolator="sitkBSpline", bin_width=75.0, progress=None):
    data, out = Path(data), Path(out)
    if normalization not in ("none", "zscore", "minmax"):
        raise ValueError("Invalid normalization")
    if interpolator not in INTERPOLATORS.values():
        raise ValueError("Invalid interpolator")
    if len(spacing) != 3 or any(float(x) <= 0 for x in spacing) or bin_width <= 0:
        raise ValueError("Voxel spacing and bin width must be positive")
    params = {
        "imageType": {"Original": {}},
        "setting": {"normalize": normalization == "zscore", "binWidth": float(bin_width),
                    "resampledPixelSpacing": list(map(float, spacing)), "interpolator": interpolator, "label": 1},
        "featureClass": FEATURE_CLASSES,
    }
    ids = list(cases) if cases is not None else sorted(p.name.removesuffix("_chest_ct_image.nrrd") for p in (data / "images").glob("*_chest_ct_image.nrrd"))
    out.mkdir(parents=True, exist_ok=True)
    extractor = featureextractor.RadiomicsFeatureExtractor(params)
    rows, errors = [], []
    for index, case_id in enumerate(ids, 1):
        image_path = data / "images" / f"{case_id}_chest_ct_image.nrrd"
        mask_path = data / "masks" / f"{case_id}_chest_ct_segmentation.nrrd"
        try:
            if not image_path.is_file() or not mask_path.is_file():
                raise FileNotFoundError("Missing image or mask")
            image, mask = sitk.ReadImage(str(image_path)), sitk.ReadImage(str(mask_path))
            if (image.GetSize(), image.GetSpacing(), image.GetOrigin(), image.GetDirection()) != (mask.GetSize(), mask.GetSpacing(), mask.GetOrigin(), mask.GetDirection()):
                raise ValueError("Image and mask geometry differ")
            stats = sitk.LabelShapeStatisticsImageFilter()
            stats.Execute(mask)
            if not stats.HasLabel(1):
                raise ValueError("Label 1 is absent")
            image = normalize_image(image, normalization)
            result = extractor.execute(image, mask)
            row = {"Case ID": case_id}
            row.update({key: float(value) for key, value in result.items() if key.startswith("original_")})
            rows.append(row)
            status = "ok"
        except Exception as exc:
            errors.append({"Case ID": case_id, "error": str(exc)})
            status = f"error: {exc}"
        if progress:
            progress(index, len(ids), case_id, status)
    columns = ["Case ID"] + sorted({key for row in rows for key in row if key != "Case ID"})
    with (out / "features.csv").open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
    (out / "errors.json").write_text(json.dumps(errors, indent=2))
    manifest = {"engine": "PyRadiomics", "version": radiomics.__version__,
                "SimpleITK": sitk.Version_VersionString(), "normalization": normalization,
                "normalization_scope": "full image before extraction" if normalization == "minmax" else "PyRadiomics native" if normalization == "zscore" else "none",
                "parameters": params, "cases_requested": ids,
                "cases_succeeded": [row["Case ID"] for row in rows]}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return rows, errors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=Path("data_radiomics"))
    parser.add_argument("--out", type=Path, default=Path("results/baseline"))
    parser.add_argument("--cases", nargs="*")
    parser.add_argument("--normalization", choices=("none", "zscore", "minmax"), default="zscore")
    parser.add_argument("--spacing", type=float, nargs=3, default=(1, 1, 1), metavar=("X", "Y", "Z"))
    parser.add_argument("--interpolator", choices=tuple(INTERPOLATORS.values()), default="sitkBSpline")
    parser.add_argument("--bin-width", type=float, default=75)
    args = parser.parse_args()
    rows, errors = extract(args.data, args.out, args.cases, args.normalization, args.spacing,
                           args.interpolator, args.bin_width,
                           progress=lambda i, n, case, status: print(f"{i}/{n} {case}: {status}", flush=True))
    print(f"Done: {len(rows)} cases, {len(errors)} errors")


if __name__ == "__main__":
    main()
