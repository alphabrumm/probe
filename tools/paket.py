#!/usr/bin/env python3
"""Stellt das Webspace-Paket zusammen: python3 tools/paket.py OUT_DIR [VERSION] [--zip DATEI.zip]

Hängt an alle lokalen .js/.css-Verweise ?v=VERSION an, damit Browser (vor allem Safari auf dem iPad)
nach einem Update nie eine alte Datei aus dem Zwischenspeicher mit einer neuen mischen.
Der Datenordner data/ und config.local.php kommen nie ins Paket."""
import os, re, shutil, subprocess, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = ['index.html', 'editor.html', 'lv.html', 's.html', 'e.html', 'c.html', 'u.html', 'play.html', 'l.html', 'api.php', 'drop.php', 'manifest.webmanifest', '.htaccess']
DIRS = ['app', 'intern', 'apps']
VENDOR = ['core', 'fonts']
# from './x.js'  ·  import('./x.js')  ·  src="app/x.js"  ·  href="app/x.css"  (nur relative Pfade, ohne vorhandenes ?)
REF = re.compile(r"""((?:\bfrom\s*|\bimport\s*\(\s*|\b(?:src|href)=)(['"]))((?![a-z]+:|/)[^'"?#\s]+\.(?:js|css))(\2)""")


def stamp(text, v):
    return REF.sub(lambda m: f'{m.group(1)}{m.group(3)}?v={v}{m.group(4)}', text)


def main():
    args = [a for a in sys.argv[1:] if a != '--zip']
    zipname = None
    if '--zip' in sys.argv:
        zipname = sys.argv[sys.argv.index('--zip') + 1]
        args.remove(zipname)
    out = os.path.abspath(args[0])
    v = args[1] if len(args) > 1 else subprocess.run(['git', '-C', ROOT, 'rev-parse', '--short=7', 'HEAD'], capture_output=True, text=True).stdout.strip() or 'dev'
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out)
    for f in FILES:
        shutil.copy2(os.path.join(ROOT, f), out)
    for d in DIRS:
        shutil.copytree(os.path.join(ROOT, d), os.path.join(out, d))
    for d in VENDOR:
        shutil.copytree(os.path.join(ROOT, 'vendor/pathfinder', d), os.path.join(out, 'vendor/pathfinder', d))
    for p in ['data', 'config.local.php', 'intern/config.local.php']:
        assert not os.path.exists(os.path.join(out, p)), p
    n = 0
    for base, _, names in os.walk(out):
        if os.sep + 'vendor' in base:
            continue  # PathFinder selbst bleibt unverändert; seine Dateien schützt der Cache-Header in .htaccess
        for name in names:
            if name.endswith(('.html', '.js')):
                p = os.path.join(base, name)
                with open(p, encoding='utf-8') as fh:
                    t = fh.read()
                s = stamp(t, v)
                if s != t:
                    n += 1
                    with open(p, 'w', encoding='utf-8') as fh:
                        fh.write(s)
    with open(os.path.join(out, 'app', 'version.txt'), 'w') as fh:
        fh.write(f'Version: {v}\n')
    print(f'Paket in {out}, Version {v}, {n} Dateien gestempelt')
    if zipname:
        zipname = os.path.abspath(zipname)
        if os.path.exists(zipname):
            os.remove(zipname)
        with zipfile.ZipFile(zipname, 'w', zipfile.ZIP_DEFLATED) as z:
            for base, _, names in os.walk(out):
                for name in sorted(names):
                    p = os.path.join(base, name)
                    z.write(p, os.path.relpath(p, out))
        print(f'Zip: {zipname}')


if __name__ == '__main__':
    main()
