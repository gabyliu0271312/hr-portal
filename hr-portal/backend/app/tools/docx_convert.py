from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path


DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def convert_docx_bytes_to_pdf(content: bytes, filename: str = "document.docx") -> bytes:
    with tempfile.TemporaryDirectory(prefix="hr-portal-docx-") as tmpdir:
        workdir = Path(tmpdir)
        source = workdir / filename
        if source.suffix.lower() != ".docx":
            source = source.with_suffix(".docx")
        source.write_bytes(content)

        cmd = [
            "soffice",
            "--headless",
            "--convert-to",
            "pdf",
            "--outdir",
            str(workdir),
            str(source),
        ]
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=120,
            text=True,
        )
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "soffice convert failed")

        pdf_path = source.with_suffix(".pdf")
        if not pdf_path.exists():
            raise RuntimeError("converted pdf file not found")
        return pdf_path.read_bytes()
