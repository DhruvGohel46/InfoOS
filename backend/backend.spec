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
datas = []

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
