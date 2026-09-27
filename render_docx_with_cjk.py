import importlib.util
import shutil
from pathlib import Path


RENDERER = Path("/Users/tangyichuan/.codex/plugins/cache/openai-primary-runtime/documents/26.904.11930/skills/documents/render_docx.py")
FONT_SOURCES = [
    Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
    Path("/System/Library/Fonts/STHeiti Light.ttc"),
]

spec = importlib.util.spec_from_file_location("codex_render_docx", RENDERER)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

original_build_env = module._build_lo_env


def build_env_with_cjk(user_profile):
    font_dir = Path(user_profile) / "Library" / "Fonts"
    font_dir.mkdir(parents=True, exist_ok=True)
    for source in FONT_SOURCES:
        shutil.copyfile(source, font_dir / source.name)
    cache_dir = Path(user_profile) / "fontconfig-cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    config = Path(user_profile) / "fonts.conf"
    config.write_text(
        "<?xml version='1.0'?>\n"
        "<!DOCTYPE fontconfig SYSTEM 'fonts.dtd'>\n"
        "<fontconfig>\n"
        f"  <dir>{font_dir}</dir>\n"
        "  <dir>/System/Library/Fonts</dir>\n"
        "  <dir>/System/Library/Fonts/Supplemental</dir>\n"
        "  <dir>/Library/Fonts</dir>\n"
        f"  <cachedir>{cache_dir}</cachedir>\n"
        "</fontconfig>\n",
        encoding="utf-8",
    )
    env = original_build_env(user_profile)
    env["FONTCONFIG_FILE"] = str(config)
    env["FONTCONFIG_PATH"] = str(Path(user_profile))
    return env


module._build_lo_env = build_env_with_cjk
module.main()
