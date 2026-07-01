import fitz  # PyMuPDF
from docx import Document 

def read_pdf(file_path):
    text = ""

    doc = fitz.open(file_path)

    for page in doc:
        text += page.get_text()

    doc.close()

    return text

def read_docx(file_path):

    text = ""

    doc = Document(file_path)

    for paragraph in doc.paragraphs:
        text += paragraph.text + "\n"

    return text