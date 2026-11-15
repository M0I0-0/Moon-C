"""Pre-genera frases fijas (alertas, guías de maniobras) a WAV/MP3 para reproducirlas sin servidor.
    python generar_frases.py                         # usa frases/frases.json y config.json
    python generar_frases.py --frases mis.json --salida audio/ --mp3
"""
import argparse, json, shutil, subprocess
from pathlib import Path
from moonc_voz import VozMoonC, AjustesVoz, CONFIG, RAIZ

# AI disclosure (NASA Space Apps rules, see AI_DISCLOSURE.md): every generated file says it is AI-synthesized
# speech, in its metadata (WAV LIST/INFO comment, MP3 ID3 tags) and in indice.json.
NOTA_IA = "AI-generated audio: Piper neural text-to-speech (es_MX-claude-high) + Praat. Moon-C's voice."
ARTISTA = "Moon-C (voz sintetizada con IA / AI-synthesized voice)"


def wav_con_nota_ia(ruta: Path) -> None:
    """Append a RIFF LIST/INFO comment (ICMT) saying the WAV is AI-generated."""
    datos = ruta.read_bytes()
    texto = NOTA_IA.encode("ascii") + b"\x00"
    texto += b"\x00" * (len(texto) % 2)
    info = b"INFO" + b"ICMT" + len(texto).to_bytes(4, "little") + texto
    datos += b"\x00" * (len(datos) % 2) + b"LIST" + len(info).to_bytes(4, "little") + info
    ruta.write_bytes(datos[:4] + (len(datos) - 8).to_bytes(4, "little") + datos[8:])



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
    wav_con_nota_ia(w)
    if a.mp3 and shutil.which("ffmpeg"):
        f = w.with_suffix(".mp3")
        etiquetas = ["-id3v2_version", "3", "-metadata", f"title={texto}", "-metadata", f"artist={ARTISTA}",
                     "-metadata", f"comment={NOTA_IA}", "-metadata", "AI_GENERATED=true"]
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(w), "-ac", "1", "-b:a", "64k", *etiquetas, str(f)],
                       check=True)
        w.unlink()
    indice[clave] = {"archivo": f.name, "texto": texto, "ia": NOTA_IA}
    print("✓", clave)
(out / "indice.json").write_text(json.dumps(indice, ensure_ascii=False, indent=2), "utf-8")
