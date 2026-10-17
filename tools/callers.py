import sys,re
src=open(sys.argv[1]).read().split('\n')
funcs=[];cur=None
for i,l in enumerate(src):
    m=re.match(r'// ==== (\S+) @ (\S+)',l)
    if m: cur=[m.group(1),i,None]; funcs.append(cur)
for j in range(len(funcs)-1): funcs[j][2]=funcs[j+1][1]
funcs[-1][2]=len(src)
targets=sys.argv[2:]
for name,s,e in funcs:
    body='\n'.join(src[s:e])
    hits=[t for t in targets if t+'(' in body and name!=t]
    if hits: print(name, s+1, e-s, ' '.join(t+'x'+str(body.count(t+'(')) for t in hits))
