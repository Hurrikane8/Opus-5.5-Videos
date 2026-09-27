import asyncio, json, edge_tts, subprocess
V="en-US-ChristopherNeural"; RATE="+3%"; PITCH="-3Hz"
text=open('vo.txt').read().replace('\n',' \n ')
async def main():
    c=edge_tts.Communicate(text,V,rate=RATE,pitch=PITCH,boundary="WordBoundary")
    words=[]
    with open('audio/vo.mp3','wb') as f:
        async for ch in c.stream():
            if ch["type"]=="audio": f.write(ch["data"])
            elif ch["type"]=="WordBoundary":
                s=ch["offset"]/1e7; words.append({"text":ch["text"],"start":round(s,3),"end":round(s+ch["duration"]/1e7,3)})
    d=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0','audio/vo.mp3']))
    json.dump({"voice":V,"duration":d,"words":words},open('audio/words.json','w'),indent=0)
    print(d,len(words))
asyncio.run(main())
