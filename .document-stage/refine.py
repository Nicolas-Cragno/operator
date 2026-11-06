from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, sys

stage=Path(__file__).parent
target=Path(r'C:\Users\NIcolas Cragno\Desktop\aplicaciones\cantapp-back\functions\services\operator-write.service.js')
manifest_path=stage/'changes.json'
state_path=stage/'integration.json'
plan_path=stage/'corrections.json'
manifest_bytes=manifest_path.read_bytes()
state=json.loads(state_path.read_text(encoding='utf-8'))
if hashlib.sha256(manifest_bytes).hexdigest()!=state['manifestHash']: raise ValueError('Manifest changed')
manifest=json.loads(manifest_bytes.decode('utf-8'))

if '--apply' not in sys.argv:
    current=target.read_bytes()
    if hashlib.sha256(current).hexdigest()!=state['files'][str(target)]['applied']: raise ValueError('Source changed')
    text=current.decode('utf-8')
    guard=next(line for line in text.splitlines() if line.startswith('  if (id != null &&'))
    text=text.replace(guard+'\n','')
    marker='export function validateOperatorBody(collection, input, creating, id) {\n'
    if marker not in text: raise ValueError('Function marker missing')
    text=text.replace(marker,marker+guard+'\n')
    plan={'target':str(target),'beforeHash':hashlib.sha256(current).hexdigest(),'before':current.decode('utf-8'),'content':text,'status':'prepared'}
    plan_path.write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Prepared: validate the document ID before either early document branch')
    sys.exit(0)

plan=json.loads(plan_path.read_text(encoding='utf-8'))
if Path(plan['target']).resolve()!=target.resolve(): raise ValueError('Unexpected correction target')
current=hashlib.sha256(target.read_bytes()).hexdigest()
expected=hashlib.sha256(plan['content'].encode('utf-8')).hexdigest()
if current==plan['beforeHash']: target.write_bytes(plan['content'].encode('utf-8'))
elif current!=expected: raise ValueError('Source changed after correction review')
manifest[str(target)]['content']=plan['content']
new_manifest=json.dumps(manifest,ensure_ascii=False,indent=2).encode('utf-8')
manifest_path.write_bytes(new_manifest)
state['manifestHash']=hashlib.sha256(new_manifest).hexdigest()
state['files'][str(target)]['applied']=expected
state['updatedAt']=datetime.now(timezone.utc).isoformat()
state_path.write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf-8')
plan['status']='applied'
plan_path.write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding='utf-8')
print(target)
