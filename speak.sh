#!/bin/bash
# speak.sh - Default TTS output via CosyVoice3 + zDashboard
# Usage: bash speak.sh "要说的文本"
#
# Config: speak.json (same directory) - this IS the ComfyUI API workflow JSON
#   Just export from ComfyUI "Save as API Format" and save as speak.json

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKFLOW="$SCRIPT_DIR/speak.json"
API_URL="http://127.0.0.1:8188"
DASHBOARD="http://127.0.0.1:3100"
AUDIO_DIR="/mnt/c/Users/hanqi/WorkBuddy/Claw/zdashboard/audio"
COMFYUI_TEMP="/mnt/b/ai/ComfyUI_windows_portable/ComfyUI/temp"
COMFYUI_OUTPUT="/mnt/b/ai/ComfyUI_windows_portable/ComfyUI/output"
TEXT_NODE="52"
OUTPUT_NODE="21"

if [ -n "$1" ]; then
    TEXT="$1"
elif [ ! -t 0 ]; then
    TEXT=$(cat)
else
    TEXT=""
fi

if [ -z "$TEXT" ]; then
    echo "ERROR: No text provided"
    echo "Usage: $0 <text>"
    exit 1
fi

python3 -c "
import json, urllib.request, shutil, os, sys, time

text = '''$TEXT'''
wf_path = '$WORKFLOW'
api_url = '$API_URL'
dash_url = '$DASHBOARD'
audio_dir = '$AUDIO_DIR'
temp_dir = '$COMFYUI_TEMP'
out_dir = '$COMFYUI_OUTPUT'
text_node = '$TEXT_NODE'
output_node = '$OUTPUT_NODE'

with open(wf_path, 'r', encoding='utf-8') as f:
    wf = json.load(f)

wf[text_node]['inputs']['text'] = text

payload = json.dumps({'prompt': wf}, ensure_ascii=False).encode('utf-8')
req = urllib.request.Request(f'{api_url}/prompt', data=payload, headers={'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(req, timeout=60) as resp:
        result = json.loads(resp.read().decode('utf-8'))
        prompt_id = result.get('prompt_id', '')
except Exception as e:
    print(f'ERROR: {e}', file=sys.stderr)
    sys.exit(1)

if not prompt_id:
    print('ERROR: no prompt_id', file=sys.stderr)
    sys.exit(1)

print(f'Submitted: {prompt_id}')

filename = filetype = None
for i in range(120):
    time.sleep(1)
    try:
        req = urllib.request.Request(f'{api_url}/history/{prompt_id}')
        with urllib.request.urlopen(req, timeout=10) as resp:
            hist = json.loads(resp.read().decode('utf-8'))
            if prompt_id in hist:
                outputs = hist[prompt_id].get('outputs', {})
                if output_node in outputs:
                    audio_list = outputs[output_node].get('audio', [])
                    if audio_list:
                        audio = audio_list[0]
                        filename = audio.get('filename', '')
                        filetype = audio.get('type', 'temp')
                        break
    except:
        pass

if not filename:
    print('TIMEOUT', file=sys.stderr)
    sys.exit(1)

if filetype == 'temp' and temp_dir:
    src = os.path.join(temp_dir, filename)
elif out_dir:
    src = os.path.join(out_dir, filename)
else:
    print('ERROR: cannot locate file', file=sys.stderr)
    sys.exit(1)

if not os.path.exists(src):
    print(f'ERROR: {src} not found', file=sys.stderr)
    sys.exit(1)

os.makedirs(audio_dir, exist_ok=True)
dst = os.path.join(audio_dir, filename)
shutil.copy2(src, dst)

win_path = dst.replace('/mnt/c/', 'C:/').replace('/mnt/d/', 'D:/').replace('/mnt/b/', 'B:/')

payload = json.dumps({'path': win_path}).encode('utf-8')
req = urllib.request.Request(f'{dash_url}/api/play', data=payload, headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(req, timeout=5) as resp:
    pass

print(f'Done: {filename}')
"
