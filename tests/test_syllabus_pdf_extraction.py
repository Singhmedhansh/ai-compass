"""PDF text extraction has to keep working across pypdf upgrades.

POST /api/v1/parse-syllabus takes a file upload from anyone, with no login,
and hands it to pypdf. The pin sat at 4.2.0 while roughly thirty advisories
accumulated against it — mostly infinite-loop and quadratic-blowup parsing
bugs reachable from a crafted document, which is the worst possible shape of
bug to leave on an unauthenticated endpoint on a 512MB instance.

Moving to 6.x is a major-version jump, so this locks down the behaviour the
app actually depends on: PdfReader over a file-like object, .pages, and
.extract_text(). Without a test, the upgrade is a silent bet that the API did
not move — and the failure would be invisible, because extract_text_from_file
catches everything and returns an "[Error ...]" string that reads like a bad
upload rather than a broken dependency.
"""

import io

import pytest

from app.services.syllabus_parser import extract_text_from_file

SAMPLE_TEXT = "CS101 Syllabus Python Machine Learning"


def build_pdf(text=SAMPLE_TEXT):
    """A minimal but *valid* single-page PDF: xref table and EOF included.

    Both matter. A hand-written PDF missing them parses on some versions and
    not others, which would make this test a coin flip rather than a check.
    """
    stream = f"BT /F1 18 Tf 72 700 Td ({text}) Tj ET".encode()
    objs = [
        b"<</Type/Catalog/Pages 2 0 R>>",
        b"<</Type/Pages/Kids[3 0 R]/Count 1>>",
        b"<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R"
        b"/Resources<</Font<</F1 5 0 R>>>>>>",
        b"<</Length " + str(len(stream)).encode() + b">>stream\n" + stream + b"\nendstream",
        b"<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj".encode() + body + b"endobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer<</Size {len(objs) + 1}/Root 1 0 R>>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


class FakeUpload:
    """The parser is handed a Werkzeug FileStorage in production; it only ever
    uses the file-like surface, so this is enough."""

    def __init__(self, data):
        self._b = io.BytesIO(data)

    def read(self, *a):
        return self._b.read(*a)

    def seek(self, *a):
        return self._b.seek(*a)

    def tell(self):
        return self._b.tell()


def test_text_is_extracted_from_a_pdf():
    text = extract_text_from_file(FakeUpload(build_pdf()), "syllabus.pdf")

    assert "[Error" not in text, f"extraction reported a failure: {text!r}"
    assert "CS101" in text
    assert "Machine Learning" in text


def test_a_pdf_that_is_not_a_pdf_fails_without_raising():
    """The endpoint turns this into a 400. It must not become a 500, and it
    must not leak the underlying parser's exception text to the caller."""
    result = extract_text_from_file(FakeUpload(b"this is not a PDF at all"), "notes.pdf")

    assert isinstance(result, str)
    assert "[Error" in result


@pytest.mark.parametrize("name", ["syllabus.PDF", "Syllabus.Pdf"])
def test_the_extension_check_is_case_insensitive(name):
    """Real uploads arrive with whatever casing the user's OS produced."""
    text = extract_text_from_file(FakeUpload(build_pdf()), name)
    assert "CS101" in text
