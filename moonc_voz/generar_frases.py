"""Pre-genera frases fijas (alertas, guías de maniobras) a WAV/MP3 para reproducirlas sin servidor.
    python generar_frases.py                         # usa frases/frases.json y config.json
    python generar_frases.py --frases mis.json --salida audio/ --mp3
"""
import argparse, json, shutil, subprocess
from pathlib import Path
from moonc_voz import VozMoonC, AjustesVoz, CONFIG, RAIZ

ap = argparse.ArgumentParser()
ap.add_argument("--frases", default=str(RAIZ / "frases" / "frases.json"))
ap.add_argument("--salida", default=str(RAIZ / "frases" / "audio"))
ap.add_argument("--config", default=str(CONFIG))
ap.add_argument("--mp3", action="store_true", help="convierte a MP3 64 kbps (requiere ffmpeg)")
a = ap.parse_args()

voz = VozMoonC(ajustes=AjustesVoz.cargar(a.config))
out = Path(a.salida); out.mkdir(parents=True, exist_ok=True)
indice = {}
for clave, texto in json.loads(Path(a.frases).read_text("utf-8")).items():
    w = voz.guardar(texto, out / f"{clave}.wav"); f = w
    if a.mp3 and shutil.which("ffmpeg"):
        f = w.with_suffix(".mp3")
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(w), "-ac", "1", "-b:a", "64k", str(f)], check=True)
        w.unlink()
    indice[clave] = {"archivo": f.name, "texto": texto}
    print("✓", clave)
(out / "indice.json").write_text(json.dumps(indice, ensure_ascii=False, indent=2), "utf-8")
