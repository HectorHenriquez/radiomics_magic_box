"""Run a reproducible PyRadiomics voxel-size × bin-width reference sweep."""

import argparse
import csv
import json
from datetime import datetime, timezone
from pathlib import Path

import radiomics
import SimpleITK as sitk
from radiomics import featureextractor

VOXEL_SIZES_MM = (1, 2, 3, 5)
BIN_WIDTHS = (25, 50, 75, 100)
FEATURE_CLASSES = {name: [] for name in ("shape", "firstorder", "glcm", "glrlm", "glszm", "gldm", "ngtdm")}
KEY_METRICS = (
    "original_shape_VoxelVolume", "original_firstorder_Entropy",
    "original_glcm_Contrast", "original_glcm_JointEntropy",
    "original_glrlm_RunEntropy", "original_glszm_ZoneEntropy",
    "original_gldm_DependenceEntropy", "original_ngtdm_Coarseness",
)


def run(data: Path, out: Path):
    out.mkdir(parents=True, exist_ok=True)
    ids = sorted(p.name.removesuffix("_chest_ct_image.nrrd") for p in (data / "images").glob("*_chest_ct_image.nrrd"))
    rows = []
    extractors = {}
    for voxel in VOXEL_SIZES_MM:
        for width in BIN_WIDTHS:
            settings = {"normalize": False, "binWidth": width,
                        "resampledPixelSpacing": [voxel] * 3,
                        "interpolator": "sitkLinear", "label": 1}
            extractors[voxel, width] = featureextractor.RadiomicsFeatureExtractor({
                "imageType": {"Original": {}}, "setting": settings,
                "featureClass": FEATURE_CLASSES,
            })
    for case in ids:
        image_path = data / "images" / f"{case}_chest_ct_image.nrrd"
        mask_path = data / "masks" / f"{case}_chest_ct_segmentation.nrrd"
        try:
            image = sitk.ReadImage(str(image_path))
            mask = sitk.ReadImage(str(mask_path))
            if (image.GetSize(), image.GetSpacing(), image.GetOrigin(), image.GetDirection()) != (mask.GetSize(), mask.GetSpacing(), mask.GetOrigin(), mask.GetDirection()):
                raise ValueError("Image and mask geometry differ")
        except Exception as exc:
            for voxel in VOXEL_SIZES_MM:
                for width in BIN_WIDTHS:
                    rows.append({"Case ID": case, "voxel_mm": voxel, "binWidth": width,
                                 "status": "error", "error": str(exc)})
            continue
        for voxel in VOXEL_SIZES_MM:
            for width in BIN_WIDTHS:
                row = {"Case ID": case, "voxel_mm": voxel, "binWidth": width,
                       "status": "ok", "error": ""}
                try:
                    result = extractors[voxel, width].execute(image, mask)
                    row.update({key: float(value) for key, value in result.items() if key.startswith("original_")})
                    row["roi_voxels"] = int(round(row["original_shape_VoxelVolume"] / voxel**3))
                except Exception as exc:
                    row["status"], row["error"] = "error", str(exc)
                rows.append(row)
                print(f"{len(rows)}/{len(ids)*16} {case} voxel={voxel} mm binWidth={width}: {row['status']}", flush=True)
    feature_columns = sorted({key for row in rows for key in row if key.startswith("original_")})
    columns = ["Case ID", "voxel_mm", "binWidth", "status", "error", "roi_voxels"] + feature_columns
    with (out / "features.csv").open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
    with (out / "key_metrics.csv").open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=columns[:6] + list(KEY_METRICS))
        writer.writeheader()
        writer.writerows([{key: row.get(key, "") for key in writer.fieldnames} for row in rows])
    errors = [{key: row[key] for key in columns[:5]} for row in rows if row["status"] == "error"]
    (out / "errors.json").write_text(json.dumps(errors, indent=2))
    (out / "manifest.json").write_text(json.dumps({
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "engine": "PyRadiomics", "engine_version": radiomics.__version__,
        "SimpleITK_version": sitk.Version_VersionString(),
        "cases": ids, "voxel_sizes_mm": VOXEL_SIZES_MM, "bin_widths": BIN_WIDTHS,
        "fixed_parameters": {"imageType": {"Original": {}}, "normalize": False,
                             "interpolator": "sitkLinear", "mask_interpolator": "sitkNearestNeighbor",
                             "label": 1, "featureClass": FEATURE_CLASSES},
        "runs": len(rows), "successful_runs": len(rows)-len(errors), "feature_count": len(feature_columns),
    }, indent=2))
    return rows


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=Path("data_radiomics"))
    parser.add_argument("--out", type=Path, default=Path("results/parameter_sweep"))
    args = parser.parse_args()
    run(args.data, args.out)
