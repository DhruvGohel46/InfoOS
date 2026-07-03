# -*- mode: python ; coding: utf-8 -*-

from PyInstaller.utils.hooks import collect_submodules, collect_data_files, collect_all

block_cipher = None

# Collect hidden imports
hidden_imports = [
    'engineio.async_drivers.threading',
    'flask_cors',
    'PIL',
    'pandas',
    'openpyxl',
    'schedule',
    'win32print', 
    'win32api',
    'win32ui',
    'pywintypes'
]

binaries = []
datas = [('migrations', 'migrations'), ('data/Sound', 'Sound')]

# Copy pywin32 system DLLs to target directory to fix import errors in production build
import os
import sys

pywin32_dirs = []

# 1. Check virtual env
venv_base = os.path.join(os.getcwd(), '.venv')
if not os.path.exists(venv_base):
    venv_base = os.path.join(os.path.dirname(os.getcwd()), '.venv')
pywin32_dirs.append(os.path.join(venv_base, 'Lib', 'site-packages', 'pywin32_system32'))

# 2. Check sys.prefix (global python)
pywin32_dirs.append(os.path.join(sys.prefix, 'Lib', 'site-packages', 'pywin32_system32'))

for d in pywin32_dirs:
    if os.path.exists(d):
        for f in os.listdir(d):
            if f.endswith('.dll'):
                binaries.append((os.path.join(d, f), '.'))
        break

# Collect all files for heavy ML libraries
datas_onnx, binaries_onnx, hiddenimports_onnx = collect_all('onnxruntime')
hidden_imports += hiddenimports_onnx
datas += datas_onnx
binaries += binaries_onnx

datas_rembg, binaries_rembg, hiddenimports_rembg = collect_all('rembg')
hidden_imports += hiddenimports_rembg
datas += datas_rembg
binaries += binaries_rembg

a = Analysis(
    ['app.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='backend',
)

# Post-build copy to ensure pywin32 DLLs are in the root of _internal directory for successful import
import shutil

dist_dir = os.path.join('dist', 'backend')
dist_internal = os.path.join(dist_dir, '_internal')

for target_dir in [dist_dir, dist_internal]:
    if os.path.exists(target_dir):
        for d in pywin32_dirs:
            if os.path.exists(d):
                for f in os.listdir(d):
                    if f.endswith('.dll'):
                        src_path = os.path.join(d, f)
                        dest_path = os.path.join(target_dir, f)
                        print(f"[Spec] Post-build copy: {src_path} -> {dest_path}")
                        shutil.copy2(src_path, dest_path)
