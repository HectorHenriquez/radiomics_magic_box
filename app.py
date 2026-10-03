"""Local teaching UI for the configurable extraction baseline."""

from pathlib import Path
from datetime import datetime
import json

import pandas as pd
import streamlit as st

from extract_baseline import INTERPOLATORS, extract

st.set_page_config(page_title="Radiomics — extracción", layout="wide")
st.title("Extracción de características radiomicas")
st.caption("Prototipo local · PyRadiomics · imagen original sin filtros")

folder = Path(st.text_input("Carpeta de casos", "data_radiomics"))
images = sorted((folder / "images").glob("*_chest_ct_image.nrrd"))
ids = [p.name.removesuffix("_chest_ct_image.nrrd") for p in images]
st.write(f"Casos detectados: {len(ids)}")
selected = st.multiselect("Casos", ids, default=ids)

left, middle, right = st.columns(3)
with left:
    normalization = st.selectbox("Normalización", ("zscore", "minmax", "none"),
                                 format_func=lambda x: {"zscore": "Z-score (media 0, DE 1)", "minmax": "Mín–máx (0–1)", "none": "Ninguna"}[x])
    st.caption("Mín–máx usa el rango de toda la imagen. Z-score usa la normalización nativa de PyRadiomics.")
with middle:
    spacing = [st.number_input(f"Vóxel {axis} (mm)", min_value=0.01, value=1.0, step=0.1) for axis in "XYZ"]
with right:
    interpolator_name = st.selectbox("Interpolación de imagen", list(INTERPOLATORS), index=2)
    bin_width = st.number_input("Ancho de bin", min_value=0.000001,
                                value=0.05 if normalization == "minmax" else 75.0,
                                step=0.01 if normalization == "minmax" else 1.0,
                                key=f"bin_width_{normalization}")
    st.caption("El ancho de bin se aplica después de la normalización; su escala cambia según el método.")

if st.button("Extraer", type="primary", disabled=not selected):
    run_dir = Path("results") / datetime.now().strftime("run_%Y%m%d_%H%M%S_%f")
    bar = st.progress(0)
    status = st.empty()
    def update(i, n, case, state):
        bar.progress(i / n)
        status.write(f"{i}/{n} · {case}: {state}")
    rows, errors = extract(folder, run_dir, selected, normalization, spacing,
                           INTERPOLATORS[interpolator_name], bin_width, update)
    st.session_state["last_run"] = str(run_dir)
    st.success(f"{len(rows)} casos procesados; {len(errors)} errores")

if "last_run" in st.session_state:
    run_dir = Path(st.session_state["last_run"])
    features = run_dir / "features.csv"
    if features.exists():
        table = pd.read_csv(features)
        st.dataframe(table, use_container_width=True)
        st.download_button("Descargar CSV", features.read_bytes(), "features.csv", "text/csv")
        st.download_button("Descargar configuración", (run_dir / "manifest.json").read_bytes(), "manifest.json", "application/json")
        errors = json.loads((run_dir / "errors.json").read_text())
        if errors:
            st.error(errors)
