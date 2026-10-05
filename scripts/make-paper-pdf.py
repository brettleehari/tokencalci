#!/usr/bin/env python3
"""Render docs/from-free-weights-to-reliable-tokens.md to a print-ready PDF.

The markdown file stays the single source of truth; this only typesets it.
Pipeline: python-markdown -> HTML with print CSS -> headless Chrome -> PDF.

    pip install markdown pypdf        # pypdf is optional (PDF metadata only)
    python3 scripts/make-paper-pdf.py

Set CHROME to override the browser binary.
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "from-free-weights-to-reliable-tokens.md"
OUT = SRC.with_suffix(".pdf")

AUTHOR = "Hariprasad Sudharshan"
KEYWORDS = (
    "large language models, inference serving, open weights, total cost of "
    "ownership, GPU economics, tensor parallelism, quantisation, vLLM, capacity planning"
)

CHROME_CANDIDATES = [
    os.environ.get("CHROME"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "google-chrome",
    "chromium",
    "chromium-browser",
]

CSS = """
@page {
  size: A4;
  margin: 24mm 22mm 24mm 22mm;
  @bottom-center {
    content: counter(page);
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 9pt;
    color: #555;
  }
  @top-right {
    content: "From Free Weights to Reliable Tokens";
    font-family: Georgia, 'Times New Roman', serif;
    font-style: italic;
    font-size: 8.5pt;
    color: #777;
  }
}
@page :first { @bottom-center { content: none; } @top-right { content: none; } }

html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  font-family: 'Iowan Old Style', Charter, Georgia, 'Times New Roman', serif;
  font-size: 10.5pt;
  line-height: 1.45;
  color: #111;
  margin: 0;
  hyphens: auto;
  text-align: justify;
}

/* Title block: h1, subtitle h3, author line */
h1 { font-size: 23pt; line-height: 1.15; text-align: center; margin: 6mm 0 3mm; hyphens: none; }
h1 + h3 { font-size: 13pt; font-weight: normal; font-style: italic; text-align: center; margin: 0 12mm 5mm; hyphens: none; }
h1 + h3 + p { text-align: center; font-size: 10.5pt; margin-bottom: 4mm; }

/* Abstract: set in from the text block, as a journal would */
.abstract { margin: 0 9mm; font-size: 9.8pt; line-height: 1.42; }
.abstract h2 { text-align: center; font-size: 11pt; letter-spacing: 0.08em; text-transform: uppercase; margin: 5mm 0 3mm; }

h2, h3, h4 { text-align: left; hyphens: none; break-after: avoid; page-break-after: avoid; }
h2 { font-size: 14.5pt; margin: 9mm 0 3mm; }
h3 { font-size: 11.5pt; margin: 6mm 0 2mm; }
h4 { font-size: 10.5pt; margin: 5mm 0 2mm; }

p { margin: 0 0 2.6mm; orphans: 3; widows: 3; }
ul, ol { margin: 0 0 2.6mm; padding-left: 6mm; }
li { margin-bottom: 1mm; }
a { color: #1a3f7a; text-decoration: none; overflow-wrap: anywhere; }
hr { border: 0; border-top: 0.4pt solid #999; margin: 6mm 0; }
blockquote { margin: 3mm 0 3mm 4mm; padding-left: 4mm; border-left: 1.5pt solid #bbb; color: #333; }

code {
  font-family: Menlo, 'SF Mono', Consolas, monospace;
  font-size: 0.86em;
  background: #f3f3f1;
  padding: 0 1.5pt;
  border-radius: 2pt;
  overflow-wrap: anywhere;
}
pre {
  background: #f6f6f4;
  border: 0.4pt solid #d8d8d4;
  border-radius: 2pt;
  padding: 3mm;
  margin: 3mm 0 4mm;
  white-space: pre-wrap;
  text-align: left;
  hyphens: none;
  break-inside: avoid;
  page-break-inside: avoid;
}
pre code { font-size: 8.2pt; line-height: 1.4; background: none; padding: 0; }

table {
  width: 100%;
  border-collapse: collapse;
  margin: 3mm 0 4mm;
  font-size: 8.6pt;
  line-height: 1.3;
  text-align: left;
  hyphens: manual;
  border-top: 0.8pt solid #222;
  border-bottom: 0.8pt solid #222;
}
thead { display: table-header-group; }
th { border-bottom: 0.5pt solid #222; font-weight: bold; vertical-align: bottom; }
th, td { padding: 1.2mm 1.6mm; vertical-align: top; }
/* Row ids (A-1, B-3b, C-12) must not break at the hyphen */
td:first-child { white-space: nowrap; }
tbody tr + tr td { border-top: 0.25pt solid #ccc; }
tr { break-inside: avoid; page-break-inside: avoid; }
table.keep { break-inside: avoid; page-break-inside: avoid; }
/* Justifying around long URLs leaves rivers of space */
li:has(a[href^="http"]) { text-align: left; hyphens: none; }

figure { margin: 4mm 0 5mm; break-inside: avoid; page-break-inside: avoid; }
figure img { display: block; width: 100%; height: auto; }
figcaption { font-size: 9pt; line-height: 1.35; margin-top: 2.5mm; color: #222; }
img { max-width: 100%; }
"""


def find_chrome():
    for c in CHROME_CANDIDATES:
        if not c:
            continue
        if os.path.isfile(c):
            return c
        from shutil import which
        if which(c):
            return which(c)
    sys.exit("No Chrome/Chromium found. Set CHROME=/path/to/binary.")


def autolink(html):
    """Link bare URLs in text, as GitHub does; leave <a>, <pre> and <code> alone."""
    out, skip = [], 0
    for part in re.split(r"(<[^>]+>)", html):
        if part.startswith("<"):
            tag = re.match(r"</?(\w+)", part)
            if tag and tag.group(1) in ("a", "pre", "code"):
                skip += -1 if part.startswith("</") else 1
        elif skip == 0:
            part = re.sub(
                r"https?://[^\s<>\"]+[^\s<>\".,;:)]",
                lambda m: f'<a href="{m.group(0)}">{m.group(0)}</a>',
                part,
            )
        out.append(part)
    return "".join(out)


def build_html(md_text):
    body = markdown.markdown(
        md_text,
        extensions=["tables", "fenced_code", "sane_lists", "toc"],
        output_format="html5",
    )
    # An image paragraph followed by a "Figure N:" paragraph becomes one
    # unbreakable figure, so a caption can never be orphaned from its image.
    body = re.sub(
        r"<p>(<img [^>]+>)</p>\s*<p>(<strong>Figure .*?)</p>",
        r"<figure>\1<figcaption>\2</figcaption></figure>",
        body,
        flags=re.S,
    )
    # The abstract runs from its heading to the next rule; wrap it for styling.
    body = re.sub(
        r'(<h2 id="abstract">.*?)(<hr\s*/?>)',
        r'<section class="abstract">\1</section>\2',
        body,
        count=1,
        flags=re.S,
    )
    body = autolink(body)
    # Short tables stay on one page; long ones (the appendices) may still break
    # between rows, with the header repeated.
    body = re.sub(
        r"<table>(.*?)</table>",
        lambda m: (
            f'<table class="keep">{m.group(1)}</table>'
            if m.group(1).count("<tr>") <= 12
            else m.group(0)
        ),
        body,
        flags=re.S,
    )
    # Resolve figure paths against docs/, since the HTML is rendered from a temp dir.
    body = re.sub(
        r'src="(?!https?:|file:|data:)([^"]+)"',
        lambda m: f'src="{(SRC.parent / m.group(1)).resolve().as_uri()}"',
        body,
    )
    title = re.search(r"^# (.+)$", md_text, flags=re.M).group(1).strip()
    html = (
        '<!doctype html><html lang="en-GB"><head><meta charset="utf-8">'
        f"<title>{title}</title>"
        f'<meta name="author" content="{AUTHOR}">'
        f'<meta name="keywords" content="{KEYWORDS}">'
        f"<style>{CSS}</style></head><body>{body}</body></html>"
    )
    return title, html


def set_metadata(pdf_path, title, subtitle):
    try:
        from pypdf import PdfReader, PdfWriter
    except ImportError:
        print("pypdf not installed — skipping PDF author/keyword metadata.")
        return
    writer = PdfWriter(clone_from=PdfReader(str(pdf_path)))
    writer.add_metadata({
        "/Title": f"{title}: {subtitle}" if subtitle else title,
        "/Author": AUTHOR,
        "/Subject": subtitle or "",
        "/Keywords": KEYWORDS,
    })
    with open(pdf_path, "wb") as f:
        writer.write(f)


def main():
    md_text = SRC.read_text(encoding="utf-8")
    title, html = build_html(md_text)
    sub = re.search(r"^### (.+)$", md_text, flags=re.M)
    subtitle = sub.group(1).strip() if sub else ""

    with tempfile.TemporaryDirectory() as tmp:
        html_path = Path(tmp) / "paper.html"
        html_path.write_text(html, encoding="utf-8")
        # Chrome prints to a temp file so a failed run never clobbers the last
        # good PDF. Headless Chrome can linger after printing, so wait for the
        # file to stop growing rather than for the process to exit.
        tmp_pdf = Path(tmp) / "paper.pdf"
        proc = subprocess.Popen(
            [
                find_chrome(),
                "--headless=new",
                "--disable-gpu",
                "--no-pdf-header-footer",
                "--generate-pdf-document-outline",
                f"--user-data-dir={tmp}/profile",
                f"--print-to-pdf={tmp_pdf}",
                html_path.as_uri(),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        deadline, last = time.time() + 120, -1
        while time.time() < deadline and proc.poll() is None:
            time.sleep(1)
            size = tmp_pdf.stat().st_size if tmp_pdf.exists() else -1
            if size > 0 and size == last:
                break
            last = size
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
        if not tmp_pdf.exists() or tmp_pdf.stat().st_size == 0:
            sys.exit("Chrome produced no PDF.")
        shutil.copyfile(tmp_pdf, OUT)
    set_metadata(OUT, title, subtitle)
    print(f"Wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
