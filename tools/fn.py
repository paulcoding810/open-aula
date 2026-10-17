import sys,re
src=open(sys.argv[1]).read().split('\n')
idx={}
cur=None
for i,l in enumerate(src):
    m=re.match(r'// ==== (\S+) @',l)
    if m: cur=m.group(1); idx[cur]=[i,None]
names=list(idx)
for a,b in zip(names,names[1:]): idx[a][1]=idx[b][0]
idx[names[-1]][1]=len(src)
for n in sys.argv[2:]:
    s,e=idx[n]; print('\n'.join(src[s:e]))
