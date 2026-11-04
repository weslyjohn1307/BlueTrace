import os
import sys
import urllib.request
import time

MODEL_URL = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx'
VOICES_URL = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin'

TARGET_DIR = os.path.abspath('film/audio_models')
os.makedirs(TARGET_DIR, exist_ok=True)

model_path = os.path.join(TARGET_DIR, 'kokoro-v1.0.onnx')
voices_path = os.path.join(TARGET_DIR, 'voices-v1.0.bin')

def download_file(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        print(f"Already downloaded: {dest} ({os.path.getsize(dest):,} bytes)")
        return
    print(f"Downloading {url} -> {dest} ...")
    start = time.time()
    
    def report_progress(block_num, block_size, total_size):
        downloaded = block_num * block_size
        if total_size > 0:
            percent = downloaded / total_size * 100
            if block_num % 500 == 0 or downloaded >= total_size:
                print(f"  {percent:.1f}% ({downloaded // (1024*1024)}MB / {total_size // (1024*1024)}MB)")
    
    urllib.request.urlretrieve(url, dest, reporthook=report_progress)
    dur = time.time() - start
    print(f"Finished {dest} in {dur:.1f}s ({os.path.getsize(dest):,} bytes)")

if __name__ == '__main__':
    download_file(VOICES_URL, voices_path)
    download_file(MODEL_URL, model_path)
    print("Kokoro model files are ready!")
