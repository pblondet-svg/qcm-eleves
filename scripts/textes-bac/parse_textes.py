import re, json, collections
pages = open('pdf/tout.txt').read().split('\f')
idx = json.load(open('notions_index.json'))
notions_de = collections.defaultdict(list)
for n, ps in idx.items():
    for p in ps: notions_de[p].append(n)
# Sessions (sommaire)
som = pages[12] + pages[13]
sessions = sorted([(int(p), int(y)) for y, p in re.findall(r'SESSION (\d{4})\s*\.+\s*(\d+)', som)])
def session_de(page):
    y = None
    for p, yy in sessions:
        if page >= p: y = yy
    return y
ATTR = re.compile(r"^\s*((?:[A-Za-zé]{1,3}[’' ])?[A-ZÉÈÀÂÎÔÛÇ][A-ZÉÈÀÂÎÔÛÇ’'&\-\u2011 ]{2,}?)\s*(?:,\s*(.+))?$")
def reflow(lines):
    paras=[]; cur=[]
    for l in lines:
        if not l.strip():
            if cur: paras.append(' '.join(cur)); cur=[]
            continue
        if re.match(r'^\s{3,}\S', l) and cur:  # alinéa
            paras.append(' '.join(cur)); cur=[]
        cur.append(l.strip())
    if cur: paras.append(' '.join(cur))
    t='\n'.join(paras)
    t=re.sub(r'(\w)- (\w)', lambda m: m.group(1)+'-'+m.group(2), t)
    return t
out=[]; rates=[]
for pi in range(14, len(pages)):
    page = pi+1
    p = pages[pi]
    lines = [re.sub(r"[\uf000-\uf8ff]\s?", "", l) for l in p.split("\n")]
    body = [l for l in lines if not re.fullmatch(r'\s*-\s*\d+\s*-\s*', l) and not re.fullmatch(r'\s*[- ]+\s*', l)]
    if not any(l.strip() for l in body): continue
    if re.search(r'^\s*SESSION \d{4}\s*$', p, re.M) and sum(1 for l in body if l.strip()) <= 2: continue
    ai = next((i for i,l in enumerate(body) if ATTR.match(l) and len(re.sub(r'[^A-ZÉÈ]','',ATTR.match(l).group(1)))>=4), None)
    if ai is None:
        # Page de suite : questions de la série technologique qui débordent sur la page suivante
        if out and out[-1]['questions']:
            out[-1]['questions'] += '\n' + reflow(body)
        else:
            rates.append(page)
        continue
    m = ATTR.match(body[ai])
    auteur = m.group(1).strip().rstrip(',')
    reste = (m.group(2) or '').strip()
    if not m.group(2) and len(body[ai]) - len(body[ai].lstrip()) < 20: continue
    if m.group(2) and len(body[ai]) - len(body[ai].lstrip()) < 2 and not re.match(r'^[A-ZÉ&’\- ]{4,}$', auteur): continue
    texte = reflow(body[:ai])
    apres = body[ai+1:]
    qi = next((i for i,l in enumerate(apres) if re.match(r'^\s*QUESTIONS', l)), None)
    notes_l = apres[:qi] if qi is not None else apres
    questions = reflow(apres[qi+1:]) if qi is not None else ''
    notes = '\n'.join(re.sub(r'\s+',' ',l).strip() for l in notes_l if l.strip())
    # œuvre et date : « Œuvre, date »
    oeuvre = reste
    out.append({'page': page, 'auteur': auteur.title().replace("D’", "d’").replace("De ", "de "), 'reference': reste,
                'texte': texte, 'notes': notes, 'questions': questions, 'session': session_de(page),
                'serie': 'techno' if questions else 'generale', 'notions': sorted(notions_de.get(page, []))})
print('textes:', len(out), '| pages sans attribution:', len(rates), rates[:30])
print('sans notion:', sum(1 for o in out if not o['notions']))
print('techno:', sum(1 for o in out if o['serie']=='techno'))
L=[len(o['texte']) for o in out]; print('longueur min/med/max', min(L), sorted(L)[len(L)//2], max(L))
json.dump(out, open('textes_bac.json','w'), ensure_ascii=False)
for o in out[:2]+out[500:501]: print(json.dumps({k:(v[:200] if isinstance(v,str) else v) for k,v in o.items()}, ensure_ascii=False, indent=1))
