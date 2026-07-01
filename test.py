import os
from file_reader import read_docx

print("Current folder:", os.getcwd())
print("File exists:", os.path.exists("input_files/resume.docx"))

text = read_docx("input_files/test.docx")
print(text)