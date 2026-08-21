#!/usr/bin/env python3
"""
Subsets the self-hosted icon fonts down to the glyphs the site actually uses.

Why: the three Font Awesome faces plus Material Icons shipped 428KB of woff2
to render 114 distinct glyphs — Material Icons alone carries ~2,200 icons and
Font Awesome Solid ~1,400, of which this site uses 78 and 36. On a simulated
mobile connection that was ~2.3s of pure download, the single largest item on
the homepage's critical path and far bigger than the whole JS bundle.

Two different subsetting strategies, because the two fonts address glyphs
differently:

  * Font Awesome addresses icons by PUA codepoint, injected via CSS
    `content: "\\f09b"`. Straightforward: map the `fa-*` classes the source
    tree uses back to codepoints via all.min.css, then subset by unicode.

  * Material Icons addresses icons by *ligature* — `<mat-icon>add</mat-icon>`
    renders because the font substitutes the glyph sequence a,d,d. Subsetting
    that by `--text` does almost nothing (128KB -> 114KB, measured): every
    icon name is spelled with the same 26 letters, so fontTools' layout
    closure keeps essentially every ligature. The fix is to resolve each name
    to its target glyph through the GSUB ligature table, subset by *glyph*,
    and disable layout closure so the other ~2,150 ligatures are dropped
    while the ones we keep still work — leaving templates untouched.

Originals are preserved next to the subsets as `<name>.full.woff2` so this is
reversible; the subset keeps the original filename so no CSS has to change.

Usage (fontTools is a build-time-only dependency, deliberately not in
package.json — icon sets change rarely, and the subset output is committed):

    python3 -m venv /tmp/fontenv
    /tmp/fontenv/bin/pip install "fonttools[woff]" brotli
    /tmp/fontenv/bin/python scripts/subset-icon-fonts.py

Re-run after adding icons to the templates, otherwise a newly used icon
renders as a blank box. The script reads the used names straight from the
source tree, so it always reflects current usage.
"""
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "frontend/src"
FONTS = ROOT / "frontend/public/assets/fonts"
ORIGINALS = ROOT / "tools/icon-fonts-original"
FA_CSS = FONTS / "fontawesome/css/all.min.css"
MATERIAL = FONTS / "material-icons/material-icons.woff2"
FA_FACES = [
    FONTS / "fontawesome/webfonts/fa-solid-900.woff2",
    FONTS / "fontawesome/webfonts/fa-brands-400.woff2",
    FONTS / "fontawesome/webfonts/fa-regular-400.woff2",
]

try:
    from fontTools.ttLib import TTFont
except ImportError:
    sys.exit(
        "fontTools non trovato. Vedi le istruzioni nell'intestazione di questo file."
    )


def source_files():
    for ext in ("*.html", "*.ts"):
        yield from SRC.rglob(ext)


def literal_material_names() -> set[str]:
    """Icon names written out as <mat-icon>name</mat-icon> in a template.

    Covers both the plain case (`<mat-icon>menu</mat-icon>`) and a conditional
    written inline (`<mat-icon>{{ cond ? 'a' : 'b' }}</mat-icon>`, e.g. the
    theme toggle's dark_mode/light_mode swap) — the block regex first isolates
    each <mat-icon>...</mat-icon>, then pulls out either the bare word or any
    quoted identifiers inside it. A previous version only matched the bare-word
    case, so every icon only ever reached via a ternary silently disappeared
    from the subset (button still worked, glyph just didn't exist to render).
    """
    block_pattern = re.compile(r"<mat-icon[^>]*>(.*?)</mat-icon>", re.DOTALL)
    bare_pattern = re.compile(r"^[a-z0-9_]+$")
    quoted_pattern = re.compile(r"""['"]([a-z0-9_]+)['"]""")
    names = set()
    for path in source_files():
        text = path.read_text(encoding="utf-8", errors="ignore")
        for block in block_pattern.findall(text):
            stripped = block.strip()
            if bare_pattern.match(stripped):
                names.add(stripped)
            else:
                names.update(quoted_pattern.findall(block))
    return names


def literal_fa_classes() -> set[str]:
    pattern = re.compile(r"\bfa-[a-z0-9-]+")
    classes = set()
    for path in source_files():
        classes.update(pattern.findall(path.read_text(encoding="utf-8", errors="ignore")))
    return classes


def data_icon_names() -> set[str]:
    """Icon names held in TypeScript data rather than written in a template.

    The home page renders its service cards, tech grid and project tiles from
    arrays of objects — `{ key: 'uiux', icon: 'design_services' }` — and binds
    them with `<mat-icon>{{ svc.icon }}</mat-icon>` or
    `[class]="'fas fa-' + tech.icon"`. None of that is visible to the two
    literal scans above, so an earlier version of this script happily subset
    away `design_services`, `speed`, `api` and every project tile glyph, and
    they rendered as blank boxes.

    These names are unclassified: `speed` is a Material ligature, `chart-pie`
    is a Font Awesome class. The caller resolves each against both fonts and
    keeps it wherever it actually exists.
    """
    pattern = re.compile(r"""\bicon\s*:\s*['"]([a-z0-9_-]+)['"]""")
    names = set()
    for path in source_files():
        names.update(pattern.findall(path.read_text(encoding="utf-8", errors="ignore")))
    return names


def fa_class_to_codepoint() -> dict[str, int]:
    """Parse `.fa-x:before,.fa-y:before{content:"\\f09b"}` rules from all.min.css."""
    css = FA_CSS.read_text(encoding="utf-8")
    mapping = {}
    for selectors, code in re.findall(
        r'((?:\.fa-[a-z0-9-]+:before,?)+)\{content:"\\([0-9a-fA-F]+)"\}', css
    ):
        cp = int(code, 16)
        for cls in re.findall(r"\.(fa-[a-z0-9-]+):before", selectors):
            mapping[cls] = cp
    return mapping


def material_name_to_glyph(font: TTFont) -> dict[str, str]:
    """Walk the GSUB ligature table to recover `icon name -> target glyph`."""
    cmap = font.getBestCmap()
    glyph_to_char = {g: chr(cp) for cp, g in cmap.items() if cp < 128}
    mapping = {}
    for lookup in font["GSUB"].table.LookupList.Lookup:
        for sub in lookup.SubTable:
            if sub.__class__.__name__ != "LigatureSubst":
                continue
            for first, ligatures in sub.ligatures.items():
                for lig in ligatures:
                    parts = [first] + list(lig.Component)
                    name = "".join(glyph_to_char.get(p, "") for p in parts)
                    if name:
                        mapping[name] = lig.LigGlyph
    return mapping


def backup(path: Path) -> None:
    """Keep a pristine copy so re-running against an already-subset font is
    recoverable. Deliberately outside frontend/public — Angular copies that
    directory wholesale, and the originals would ride along into every
    deploy as 428KB of files nothing ever requests."""
    ORIGINALS.mkdir(parents=True, exist_ok=True)
    full = ORIGINALS / path.name
    if not full.exists():
        shutil.copy2(path, full)


def run_subset(src: Path, args: list[str]) -> None:
    # Always subset from the pristine copy when one exists, never from an
    # already-subset file — otherwise re-running after adding an icon would
    # subset the subset, and the new glyph could never come back.
    backup(src)
    source = ORIGINALS / src.name
    before = source.stat().st_size

    out = src.parent / (src.stem + ".subset.woff2")
    cmd = [
        sys.executable, "-m", "fontTools.subset", str(source),
        f"--output-file={out}", "--flavor=woff2",
    ] + args
    subprocess.run(cmd, check=True, capture_output=True)
    shutil.move(out, src)
    after = src.stat().st_size
    print(
        f"  {src.name:<28} {before:>7} -> {after:>6} byte "
        f"({100 * (after - before) / before:+.1f}%)"
    )


def main() -> None:
    # Names bound from TS data could belong to either font; resolve each
    # against both and keep it wherever it exists.
    from_data = data_icon_names()

    # ── Material Icons ────────────────────────────────────────────
    backup(MATERIAL)
    font = TTFont(ORIGINALS / MATERIAL.name)
    lig = material_name_to_glyph(font)

    names = literal_material_names() | {n for n in from_data if n in lig}

    targets, missing = set(), set()
    for name in names:
        glyph = lig.get(name)
        (targets.add(glyph) if glyph else missing.add(name))

    if missing:
        print(f"  ATTENZIONE: nomi Material non trovati nel font: {sorted(missing)}")

    letters = "".join(sorted({c for n in names for c in n}))
    print(f"Material Icons — {len(names)} icone usate, {len(targets)} glifi mantenuti")
    run_subset(
        MATERIAL,
        [
            f"--glyphs={','.join(sorted(targets))}",
            f"--text={letters}",
            "--layout-features+=liga",
            # Without this, every ligature spelled with the same 26 letters is
            # dragged back in and the subset saves ~11% instead of ~90%.
            "--no-layout-closure",
        ],
    )

    # ── Font Awesome ──────────────────────────────────────────────
    table = fa_class_to_codepoint()
    # `icon: 'chart-pie'` in TS becomes class `fa-chart-pie` at render time.
    classes = literal_fa_classes() | {
        f"fa-{n}" for n in from_data if f"fa-{n}" in table
    }
    codepoints = {table[c] for c in classes if c in table}
    unmapped = sorted(c for c in classes if c not in table)
    print(
        f"\nFont Awesome — {len(classes)} classi trovate, "
        f"{len(codepoints)} con un glifo"
    )
    if unmapped:
        # Expected: fa-spin, fa-solid, fa-brands are styling/animation classes.
        print(f"  (senza glifo, ignorate: {', '.join(unmapped)})")

    unicodes = ",".join(f"U+{cp:04X}" for cp in sorted(codepoints))
    for face in FA_FACES:
        if face.exists():
            run_subset(face, [f"--unicodes={unicodes}"])


if __name__ == "__main__":
    main()
