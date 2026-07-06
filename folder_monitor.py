from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from main import process_single_file
import time
import os

class FolderHandler(FileSystemEventHandler):

    def on_created(self, event):
        if event.is_directory:
            return
        
        print("New file detected:", event.src_path)
        time.sleep(2)
        result= process_single_file(event.src_path)
        
        print(result)

path = "input_files"

event_handler = FolderHandler()

observer = Observer()
observer.schedule(event_handler, path, recursive=False)

observer.start()

print("👀 Watching folder...")

try:
    while True:
        time.sleep(1)

except KeyboardInterrupt:
    observer.stop()

observer.join()