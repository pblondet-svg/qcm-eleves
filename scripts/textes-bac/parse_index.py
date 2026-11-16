import re, json
pages = open('pdf/tout.txt').read().split('\f')
NOTIONS = ["Art","Bonheur","Conscience","Devoir","État","Inconscient","Justice","Langage","Liberté","Nature","Raison","Religion","Science","Technique","Temps","Travail","Vérité"]
seq=[]
for pi in range(2, 9):  # pages 3..9
    p = pages[pi]
    if 'INDEX DES NOTIONS DES ANCIENS' in p:
        p = p.split('INDEX DES NOTIONS DES ANCIENS')[0]; stop=True
    else: stop=False
    lines = p.split('\n')
    # position de coupure : début de la colonne de droite
    cut = 53
    left=[l[:cut] for l in lines]; right=[l[cut:] for l in lines]
    seq += left + right
    if stop: break
cur=None; idx={}
for l in seq:
    s=l.strip()
    if not s or 'INDEX DES' in s or re.fullmatch(r'-\s*\d+\s*-', s) or re.fullmatch(r'[A-Z]', s): continue
    m=re.match(r"^([A-ZÉ][a-zéèêàçûôî’' ]+?)\s+(\d.*)$", s)
    if m and m.group(1).strip() in NOTIONS:
        cur=m.group(1).strip(); nums=m.group(2)
    elif re.match(r'^[\d, ]+$', s) and cur:
        nums=s
    else:
        print('?', repr(s)); continue
    idx.setdefault(cur, []).extend(int(x) for x in re.findall(r'\d+', nums))
for k in NOTIONS: print(k, len(idx.get(k,[])), idx.get(k,[])[:3], idx.get(k,[])[-3:])
json.dump(idx, open('notions_index.json','w'))
