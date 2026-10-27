"""Verkleinert die MakeHuman-Texturen (CC0) für den mobilen Einsatz.

Aufruf:  python3 tools/mh-texturen.py <system-assets> <ausgabeordner>
"""
import os
import sys

from PIL import Image

SYS, ZIEL = sys.argv[1], sys.argv[2]
os.makedirs(ZIEL, exist_ok=True)

HAUT = {
    # Hautton -> (Mann, Frau)
    'hell': ('skins/young_caucasian_male/young_lightskinned_male_diffuse.png',
             'skins/young_caucasian_female/young_lightskinned_female_diffuse.png'),
    'mittel': ('skins/young_asian_male/young_lightskinned_male_diffuse3.png',
               'skins/young_asian_female/young_lightskinned_female_diffuse3.png'),
    'dunkel': ('skins/young_african_male/young_darkskinned_male_diffuse.png',
               'skins/young_african_female/young_darkskinned_female_diffuse.png'),
}
ALPHA = {
    'brauen-m': ('eyebrows/eyebrow001/eyebrow001.png', 256),
    'brauen-w': ('eyebrows/eyebrow010/eyebrow010.png', 256),
    'wimpern': ('eyelashes/eyelashes02/eyelashes02.png', 256),
    'haare-m': ('hair/short02/short02_diffuse.png', 512),
    'haare-w': ('hair/ponytail01/ponytail01_diffuse.png', 512),
}


def speichere_jpg(quelle, name, groesse):
    bild = Image.open(os.path.join(SYS, quelle)).convert('RGB').resize((groesse, groesse), Image.LANCZOS)
    ziel = os.path.join(ZIEL, name + '.jpg')
    bild.save(ziel, 'JPEG', quality=86, optimize=True, progressive=True)
    return ziel


for ton, (mann, frau) in HAUT.items():
    for kurz, quelle in (('m', mann), ('w', frau)):
        print(speichere_jpg(quelle, f'haut-{kurz}-{ton}', 1024))
print(speichere_jpg('eyes/materials/brownlight_eye.png', 'augen', 256))   # »brown« wirkt im Licht rötlich

for name, (quelle, groesse) in ALPHA.items():
    bild = Image.open(os.path.join(SYS, quelle)).convert('RGBA').resize((groesse, groesse), Image.LANCZOS)
    ziel = os.path.join(ZIEL, name + '.png')
    # Palette mit Alpha: Haare sind am Handy klein, 8 Bit reichen und sparen ~80 % Ladezeit
    bild.quantize(256, method=Image.Quantize.FASTOCTREE).save(ziel, 'PNG', optimize=True)
    print(ziel)

for datei in sorted(os.listdir(ZIEL)):
    print(f'{datei:24s} {os.path.getsize(os.path.join(ZIEL, datei)) // 1024:6d} KB')
