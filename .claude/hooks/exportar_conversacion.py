# Exporta la conversación a docs/<yyyy-mm-dd>_conversacion_completa.md.
# Se ejecuta en los hooks Stop, UserPromptSubmit y SessionEnd: Stop puede dispararse
# antes de que el transcript tenga la respuesta final, y no se dispara si el turno
# se interrumpe; UserPromptSubmit recoge el turno anterior completo al empezar el siguiente.
# Nunca debe romper el turno: cualquier error se escribe en stderr y se sale con 0.
import json, sys, glob, os, traceback
from pathlib import Path
from datetime import datetime


def texto_de(contenido):
    if isinstance(contenido, str):
        return contenido, False
    partes, solo_tool_result = [], True
    for b in contenido:
        t = b.get("type")
        if t == "text":
            partes.append(b["text"]); solo_tool_result = False
        elif t == "tool_use":
            partes.append(f"> 🔧 **{b['name']}**: `{json.dumps(b.get('input'), ensure_ascii=False)[:300]}`")
            solo_tool_result = False
        elif t != "tool_result":
            solo_tool_result = False
    return "\n\n".join(partes), solo_tool_result


def exportar():
    datos = json.load(sys.stdin)
    carpeta = Path(datos["transcript_path"]).expanduser().parent
    proyecto = Path(os.environ.get("CLAUDE_PROJECT_DIR", datos.get("cwd", ".")))
    destino = proyecto / "docs"
    destino.mkdir(parents=True, exist_ok=True)

    ficheros = sorted(glob.glob(str(carpeta / "*.jsonl")), key=os.path.getmtime)
    # Sesiones anteriores a esta fueron pruebas: se exporta desde aquí en adelante
    INICIO = "53ca36f2-fbcd-447d-9cbd-64facc1bcebe"
    nombres = [Path(f).stem for f in ficheros]
    if INICIO in nombres:
        ficheros = ficheros[nombres.index(INICIO):]

    # Un archivo por día de trabajo (hora local): docs/yyyy-mm-dd_conversacion_completa.md
    dias = {}  # dia -> {sesion -> [bloques]}
    for f in ficheros:
        sesion = Path(f).stem
        with open(f, encoding="utf-8") as fh:
            for raw in fh:
                try:
                    e = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if e.get("type") not in ("user", "assistant") or e.get("isMeta"):
                    continue
                texto, es_tool = texto_de(e.get("message", {}).get("content", ""))
                if not texto.strip() or (e["type"] == "user" and es_tool):
                    continue
                try:
                    momento = datetime.fromisoformat(e["timestamp"]).astimezone()
                except (KeyError, ValueError):
                    continue
                quien = "🧑 **Juan Miguel**" if e["type"] == "user" else "🤖 **Claude**"
                dia = f"{momento:%Y-%m-%d}"
                dias.setdefault(dia, {}).setdefault(sesion, []).append(
                    f"\n### {quien} · {momento:%Y-%m-%d %H:%M:%S}\n\n{texto}\n")

    ahora = f"{datetime.now():%Y-%m-%d %H:%M}"
    for dia, sesiones in dias.items():
        lineas = [f"# Registro de conversación con Claude Code · {dia}\n\n_Actualizado: {ahora}_\n"]
        for sesion, bloques in sesiones.items():
            lineas.append(f"\n---\n\n## Sesión `{sesion}`\n")
            lineas.extend(bloques)
        (destino / f"{dia}_conversacion_completa.md").write_text("\n".join(lineas), encoding="utf-8")


try:
    exportar()
except Exception:
    traceback.print_exc(file=sys.stderr)
sys.exit(0)
