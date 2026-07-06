import easyocr
reader = easyocr.Reader(['en'])

def read_image(file_path):
    
    result = reader.readtext(file_path,detail=0)
    
    text="\n".join(result)
    
    return text