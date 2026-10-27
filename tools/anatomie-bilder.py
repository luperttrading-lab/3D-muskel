# Wandelt die Rohdaten des Anatomie-Bäckers in Bilddateien für die App um.
# Aufruf: python3 tools/anatomie-bilder.py <rohordner> <zielordner> <kantenlaenge>
import os, sys
from PIL import Image

roh, ziel, n = sys.argv[1], sys.argv[2], int(sys.argv[3])
for g in ('m', 'w'):
    lies = lambda k: open(os.path.join(roh, f'{g}-{k}.bin'), 'rb').read()
    Image.frombytes('RGB', (n, n), lies('farbe')).save(os.path.join(ziel, f'anatomie-{g}-farbe.jpg'), 'JPEG', quality=88, optimize=True, progressive=True)
    # Relief verlustfrei: JPG-Blöcke würden im Bump-Mapping als Kacheln sichtbar
    Image.frombytes('L', (n, n), lies('hoehe')).save(os.path.join(ziel, f'anatomie-{g}-hoehe.png'), 'PNG', optimize=True)
    # Karte verlustfrei: R = Einheit, G = Muskelanteil, B = Hautzone
    Image.frombytes('RGBA', (n, n), lies('karte')).convert('RGB').save(os.path.join(ziel, f'anatomie-{g}-karte.png'), 'PNG', optimize=True)
    for k in ('farbe.jpg', 'hoehe.png', 'karte.png'):
        f = os.path.join(ziel, f'anatomie-{g}-{k}')
        print(f'{f:42s} {os.path.getsize(f) // 1024:6d} KB')
