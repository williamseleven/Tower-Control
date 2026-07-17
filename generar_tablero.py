import pandas as pd, json, datetime, os, gzip, base64, io, sys, urllib.request
from dateutil import parser as dtparser
import pytz

# ============================================================
#  Torre de Despacho - generador automatico del tablero
#  Descarga el CSV, procesa, y escribe index.html listo para publicar.
# ============================================================

CSV_URL = 'https://vtex.brandlive.net/upload/queries/ops-om-ar.csv'
OUT_HTML = 'index.html'          # se publica via GitHub Pages
TEMPLATE_HTML = 'dashboard.html'  # plantilla con __DATA__ y __JS__
TEMPLATE_JS = 'dashboard.js'
DAYS_WINDOW = 15                  # ultimos 15 dias

tz_ba = pytz.timezone('America/Argentina/Buenos_Aires')
now_ba = datetime.datetime.now(tz_ba)
WEEK_END = now_ba.date()
WEEK_START = WEEK_END - datetime.timedelta(days=DAYS_WINDOW - 1)

print(f'Descargando CSV desde {CSV_URL} ...')
req = urllib.request.Request(CSV_URL, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req, timeout=120) as resp:
    csv_bytes = resp.read()
print(f'Descargado: {len(csv_bytes)/1024/1024:.1f} MB')

df = pd.read_csv(io.BytesIO(csv_bytes), low_memory=False)
df['order_channel-created-at'] = pd.to_datetime(df['order_channel-created-at'], errors='coerce')
df = df[(df['order_channel-created-at'].dt.date >= WEEK_START) & (df['order_channel-created-at'].dt.date <= WEEK_END)].copy()
print(f'Ventana: {WEEK_START} a {WEEK_END} ({len(df)} filas antes de procesar)')

# Dedup: el extracto trae filas duplicadas (mismo order_id + ship_id)
rows_before = len(df)
df = df.sort_values('ship_created-at').drop_duplicates(subset=['order_id', 'ship_id'], keep='last')
print(f'Filas duplicadas removidas: {rows_before - len(df)}')

WD_NAMES = ['Lun','Mar','Mie','Jue','Vie','Sab','Dom']

# ---------- Courier mapping ----------
courier_raw = """me2\tMeli
Andreani_Home_Regular\tAndreani
Inner_Home_Regular\tInner
me2_flex_caba\tMeli
HOP_PickUpPoints\tInner
OCASA_Home_Regular\tOcasa
Moova_Home_NextDay_PM\tMoova
Fasttrack_Home_Regular\tFasttrack
Moova_Home_SameDay_WK\tMoova
Moova_Home_Regular\tMoova
Pickit_PickUpPoints\tPickit
me2_flex_bsas\tMeli
Moova_Spu_Mall:NSO-Unicenter\tMoova
Moova_Spu_Mall:NSO-Abasto\tMoova
Moova_Spu_Mall:NDIS-Pacifico\tMoova
Moova_Home_SameDay_PM\tMoova
elogisticaregular\tElogistica
Inner_Home_NextDay_PM\tInner
pickit\tPickit
OCASA_Home_HTH\tOcasa
tokens\tMeli
Fasttrack_Home_NextDay\tFasttrack
Moova_Home_SameDay\tMoova
Inner_Home_Nextday\tInner
Moova_Home_NextDay\tMoova
Cabify_Home_SameDay\tCabify
amstrates24\tMeli
Fasttrack_Home_NextDay_PM\tFasttrack
Cabify_Home_SameDay_PM\tCabify
spu_estandar:R062\tMeli
amstrates16\tOcasa
Moova_Home_SameDay_AM\tMoova
amstrates17\tamstrates17
OCASA_Reverse_Store\tOcasa
OCASA_Home_Regular_Misiones\tOcasa
Fasttrack_Home_NextDay_AM\tFasttrack
Moova_Reverse_Home\tMoova
Cabify_Home_NextDay\tCabify
Cabify_Home_SameDay_WK\tCabify
ELOGISTICA SPU\tElogistica
Inner_Home_NextDay\tInner
Pickit_Home_SameDay\tPickit"""
courier_map = {}
for line in courier_raw.strip().split("\n"):
    k, v = line.split("\t")
    if k not in courier_map:
        courier_map[k] = v
courier_map_lower = {k.lower(): v for k, v in courier_map.items()}

def resolve_courier(method):
    if pd.isna(method): return None
    if method in courier_map: return courier_map[method]
    if method.lower() in courier_map_lower: return courier_map_lower[method.lower()]
    if method.startswith('Ocasa_Spu_Mall:') or method.startswith('OCASA_Spu_Mall:'): return 'Ocasa'
    if method.startswith('spu_estandar:'): return 'Elogistica'
    if method.lower().startswith('inner'): return 'Inner'
    if method.lower().startswith('pickit'): return 'Pickit'
    if method.startswith('Moova_Spu'): return 'Moova'
    if method.startswith('Ocasa_Spu') or method.startswith('OCASA_Spu') or method.startswith('spu_ocasa'): return 'Ocasa'
    if method.startswith('Fasttrack'): return 'Fasttrack'
    if method.startswith('Cabify'): return 'Cabify'
    if method.startswith('elogistica') or method.startswith('ELOGISTICA'): return 'Elogistica'
    return 'SIN MAPEO: ' + method

df['courier'] = df['ship_shipping-method'].apply(resolve_courier)
df['courier'] = df['courier'].replace({'ELOGISTICA': 'Elogistica'})
df.loc[df['ship_shipping-method'] == 'HOP_PickUpPoints', 'courier'] = 'HOP'

# MeliFlex real courier via ship_carier2, fallback ship_carrier1
flex_mask = df['ship_shipping-method'].isin(['me2_flex_bsas', 'me2_flex_caba'])
def resolve_flex(row):
    c2 = row['ship_carier2']
    if pd.notna(c2) and str(c2).strip() != '':
        c2l = str(c2).strip().lower()
        return {'moova': 'Moova', 'cabify': 'Cabify'}.get(c2l, str(c2).strip())
    c1 = row['ship_carrier1']
    if pd.notna(c1) and str(c1).strip().upper() == 'ELOGISTICA':
        return 'Elogistica'
    return 'Pendiente de asignación'
df.loc[flex_mask, 'courier'] = df.loc[flex_mask].apply(resolve_flex, axis=1)

# ---------- Service mapping ----------
service_raw = """amstrates16\tANDREANI V2
amstrates17\tESTANDAR
Andreani_Home_Regular\tANDREANI V2
elogistica\tELOGISTICA
elogisticaregular\tELOGISTICA
Fasttrack_Home_NextDay\tFASTTRACK ND
Fasttrack_Home_NextDay_PM\tFASTTRACK ND_PM
Fasttrack_Home_Regular\tFASTTRACK
Fasttrack_Home_SameDay\tFASTTRACK Sameday
Inner_Home_NextDay\tINNER-NEXTDAY
Inner_Home_NextDay_PM\tINNER-NEXTDAY-PM
Inner_Home_Regular\tINNER
me2\tMELI
me2_flex_bsas\tMeliflex
me2_flex_caba\tMeliflex
Moova_Home_NextDay\tMOOVA-NEXTDAY
Moova_Home_NextDay_PM\tMOOVA-NEXTDAY-PM
Moova_Home_Regular\tMOOVA_REGULAR
Moova_Home_SameDay\tMOOVA-SAMEDAY
Moova_Home_SameDay_PM\tMOOVA-SAMEDAY-PM
OCASA_Home_HTH\tOCASA
OCASA_Home_Regular\tOCASA
OCASA_Home_Regular_Misiones\tOCASA
pickit\tPICKIT
tokens\tTOKENS
Pickit_PickUpPoints\tPICKIT
amstrates24\tMOOVA-SAMEDAY
Moova_Home_SameDay_WK\tMOOVA-WK
Moova_Reverse_Home\tMOOVA
Moova_Home_SameDay_AM\tMOOVA-SAMEDAY
Cabify_Home_SameDay\tCabify Same Day
Cabify_Home_SameDay_PM\tCabify Same Day PM
Cabify_Home_SameDay_WK\tCabifyWK
Fasttrack_Home_NextDay_AM\tFASTTRACK
Cabify_Home_NextDay\tCabify ND
HOP_PickUpPoints\tPunto de retiro
Pickit_Home_SameDay\tPickitHomeSD
spu_estandar:R062\tMELI"""
service_map = {}
for line in service_raw.strip().split("\n"):
    k, v = line.split("\t")
    if k not in service_map:
        service_map[k] = v
service_map_lower = {k.lower(): v for k, v in service_map.items()}

def resolve_service(method):
    if pd.isna(method): return None
    if method in service_map: return service_map[method]
    if method.lower() in service_map_lower: return service_map_lower[method.lower()]
    if method.startswith('Ocasa_Spu_Calle:') or method.startswith('OCASA_Spu_Calle:'): return 'OCASA-SPU'
    if method.startswith('Ocasa_Spu_Mall:') or method.startswith('OCASA_Spu_Mall:'): return 'OCASA-SPU'
    if method.startswith('spu_ocasa'): return 'ANDREANI V2-SPU'
    if method.startswith('Moova_Spu_Mall:'): return 'MOOVA-SPU'
    if method.startswith('Moova_Spu_Calle:'): return 'OCASA-SPU'
    if method.startswith('spu_estandar:'): return 'ELOGISTICA SPU'
    if method.startswith('Inner_Spu_Mall:') or method.startswith('Inner_Spu_Calle:'): return 'INNER-SPU'
    if 'reverse' in method.lower(): return 'REVERSA (a confirmar)'
    return 'SIN MAPEO: ' + method

df['servicio'] = df['ship_shipping-method'].apply(resolve_service)

# ---------- Excluir Meli (me2) para aligerar ----------
rows_before_meli = len(df)
df = df[df['courier'] != 'Meli'].copy()
print(f'Ordenes Meli (me2) excluidas: {rows_before_meli - len(df)}')

# ---------- Delivery promise ----------
tz_ba = pytz.timezone('America/Argentina/Buenos_Aires')
HOLIDAY = datetime.date(2026, 7, 9)

def to_local_date(s):
    if pd.isna(s): return None
    ts = dtparser.parse(s)
    if ts.tzinfo is not None:
        ts = ts.astimezone(tz_ba)
    return ts.date()

df['promise_date'] = df['order_delivery-promise'].apply(to_local_date)
df['promise_str'] = df['promise_date'].apply(lambda d: d.strftime('%d/%m') if d else '')

df['hora'] = pd.to_datetime(df['order_channel-created-at']).dt.strftime('%H:%M')
df['dia_compra'] = pd.to_datetime(df['order_channel-created-at']).dt.strftime('%Y-%m-%d')

# ---------- Compact dictionary-encoded export ----------
def build_dict(series):
    values = sorted(series.fillna('').unique().tolist())
    index = {v: i for i, v in enumerate(values)}
    return values, series.fillna('').map(index).tolist()

brand_dict, brand_idx = build_dict(df['brand_name'])
ostatus_dict, ostatus_idx = build_dict(df['order_status'])
courier_dict, courier_idx = build_dict(df['courier'])
servicio_dict, servicio_idx = build_dict(df['servicio'])
sstatus_dict, sstatus_idx = build_dict(df['ship_status'])
day_dict, day_idx = build_dict(df['dia_compra'])
promise_dict, promise_idx = build_dict(df['promise_str'])

rows = []
for i in range(len(df)):
    rows.append([
        int(df['order_id'].iloc[i]),
        df['order_ext-id'].iloc[i] if pd.notna(df['order_ext-id'].iloc[i]) else '',
        brand_idx[i], ostatus_idx[i], courier_idx[i], servicio_idx[i],
        df['ship_tracking-number'].iloc[i] if pd.notna(df['ship_tracking-number'].iloc[i]) else '',
        sstatus_idx[i],
        df['hora'].iloc[i],
        day_idx[i],
        promise_idx[i],
    ])

payload = {
    'dicts': {
        'brand': brand_dict, 'ostatus': ostatus_dict, 'courier': courier_dict,
        'servicio': servicio_dict, 'sstatus': sstatus_dict,
    },
    'days': day_dict,
    'promises': promise_dict,
    'holiday': '09/07',
    'rows': rows,
}

raw_bytes = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
compressed = gzip.compress(raw_bytes, compresslevel=9)
b64 = base64.b64encode(compressed).decode('ascii')

print('total filas', len(rows))
print('tamano JSON sin comprimir: %.2f MB' % (len(raw_bytes)/1024/1024))
print('tamano gzip+base64: %.2f MB' % (len(b64)/1024/1024))
print('couriers', courier_dict)
unmapped_c = [c for c in courier_dict if str(c).startswith('SIN')]
unmapped_s = [s for s in servicio_dict if str(s).startswith('SIN') or 'confirmar' in str(s)]
print('courier sin mapeo:', unmapped_c)
print('servicio sin mapeo / a confirmar:', unmapped_s)

# ---------- Ensamblar HTML final ----------
def fmt_ddmm(d):
    return d.strftime('%d/%m')

periodo_txt = f'{fmt_ddmm(WEEK_START)} → {fmt_ddmm(WEEK_END)}'
corte_txt = now_ba.strftime('%d/%m/%Y %H:%M')
titulo = f'Torre de Despacho — {fmt_ddmm(WEEK_START)} al {WEEK_END.strftime("%d/%m/%Y")}'
subtitulo = (f'Compras generadas en los últimos {DAYS_WINDOW} días '
             f'({WEEK_START.strftime("%d/%m")} al {WEEK_END.strftime("%d/%m/%Y")}), '
             f'distribuidas por courier, servicio y marca. Excluye envíos Meli '
             f'(me2, fulfillment propio de Mercado Libre) — se mantienen los MeliFlex. '
             f'Actualización automática cada 20 min. Datos derivados de ops-om-ar.')

html = open(TEMPLATE_HTML, encoding='utf-8').read()
js = open(TEMPLATE_JS, encoding='utf-8').read()

# Reemplazos de header (robustos: por regex sobre los elementos con id/estructura conocida)
import re
html = re.sub(r'<title>.*?</title>', f'<title>{titulo}</title>', html, flags=re.S)
html = re.sub(r'(<div class="subtitle">).*?(</div>)', lambda m: m.group(1)+subtitulo+m.group(2), html, flags=re.S)
html = re.sub(r'(<span class="big" id="cutoffTime">).*?(</span>)', lambda m: m.group(1)+corte_txt+m.group(2), html, flags=re.S)
# La linea de periodo: reemplazar el contenido del span coloreado que sigue a "Periodo"/"Semana"
html = re.sub(r'((?:Periodo|Semana)\s*<span style="color:var\(--text\)">).*?(</span>)',
              lambda m: m.group(1)+periodo_txt+m.group(2), html, flags=re.S)

html = html.replace('__DATA__', b64).replace('__JS__', js)

with open(OUT_HTML, 'w', encoding='utf-8') as f:
    f.write(html)

print(f'HTML generado: {OUT_HTML} (%.2f MB)' % (len(html.encode("utf-8"))/1024/1024))
print(f'Periodo: {periodo_txt} | Corte: {corte_txt}')
