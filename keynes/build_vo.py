import re, json, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
C='/root/.cache/hyperframes/tts/'
k=Kokoro(C+'models/kokoro-v1.0.onnx',C+'voices/voices-v1.0.bin')
V='am_michael'; SP=1.05
paras=[p.strip() for p in open('vo.txt').read().split('\n') if p.strip()]
out=[]; words=[]; sections=[]; t=0.0; SR=24000
def sil(s): return np.zeros(int(s*SR),dtype=np.float32)
out.append(sil(0.4)); t=0.4
for pi,p in enumerate(paras):
    sections.append(t)
    sents=re.split(r'(?<=[.!?:])\s+(?=[A-Z\'"‘])',p)
    for s in sents:
        a,sr=k.create(s,voice=V,speed=SP,lang='en-us')
        # trim edges
        idx=np.where(np.abs(a)>0.01)[0]; a=a[max(idx[0]-240,0):idx[-1]+480]
        d=len(a)/SR
        ws=s.split()
        wts=[max(len(k.tokenizer.phonemize(re.sub(r'[^\w\' .%-]','',w)) or w),1)+1.5 for w in ws]
        tot=sum(wts); c=t
        for w,x in zip(ws,wts):
            dd=d*x/tot; words.append({"text":w,"start":round(c,3),"end":round(c+dd,3)}); c+=dd
        out.append(a); t+=d
        out.append(sil(0.2)); t+=0.2
    out.append(sil(0.35)); t+=0.35
a=np.concatenate(out); sf.write('audio/vo.wav',a,SR)
json.dump({"duration":round(t,3),"sections":[round(x,3) for x in sections],"words":words},open('audio/words.json','w'),indent=0)
print(t,len(words),[round(x,1) for x in sections])
