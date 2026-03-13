'use strict';

const {
  app, BrowserWindow, ipcMain, session,
  Tray, Menu, nativeImage, shell, Notification,
} = require('electron');
const { autoUpdater } = require('electron-updater');
const { globalShortcut } = require('electron');
const path = require('path');
const fs   = require('fs');

// ── Constants ─────────────────────────────────────────────────────────────────
const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');
const THEMES_DIR  = path.join(app.getPath('userData'), 'themes');
const ADDONS_DIR   = path.join(app.getPath('userData'), 'addons');
const SPLASHES_DIR = path.join(app.getPath('userData'), 'splashes');


const ICON_ICO   = path.join(__dirname, 'icon.ico');
const ICON_PNG   = path.join(__dirname, 'icon.png');

// ── Globals ───────────────────────────────────────────────────────────────────
let win  = null;
let tray = null;

// ══════════════════════════════════════════════════════════════════════════════
// WINDOW STATE
// ══════════════════════════════════════════════════════════════════════════════
function loadWindowState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { width: 1280, height: 800, x: undefined, y: undefined }; }
}

function saveWindowState(w) {
  if (w.isMaximized() || w.isMinimized()) return;
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(w.getBounds())); } catch {}
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN WINDOW
// ══════════════════════════════════════════════════════════════════════════════
function createWindow() {
  const state = loadWindowState();

  win = new BrowserWindow({
    width:     state.width  || 1280,
    height:    state.height || 800,
    x:         state.x,
    y:         state.y,
    frame:     false,
    resizable: true,
    minWidth:  400,
    minHeight: 300,
    show:      false,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      nodeIntegration:  false,
      contextIsolation: true,
      webviewTag:       true,
    },
  });

  win.loadFile('overlay.html');
  win.once('ready-to-show', () => win.show());
  win.on('resize', () => saveWindowState(win));
  win.on('move',   () => saveWindowState(win));




  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
      if (process.platform === 'darwin') app.dock.hide();
    }
  });

  // Auto-updater events
  autoUpdater.checkForUpdates().catch(() => {});
  autoUpdater.on('update-available',     ()     => win.webContents.send('update-status', 'available'));
  autoUpdater.on('update-not-available', ()     => win.webContents.send('update-status', 'uptodate'));
  autoUpdater.on('download-progress',    (info) => win.webContents.send('update-status', 'downloading', Math.floor(info.percent)));
  autoUpdater.on('update-downloaded',    ()     => win.webContents.send('update-status', 'ready'));
  autoUpdater.on('error',                ()     => win.webContents.send('update-status', 'error'));

  createTray();
}

// ══════════════════════════════════════════════════════════════════════════════
// TRAY
// ══════════════════════════════════════════════════════════════════════════════
function createTray() {
  const iconFile = fs.existsSync(ICON_ICO) ? ICON_ICO
                 : fs.existsSync(ICON_PNG) ? ICON_PNG
                 : null;
  const img = iconFile
    ? nativeImage.createFromPath(iconFile).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  tray = new Tray(img);
  tray.setToolTip('Entropy Client');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Entropy Client', click: () => { win.show(); win.focus(); } },
    { type: 'separator' },
    { label: 'Check for updates',   click: () => { win.show(); autoUpdater.checkForUpdates().catch(() => {}); } },
    { type: 'separator' },
    { label: 'Quit',                click: () => { app.isQuitting = true; app.quit(); } },
  ]));
  tray.on('double-click', () => { win.show(); win.focus(); });
}

// ══════════════════════════════════════════════════════════════════════════════
// THEMES FOLDER
// ══════════════════════════════════════════════════════════════════════════════
// ── Embedded default addon sources (hex-encoded, no escaping issues) ────────
const DEFAULT_ADDONS = [
  { filename: "hide-members.js", hex: '2f2f20456e74726f707920436c69656e74204164646f6e0a6164646f6e5265676973746572287b0a202069643a2027686964652d6d656d62657273272c0a202069636f6e3a2027f09f91a5272c0a20206e616d653a202748696465204d656d626572204c697374272c0a2020646573633a2027436f6c6c6170736573207468652072696768742d73696465206d656d626572732070616e656c2e272c0a202063617465676f72793a202756697375616c272c0a20206373733a20275b636c6173732a3d226d656d626572732d73696465626172225d2c5b636c6173732a3d224d656d6265727353696465626172225d2c5b636c6173732a3d226d656d6265722d6c697374225d2c5b636c6173732a3d224d656d6265724c697374225d2c5b636c6173732a3d2275736572732d73696465626172225d2c5b636c6173732a3d22557365727353696465626172225d2c5b636c6173732a3d22726967687450616e656c225d2c5b636c6173732a3d2272696768742d70616e656c225d2c5b646174612d7465737469642a3d226d656d626572225d2c5b646174612d7465737469642a3d227573657273225d2c5b636c6173732a3d226368616e6e656c4d656d62657273225d7b646973706c61793a6e6f6e6521696d706f7274616e747d272c0a7d293b0a' },
  { filename: "custom-font.js", hex: '2f2f20456e74726f707920436c69656e74204164646f6e0a6164646f6e5265676973746572287b0a202069643a2027637573746f6d2d666f6e74272c0a202069636f6e3a2027f09f94a4272c0a20206e616d653a2027437573746f6d204d65737361676520466f6e74272c0a2020646573633a20274170706c696573206120637573746f6d20666f6e7420746f2063686174206d657373616765732e272c0a202063617465676f72793a202756697375616c272c0a20206373733a20605b636c6173732a3d226d6573736167652d636f6e74656e74225d2c5b636c6173732a3d224d657373616765436f6e74656e74225d2c5b636c6173732a3d22636861742d6d657373616765225d7b666f6e742d66616d696c793a274a6574427261696e73204d6f6e6f272c274669726120436f6465272c6d6f6e6f737061636521696d706f7274616e747d602c0a7d293b0a' },
  { filename: "markdown-preview.js", hex: '2f2f20456e74726f707920436c69656e74204164646f6e0a6164646f6e5265676973746572287b0a202069643a20276d61726b646f776e2d70726576696577272c0a202069636f6e3a2027e29c8defb88f272c0a20206e616d653a20274d61726b646f776e2050726576696577272c0a2020646573633a202752656e64657273202a2a626f6c642a2a2c202a6974616c69632a20616e642060636f646560206c69766520617320796f7520747970652e272c0a202063617465676f72793a202743686174272c0a20207363726970743a20602866756e6374696f6e28297b69662877696e646f772e5f5f65634d64502972657475726e3b77696e646f772e5f5f65634d64503d747275653b76617220703d646f63756d656e742e637265617465456c656d656e74282764697627293b702e7374796c652e637373546578743d27706f736974696f6e3a66697865643b626f74746f6d3a383070783b6c6566743a3530253b7472616e73666f726d3a7472616e736c61746558282d353025293b6261636b67726f756e643a726762612831382c31382c32342c302e3937293b626f726465723a31707820736f6c69642072676261283235352c3130372c302c302e3235293b626f726465722d7261646975733a313070783b70616464696e673a3130707820313670783b666f6e742d73697a653a313370783b636f6c6f723a236363633b6d61782d77696474683a35323070783b706f696e7465722d6576656e74733a6e6f6e653b7a2d696e6465783a39393939393b646973706c61793a6e6f6e653b273b646f63756d656e742e626f64792e617070656e644368696c642870293b66756e6374696f6e206d642874297b72657475726e20742e7265706c616365282f262f672c2726616d703b27292e7265706c616365282f3c2f672c27266c743b27292e7265706c616365282f5b2a5d5b2a5d282e2b3f295b2a5d5b2a5d2f672c273c7374726f6e673e24313c2f7374726f6e673e27292e7265706c616365282f5b2a5d282e2b3f295b2a5d2f672c273c656d3e24313c2f656d3e27293b7d77696e646f772e5f5f65634d64543d736574496e74657276616c2866756e6374696f6e28297b7661722074613d646f63756d656e742e717565727953656c6563746f722827746578746172656127293b6966287461262674612e76616c7565297b702e696e6e657248544d4c3d6d642874612e76616c7565293b702e7374796c652e646973706c61793d27626c6f636b273b7d656c73657b702e7374796c652e646973706c61793d276e6f6e65273b7d7d2c333030293b77696e646f772e5f5f65634d644f66663d66756e6374696f6e28297b636c656172496e74657276616c2877696e646f772e5f5f65634d6454293b702e72656d6f766528293b77696e646f772e5f5f65634d64503d66616c73653b7d3b7d2928293b602c0a20206f6e44697361626c653a206069662877696e646f772e5f5f65634d644f66662977696e646f772e5f5f65634d644f666628293b602c0a7d293b0a' },
  { filename: "typing-sound.js", hex: '2f2f20456e74726f707920436c69656e74204164646f6e0a6164646f6e5265676973746572287b0a202069643a2027747970696e672d736f756e64272c0a202069636f6e3a2027e28ca8efb88f272c0a20206e616d653a2027547970696e6720536f756e64272c0a2020646573633a2027506c617973206120737562746c6520636c69636b20736f756e6420617320796f7520747970652e272c0a202063617465676f72793a202746756e272c0a20207363726970743a20602866756e6374696f6e28297b69662877696e646f772e5f5f656354532972657475726e3b77696e646f772e5f5f656354533d747275653b76617220633d6e65772877696e646f772e417564696f436f6e746578747c7c77696e646f772e7765626b6974417564696f436f6e746578742928293b66756e6374696f6e206b28297b766172206f3d632e6372656174654f7363696c6c61746f7228292c673d632e6372656174654761696e28293b6f2e636f6e6e6563742867293b672e636f6e6e65637428632e64657374696e6174696f6e293b6f2e6672657175656e63792e76616c75653d313230302b4d6174682e72616e646f6d28292a3430303b6f2e747970653d27737175617265273b672e6761696e2e73657456616c7565417454696d6528302e30342c632e63757272656e7454696d65293b672e6761696e2e6578706f6e656e7469616c52616d70546f56616c7565417454696d6528302e303030312c632e63757272656e7454696d652b302e3034293b6f2e737461727428293b6f2e73746f7028632e63757272656e7454696d652b302e3034293b7d66756e6374696f6e20682865297b696628652e6b6579262628652e6b65792e6c656e6774683d3d3d317c7c652e6b65793d3d3d274261636b73706163652729296b28293b7d646f63756d656e742e6164644576656e744c697374656e657228276b6579646f776e272c682c74727565293b77696e646f772e5f5f656354534f66663d66756e6374696f6e28297b646f63756d656e742e72656d6f76654576656e744c697374656e657228276b6579646f776e272c682c74727565293b77696e646f772e5f5f656354533d66616c73653b7d3b7d2928293b602c0a20206f6e44697361626c653a206069662877696e646f772e5f5f656354534f66662977696e646f772e5f5f656354534f666628293b602c0a7d293b0a' },
  { filename: "message-sound.js", hex: '2f2f20456e74726f707920436c69656e74204164646f6e0a6164646f6e5265676973746572287b0a202069643a20276d6573736167652d736f756e64272c0a202069636f6e3a2027f09f9494272c0a20206e616d653a20274d65737361676520536f756e64272c0a2020646573633a2027506c617973206120736f6674206368696d65207768656e2061206e6577206d65737361676520617272697665732e272c0a202063617465676f72793a202746756e272c0a20207363726970743a20602866756e6374696f6e28297b69662877696e646f772e5f5f65634d532972657475726e3b77696e646f772e5f5f65634d533d747275653b76617220633d6e65772877696e646f772e417564696f436f6e746578747c7c77696e646f772e7765626b6974417564696f436f6e746578742928293b66756e6374696f6e20636828297b5b3532332c3635392c3738345d2e666f72456163682866756e6374696f6e28662c69297b766172206f3d632e6372656174654f7363696c6c61746f7228292c673d632e6372656174654761696e28293b6f2e636f6e6e6563742867293b672e636f6e6e65637428632e64657374696e6174696f6e293b6f2e6672657175656e63792e76616c75653d663b76617220743d632e63757272656e7454696d652b692a302e31323b672e6761696e2e73657456616c7565417454696d6528302c74293b672e6761696e2e6c696e65617252616d70546f56616c7565417454696d6528302e30382c742b302e3032293b672e6761696e2e6578706f6e656e7469616c52616d70546f56616c7565417454696d6528302e303030312c742b302e3335293b6f2e73746172742874293b6f2e73746f7028742b302e3335293b7d293b7d766172206f623d6e6577204d75746174696f6e4f627365727665722866756e6374696f6e286d73297b6d732e666f72456163682866756e6374696f6e286d297b6d2e61646465644e6f6465732e666f72456163682866756e6374696f6e286e297b6966286e2e6e6f6465547970653d3d3d312626286e2e6461746173657426266e2e646174617365742e6d65737361676549642929636828293b7d293b7d293b7d293b6f622e6f62736572766528646f63756d656e742e626f64792c7b6368696c644c6973743a747275652c737562747265653a747275657d293b77696e646f772e5f5f65634d534f66663d66756e6374696f6e28297b6f622e646973636f6e6e65637428293b77696e646f772e5f5f65634d533d66616c73653b7d3b7d2928293b602c0a20206f6e44697361626c653a206069662877696e646f772e5f5f65634d534f66662977696e646f772e5f5f65634d534f666628293b602c0a7d293b0a' },
];

function ensureAddonsFolder() {
  if (!fs.existsSync(ADDONS_DIR)) fs.mkdirSync(ADDONS_DIR, { recursive: true });
  // Write bundled addons — always overwrite if they're the old module.exports format
  DEFAULT_ADDONS.forEach(({ filename, hex }) => {
    const dest = path.join(ADDONS_DIR, filename);
    let shouldWrite = !fs.existsSync(dest);
    if (!shouldWrite) {
      try {
        const existing = fs.readFileSync(dest, 'utf8');
        // Overwrite if it's the old module.exports format (v1) — upgrade to v2
        if (existing.includes('module.exports')) shouldWrite = true;
      } catch(e) { shouldWrite = true; }
    }
    if (shouldWrite) {
      try { fs.writeFileSync(dest, Buffer.from(hex, 'hex')); } catch(e) {}
    }
  });
}

function ensureThemesFolder() {
  if (!fs.existsSync(THEMES_DIR)) fs.mkdirSync(THEMES_DIR, { recursive: true });

  const write = (filename, content) => {
    const dest = path.join(THEMES_DIR, filename);
    if (!fs.existsSync(dest)) fs.writeFileSync(dest, content, 'utf8');
  };

  write('ember.css', [
    '/* @name Ember',
    '   @description A warm red-orange theme with four variations */',
    '',
    '/* Root-Tokens */',
    ':root, .dark, [data-theme="dark"], body {',
    '  /* Backgrounds */',
    '  --background:               20 100% 5%  !important;',
    '  --layout-chat:              20 100% 5%  !important;',
    '  --layout-sidebar:           20 100% 3%  !important;',
    '  --layout-members:           20 100% 3%  !important;',
    '  --layout-sidebar-secondary: 20 100% 3%  !important;',
    '  /* Surfaces & Containers */',
    '  --card:                     20 100% 7%  !important;',
    '  --popover:                  20 100% 7%  !important;',
    '  --secondary:                20 60%  12% !important;',
    '  --muted:                    20 80%  8%  !important;',
    '  /* Borders & Inputs */',
    '  --border:                   16 80%  18% !important;',
    '  --input:                    16 80%  18% !important;',
    '  --ring:                     16 100% 50% !important;',
    '  /* Text */',
    '  --foreground:               22 100% 85% !important;',
    '  --card-foreground:          22 100% 85% !important;',
    '  --popover-foreground:       22 100% 85% !important;',
    '  --secondary-foreground:     32 100% 70% !important;',
    '  --muted-foreground:         20 60%  50% !important;',
    '  /* Primary & Accent */',
    '  --primary:                  16 100% 50% !important;',
    '  --primary-foreground:       20 100% 5%  !important;',
    '  --accent:                   16 100% 12% !important;',
    '  --accent-foreground:        16 100% 60% !important;',
    '}',
    '',
    '/* Root-Layout */',
    '.bg-layout-sidebar, .bg-layout-members {',
    '  background-color: hsl(20, 100%, 3%) !important;',
    '}',
    '.bg-layout-chat, .bg-background {',
    '  background-color: hsl(20, 100%, 5%) !important;',
    '}',
    '.bg-layout-sidebar-secondary {',
    '  background-color: hsl(20, 100%, 3%) !important;',
    '}',
    '.bg-background\/20, .bg-muted\/60, .bg-background\/50, .bg-background\/70 {',
    '  background-color: hsl(20, 100%, 3%) !important;',
    '  border-color: hsl(16, 80%, 18%) !important;',
    '}',
    '[data-resize-handle]::after { background-color: hsl(16, 80%, 18%) !important; }',
    '[data-resize-handle]:hover { background-color: hsla(16, 100%, 50%, 0.4) !important; }',
    '::-webkit-scrollbar-thumb { background-color: hsl(16, 60%, 25%) !important; border-radius: 10px; }',
    '::-webkit-scrollbar-thumb:hover { background-color: hsl(16, 100%, 50%) !important; }',
    '::-webkit-scrollbar-track { background-color: transparent !important; }',
    '',
    '/* Root-Colors */',
    ':root {',
    '  --primary:   #ff4400;',
    '  --secondary: #ff8800;',
    '  --hover:     #ff6622;',
    '  --green:     #44cc66;',
    '  --yellow:    #ffcc00;',
    '  --red:       #ff3333;',
    '  --link:      #ff6600;',
    '  --live:      #ff4400;',
    '  --offline:   #884400;',
    '}',
    '',
    '/* Root-Background */',
    'html, body, #root,',
    '.flex-1.h-full.bg-layout-chat.overflow-y-auto.w-full.flex.items-center.justify-center.relative.min-h-0.py-3 {',
    '  background: #1a0800 !important;',
    '}',
    '',
    '/* Root-DMBackground */',
    '[class*="bg-layout-chat"] { background: #1a0800 !important; }',
    '',
    '/* Root-ChannelsBG */',
    '[class*="bg-layout-sidebar-secondary"] { background: #110500 !important; }',
    '',
    '/* Root-Channels */',
    '[class*="channel"] { color: var(--secondary) !important; }',
    '[class*="channel"]:hover { color: var(--primary) !important; }',
    '',
    '/* Root-ChannelText */',
    '[class*="message"], [class*="content"] { color: #ffd0b0 !important; font-weight: 400; }',
    'h1, h2, h3 { color: var(--primary) !important; }',
    'a { color: var(--link) !important; }',
    '',
    '/* Root-ChannelText-BG */',
    '[class*="bg-background"] { background: #1a0800 !important; }',
    '',
    '/* Root-MembersBG */',
    '[class*="bg-layout-members"] { background: #110500 !important; }',
    '',
    '/* Root-UsernameColor */',
    '.text-sm.font-medium.text-foreground.truncate {',
    '  background: linear-gradient(135deg, #ff8800, #ff4400) !important;',
    '  -webkit-background-clip: text !important;',
    '  -webkit-text-fill-color: transparent !important;',
    '  color: transparent !important;',
    '  display: inline-block !important;',
    '}',
    '',
    '/* Theme-Light */',
    ':root, .dark, [data-theme="dark"], body {',
    '  --background:               22 100% 97% !important;',
    '  --layout-chat:              22 100% 97% !important;',
    '  --layout-sidebar:           22 80%  92% !important;',
    '  --layout-members:           22 80%  92% !important;',
    '  --layout-sidebar-secondary: 22 80%  89% !important;',
    '  --foreground:               20 100% 15% !important;',
    '  --card-foreground:          20 100% 15% !important;',
    '  --muted-foreground:         20 40%  40% !important;',
    '}',
    'html, body { background: #fff5f0 !important; color: #331100 !important; }',
    '.bg-layout-sidebar, .bg-layout-members { background-color: hsl(22, 80%, 92%) !important; }',
    '.bg-layout-chat, .bg-background { background-color: hsl(22, 100%, 97%) !important; }',
    '.bg-layout-sidebar-secondary { background-color: hsl(22, 80%, 89%) !important; }',
    '[class*="sidebar"] { background: #ffe8d8 !important; }',
    '[class*="bg-layout-members"] { background: #f5d0b8 !important; }',
    '[class*="bg-layout-sidebar-secondary"] { background: #ffe0cc !important; }',
    '[class*="bg-background"] { background: #fff5f0 !important; }',
    '.text-sm.font-medium.text-foreground.truncate { color: #331100 !important; -webkit-text-fill-color: #331100 !important; background: none !important; }',
    '',
    '/* Theme-Dark */',
    ':root, .dark, [data-theme="dark"], body {',
    '  --background:               20 100% 5%  !important;',
    '  --layout-chat:              20 100% 5%  !important;',
    '  --layout-sidebar:           20 100% 3%  !important;',
    '  --layout-members:           20 100% 3%  !important;',
    '  --layout-sidebar-secondary: 20 100% 3%  !important;',
    '  --foreground:               22 100% 85% !important;',
    '}',
    'html, body { background: #1a0800 !important; color: #ffd0b0 !important; }',
    '.bg-layout-sidebar, .bg-layout-members { background-color: hsl(20, 100%, 3%) !important; }',
    '.bg-layout-chat, .bg-background { background-color: hsl(20, 100%, 5%) !important; }',
    '[class*="sidebar"] { background: #110500 !important; }',
    '',
    '/* Theme-Darker */',
    ':root, .dark, [data-theme="dark"], body {',
    '  --background:               20 100% 3%  !important;',
    '  --layout-chat:              20 100% 3%  !important;',
    '  --layout-sidebar:           20 100% 2%  !important;',
    '  --layout-members:           20 100% 2%  !important;',
    '  --layout-sidebar-secondary: 20 100% 2%  !important;',
    '  --foreground:               22 100% 75% !important;',
    '}',
    'html, body { background: #0d0400 !important; color: #ffc090 !important; }',
    '.bg-layout-sidebar, .bg-layout-members { background-color: hsl(20, 100%, 2%) !important; }',
    '.bg-layout-chat, .bg-background { background-color: hsl(20, 100%, 3%) !important; }',
    '[class*="sidebar"] { background: #080200 !important; }',
    '',
    '/* Theme-Midnight */',
    ':root, .dark, [data-theme="dark"], body {',
    '  --background:               0 0% 0%    !important;',
    '  --layout-chat:              0 0% 0%    !important;',
    '  --layout-sidebar:           20 100% 1% !important;',
    '  --layout-members:           20 100% 1% !important;',
    '  --layout-sidebar-secondary: 20 100% 1% !important;',
    '  --foreground:               22 100% 60% !important;',
    '}',
    'html, body { background: #000000 !important; color: #ff8844 !important; }',
    '.bg-layout-sidebar, .bg-layout-members { background-color: hsl(20, 100%, 1%) !important; }',
    '.bg-layout-chat, .bg-background { background-color: hsl(0, 0%, 0%) !important; }',
    '[class*="sidebar"] { background: #080300 !important; }',
  ].join('\n'));

  write('sapphire.css', [
    '/* @name Sapphire',
    '   @description A cool blue theme with four variations */',
    '',
    '/* Root-Tokens */',
    ':root, .dark, [data-theme="dark"], body {',
    '  /* Backgrounds */',
    '  --background:               214 80% 7%  !important;',
    '  --layout-chat:              214 80% 7%  !important;',
    '  --layout-sidebar:           214 80% 5%  !important;',
    '  --layout-members:           214 80% 5%  !important;',
    '  --layout-sidebar-secondary: 214 80% 5%  !important;',
    '  /* Surfaces & Containers */',
    '  --card:                     214 80% 9%  !important;',
    '  --popover:                  214 80% 9%  !important;',
    '  --secondary:                214 40% 14% !important;',
    '  --muted:                    214 60% 10% !important;',
    '  /* Borders & Inputs */',
    '  --border:                   214 60% 20% !important;',
    '  --input:                    214 60% 20% !important;',
    '  --ring:                     217 91% 60% !important;',
    '  /* Text */',
    '  --foreground:               199 95% 86% !important;',
    '  --card-foreground:          199 95% 86% !important;',
    '  --popover-foreground:       199 95% 86% !important;',
    '  --secondary-foreground:     213 100% 75% !important;',
    '  --muted-foreground:         214 40% 55% !important;',
    '  /* Primary & Accent */',
    '  --primary:                  217 91% 60% !important;',
    '  --primary-foreground:       214 80% 5%  !important;',
    '  --accent:                   214 80% 14% !important;',
    '  --accent-foreground:        199 95% 60% !important;',
    '}',
    '',
    '/* Root-Layout */',
    '.bg-layout-sidebar, .bg-layout-members {',
    '  background-color: hsl(214, 80%, 5%) !important;',
    '}',
    '.bg-layout-chat, .bg-background {',
    '  background-color: hsl(214, 80%, 7%) !important;',
    '}',
    '.bg-layout-sidebar-secondary {',
    '  background-color: hsl(214, 80%, 5%) !important;',
    '}',
    '.bg-background\/20, .bg-muted\/60, .bg-background\/50, .bg-background\/70 {',
    '  background-color: hsl(214, 80%, 5%) !important;',
    '  border-color: hsl(214, 60%, 20%) !important;',
    '}',
    '[data-resize-handle]::after { background-color: hsl(214, 60%, 20%) !important; }',
    '[data-resize-handle]:hover { background-color: hsla(217, 91%, 60%, 0.4) !important; }',
    '::-webkit-scrollbar-thumb { background-color: hsl(214, 50%, 22%) !important; border-radius: 10px; }',
    '::-webkit-scrollbar-thumb:hover { background-color: hsl(217, 91%, 60%) !important; }',
    '::-webkit-scrollbar-track { background-color: transparent !important; }',
    '',
    '/* Root-Colors */',
    ':root {',
    '  --primary:   #3b82f6;',
    '  --secondary: #60a5fa;',
    '  --hover:     #2563eb;',
    '  --green:     #22c55e;',
    '  --yellow:    #eab308;',
    '  --red:       #ef4444;',
    '  --link:      #60a5fa;',
    '  --live:      #3b82f6;',
    '  --offline:   #1e3a5f;',
    '}',
    '',
    '/* Root-Background */',
    'html, body, #root,',
    '.flex-1.h-full.bg-layout-chat.overflow-y-auto.w-full.flex.items-center.justify-center.relative.min-h-0.py-3 {',
    '  background: #040e1e !important;',
    '}',
    '',
    '/* Root-DMBackground */',
    '[class*="bg-layout-chat"] { background: #040e1e !important; }',
    '',
    '/* Root-ChannelsBG */',
    '[class*="bg-layout-sidebar-secondary"] { background: #020a14 !important; }',
    '',
    '/* Root-Channels */',
    '[class*="channel"] { color: var(--secondary) !important; }',
    '[class*="channel"]:hover { color: var(--primary) !important; }',
    '',
    '/* Root-ChannelText */',
    '[class*="message"], [class*="content"] { color: #bae6fd !important; }',
    'a { color: var(--link) !important; }',
    '',
    '/* Root-ChannelText-BG */',
    '[class*="bg-background"] { background: #040e1e !important; }',
    '',
    '/* Root-MembersBG */',
    '[class*="bg-layout-members"] { background: #020a14 !important; }',
    '',
    '/* Root-UsernameColor */',
    '.text-sm.font-medium.text-foreground.truncate {',
    '  background: linear-gradient(135deg, #a8edea, #fed6e3) !important;',
    '  -webkit-background-clip: text !important;',
    '  -webkit-text-fill-color: transparent !important;',
    '  color: transparent !important;',
    '  display: inline-block !important;',
    '}',
    '',
    '/* Theme-Light */',
    ':root, .dark, [data-theme="dark"], body {',
    '  --background:               214 80% 98% !important;',
    '  --layout-chat:              214 80% 98% !important;',
    '  --layout-sidebar:           214 60% 92% !important;',
    '  --layout-members:           214 60% 92% !important;',
    '  --layout-sidebar-secondary: 214 60% 89% !important;',
    '  --foreground:               214 80% 15% !important;',
    '  --card-foreground:          214 80% 15% !important;',
    '  --muted-foreground:         214 30% 40% !important;',
    '}',
    'html, body { background: #eff6ff !important; color: #1e3a5f !important; }',
    '.bg-layout-sidebar, .bg-layout-members { background-color: hsl(214, 60%, 92%) !important; }',
    '.bg-layout-chat, .bg-background { background-color: hsl(214, 80%, 98%) !important; }',
    '.bg-layout-sidebar-secondary { background-color: hsl(214, 60%, 89%) !important; }',
    '[class*="sidebar"] { background: #dbeafe !important; }',
    '[class*="bg-layout-members"] { background: #bfdbfe !important; }',
    '[class*="bg-layout-sidebar-secondary"] { background: #dbeafe !important; }',
    '[class*="bg-background"] { background: #eff6ff !important; }',
    '.text-sm.font-medium.text-foreground.truncate { color: #1e3a5f !important; -webkit-text-fill-color: #1e3a5f !important; background: none !important; }',
    '',
    '/* Theme-Dark */',
    ':root, .dark, [data-theme="dark"], body {',
    '  --background:               214 80% 7%  !important;',
    '  --layout-chat:              214 80% 7%  !important;',
    '  --layout-sidebar:           214 80% 5%  !important;',
    '  --layout-members:           214 80% 5%  !important;',
    '  --layout-sidebar-secondary: 214 80% 5%  !important;',
    '  --foreground:               199 95% 86% !important;',
    '}',
    'html, body { background: #040e1e !important; color: #bae6fd !important; }',
    '.bg-layout-sidebar, .bg-layout-members { background-color: hsl(214, 80%, 5%) !important; }',
    '.bg-layout-chat, .bg-background { background-color: hsl(214, 80%, 7%) !important; }',
    '[class*="sidebar"] { background: #020a14 !important; }',
    '',
    '/* Theme-Darker */',
    ':root, .dark, [data-theme="dark"], body {',
    '  --background:               214 80% 4%  !important;',
    '  --layout-chat:              214 80% 4%  !important;',
    '  --layout-sidebar:           214 80% 2%  !important;',
    '  --layout-members:           214 80% 2%  !important;',
    '  --layout-sidebar-secondary: 214 80% 2%  !important;',
    '  --foreground:               199 80% 74% !important;',
    '}',
    'html, body { background: #020810 !important; color: #93c5fd !important; }',
    '.bg-layout-sidebar, .bg-layout-members { background-color: hsl(214, 80%, 2%) !important; }',
    '.bg-layout-chat, .bg-background { background-color: hsl(214, 80%, 4%) !important; }',
    '[class*="sidebar"] { background: #010508 !important; }',
    '',
    '/* Theme-Midnight */',
    ':root, .dark, [data-theme="dark"], body {',
    '  --background:               0 0% 0%    !important;',
    '  --layout-chat:              0 0% 0%    !important;',
    '  --layout-sidebar:           214 80% 1% !important;',
    '  --layout-members:           214 80% 1% !important;',
    '  --layout-sidebar-secondary: 214 80% 1% !important;',
    '  --foreground:               217 91% 60% !important;',
    '}',
    'html, body { background: #000000 !important; color: #60a5fa !important; }',
    '.bg-layout-sidebar, .bg-layout-members { background-color: hsl(214, 80%, 1%) !important; }',
    '.bg-layout-chat, .bg-background { background-color: hsl(0, 0%, 0%) !important; }',
    '[class*="sidebar"] { background: #020610 !important; }',
  ].join('\n'));

  write('cyberpunk.css', [
    '/* @name Cyberpunk',
    '   @description High-contrast neon cyan, hot pink, and yellow over a deep dark canvas. By Aster */',
    '',
    '/* Root-Tokens */',
    ':root, .dark, [data-theme="dark"], body {',
    '  /* Backgrounds */',
    '  --background: 240 11% 7% !important;',
    '  --layout-chat: 240 11% 7% !important;',
    '  --layout-sidebar: 240 11% 5% !important;',
    '  --layout-members: 240 11% 5% !important;',
    '  --layout-sidebar-secondary: 240 11% 5% !important;',
    '  /* Surfaces & Containers */',
    '  --card: 240 11% 10% !important;',
    '  --popover: 240 11% 10% !important;',
    '  --secondary: 320 30% 15% !important;',
    '  --muted: 240 11% 12% !important;',
    '  /* Borders & Inputs */',
    '  --border: 185 50% 20% !important;',
    '  --input: 185 50% 20% !important;',
    '  --ring: 320 100% 50% !important;',
    '  /* Text */',
    '  --foreground: 185 20% 90% !important;',
    '  --card-foreground: 185 20% 90% !important;',
    '  --popover-foreground: 185 20% 90% !important;',
    '  --secondary-foreground: 320 100% 75% !important;',
    '  --muted-foreground: 185 30% 50% !important;',
    '  /* Primary & Accent */',
    '  --primary: 55 100% 50% !important;',
    '  --primary-foreground: 240 11% 5% !important;',
    '  --accent: 185 100% 15% !important;',
    '  --accent-foreground: 185 100% 50% !important;',
    '}',
    '',
    '/* Root-Layout */',
    '.bg-layout-sidebar, .bg-layout-members {',
    '  background-color: hsl(240, 11%, 5%) !important;',
    '}',
    '.bg-layout-chat, .bg-background {',
    '  background-color: hsl(240, 11%, 7%) !important;',
    '}',
    '.bg-layout-sidebar-secondary {',
    '  background-color: hsl(240, 11%, 5%) !important;',
    '}',
    '.bg-background\\/20,',
    '.bg-muted\\/60,',
    '.bg-background\\/50,',
    '.bg-background\\/70 {',
    '  background-color: hsl(240, 11%, 5%) !important;',
    '  border-color: hsl(185, 50%, 20%) !important;',
    '}',
    '[data-resize-handle]::after {',
    '  background-color: hsl(185, 50%, 20%) !important;',
    '}',
    '[data-resize-handle]:hover,',
    '[data-resize-handle][data-resize-handle-state="drag"] {',
    '  background-color: hsla(320, 100%, 50%, 0.5) !important;',
    '}',
    'span[data-orientation="horizontal"]:not([dir]):not([role]) {',
    '  background-color: hsl(var(--secondary)) !important;',
    '}',
    'span[data-orientation="horizontal"]:not([dir]):not([role]) > span[data-orientation="horizontal"] {',
    '  background: hsl(var(--primary)) !important;',
    '}',
    'span[role="slider"][data-orientation="horizontal"] {',
    '  background-color: hsl(var(--background)) !important;',
    '  border-color: hsl(var(--primary)) !important;',
    '}',
    '::-webkit-scrollbar-thumb {',
    '  background-color: hsl(320, 50%, 30%) !important;',
    '  border-radius: 10px;',
    '}',
    '::-webkit-scrollbar-thumb:hover {',
    '  background-color: hsl(320, 100%, 50%) !important;',
    '}',
    '::-webkit-scrollbar-track {',
    '  background-color: transparent !important;',
    '}',
    '',
    '/* Root-UsernameColor */',
    '.text-sm.font-medium.text-foreground.truncate {',
    '  background: linear-gradient(135deg, hsl(185, 100%, 50%), hsl(320, 100%, 60%)) !important;',
    '  -webkit-background-clip: text !important;',
    '  -webkit-text-fill-color: transparent !important;',
    '  color: transparent !important;',
    '  display: inline-block !important;',
    '}',
    '',
    '/* Theme-Dark */',
    '/* Default dark — tokens above already define this */',
    '',
    '/* Theme-Midnight */',
    ':root, .dark, [data-theme="dark"], body {',
    '  --background: 240 11% 3% !important;',
    '  --layout-chat: 240 11% 3% !important;',
    '  --layout-sidebar: 240 11% 2% !important;',
    '  --layout-members: 240 11% 2% !important;',
    '  --layout-sidebar-secondary: 240 11% 2% !important;',
    '}',
    '.bg-layout-sidebar, .bg-layout-members { background-color: hsl(240, 11%, 2%) !important; }',
    '.bg-layout-chat, .bg-background { background-color: hsl(240, 11%, 3%) !important; }',
    '.bg-layout-sidebar-secondary { background-color: hsl(240, 11%, 2%) !important; }',
  ].join('\n'));

  write('README.txt', [
    'Entropy Client - Custom Themes',
    '================================',
    'Sections are marked with /* SectionName */ comments.',
    '',
    'ROOT sections (applied to every variation):',
    '  /* Root-Colors */      - :root CSS variables:',
    '                           --primary, --secondary, --hover,',
    '                           --green, --yellow, --red,',
    '                           --link, --live, --offline',
    '  /* Root-Background */  - page/layout backgrounds (url() images work here)',
    '  /* Root-DMBackground */ - DM area background (.bg-layout-chat) — defaults to Root-Background',
    '  /* Root-Channels */    - channel list text & colours',
    '  /* Root-ChannelsBG */    - channel sidebar background (.bg-layout-sidebar-secondary)',
    '  /* Root-ChannelText-BG */ - channel header/topbar background (.bg-background)',
    '  /* Root-ChannelText */ - message area: colour, font, weight, headings',
    '  /* Root-AccountText */   - account name text colour',
    '  /* Root-UsernameColor */ - gradient/colour effect on username text',
    '  /* Root-MembersBG */   - members panel background (.bg-layout-members)',
    '',
    'THEME variations (pick one in the popup):',
    '  /* Theme-Light */      - light mode',
    '  /* Theme-Dark */       - dark mode (default)',
    '  /* Theme-Darker */     - darker variant',
    '  /* Theme-Midnight */   - full black',
    '',
    'File metadata (optional, put at the very top):',
    '  /* @name My Theme',
    '     @description One line description */',
  ].join('\n'));

  // Write tutorial file if it doesn't exist
  if (!fs.existsSync(path.join(THEMES_DIR, 'TUTORIAL.txt'))) {
    const tutorialSrc = path.join(__dirname, 'TUTORIAL.txt');
    if (fs.existsSync(tutorialSrc)) {
      fs.copyFileSync(tutorialSrc, path.join(THEMES_DIR, 'TUTORIAL.txt'));
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// IPC HANDLERS
// ══════════════════════════════════════════════════════════════════════════════

// Window controls
ipcMain.on('win-minimize', (e) => BrowserWindow.fromWebContents(e.sender).minimize());
ipcMain.on('win-set-fullscreen', (_e, val) => { if (win) win.setFullScreen(val); });
ipcMain.on('win-maximize', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  w.isMaximized() ? w.unmaximize() : w.maximize();
});
ipcMain.on('win-close', () => { if (win) win.hide(); });

// Updater
ipcMain.on('update-check',   () => autoUpdater.checkForUpdates().catch(() => {}));
ipcMain.on('update-install', () => { app.isQuitting = true; autoUpdater.quitAndInstall(); });

// Navigation
ipcMain.on('nav-back',    (e) => BrowserWindow.fromWebContents(e.sender).webContents
  .executeJavaScript("document.getElementById('site').goBack()").catch(() => {}));
ipcMain.on('nav-forward', (e) => BrowserWindow.fromWebContents(e.sender).webContents
  .executeJavaScript("document.getElementById('site').goForward()").catch(() => {}));
ipcMain.on('nav-reload',  (e) => BrowserWindow.fromWebContents(e.sender).webContents
  .executeJavaScript("document.getElementById('site').reload()").catch(() => {}));

// Zoom
ipcMain.on('zoom-in',    (e) => BrowserWindow.fromWebContents(e.sender).webContents
  .executeJavaScript("document.getElementById('site').setZoomLevel(document.getElementById('site').getZoomLevel()+0.5)").catch(() => {}));
ipcMain.on('zoom-out',   (e) => BrowserWindow.fromWebContents(e.sender).webContents
  .executeJavaScript("document.getElementById('site').setZoomLevel(document.getElementById('site').getZoomLevel()-0.5)").catch(() => {}));
ipcMain.on('zoom-reset', (e) => BrowserWindow.fromWebContents(e.sender).webContents
  .executeJavaScript("document.getElementById('site').setZoomLevel(0)").catch(() => {}));

// External links
ipcMain.on('open-external', (_e, url) => shell.openExternal(url));

// Notifications
ipcMain.on('show-notification', (_e, title, body) => {
  const iconFile = fs.existsSync(ICON_ICO) ? ICON_ICO
                 : fs.existsSync(ICON_PNG) ? ICON_PNG
                 : undefined;
  const n = new Notification({ title, body, ...(iconFile ? { icon: iconFile } : {}) });
  n.on('click', () => { if (win) { win.show(); win.focus(); } });
  n.show();
});

// Login startup
ipcMain.handle('get-login-startup', () => app.getLoginItemSettings().openAtLogin);
ipcMain.on('set-login-startup', (_e, val) => {
  app.setLoginItemSettings({ openAtLogin: val, path: app.getPath('exe') });
});

// App version
ipcMain.handle('get-version', () => app.getVersion());

// Custom themes — list
ipcMain.handle('themes-list', () => {
  try {
    if (!fs.existsSync(THEMES_DIR)) fs.mkdirSync(THEMES_DIR, { recursive: true });
    return fs.readdirSync(THEMES_DIR)
      .filter(f => f.endsWith('.css'))
      .map(f => ({ name: f.replace(/\.css$/i, ''), file: f }));
  } catch { return []; }
});

// Custom themes — read (path-traversal safe)
ipcMain.handle('themes-read', (_e, file) => {
  try {
    return fs.readFileSync(path.join(THEMES_DIR, path.basename(file)), 'utf8');
  } catch { return null; }
});

// Custom themes — open folder
ipcMain.handle('themes-open-folder', () => {
  if (!fs.existsSync(THEMES_DIR)) fs.mkdirSync(THEMES_DIR, { recursive: true });
  return shell.openPath(THEMES_DIR);
});


// ══════════════════════════════════════════════════════════════════════════════
// EMOJI STASH
// ══════════════════════════════════════════════════════════════════════════════
// Emoji stash — stored as JSON only, no local image files.
// Each entry: { id, name, format, cdnUrl }
// cdnUrl is always https://cdn.discordapp.com/emojis/{id}.{format}
const EMOJIS_INDEX = path.join(app.getPath('userData'), 'emojis.json');

function loadEmojiIndex() {
  try { return JSON.parse(fs.readFileSync(EMOJIS_INDEX, 'utf8')); }
  catch { return []; }
}
function saveEmojiIndex(list) {
  try { fs.writeFileSync(EMOJIS_INDEX, JSON.stringify(list, null, 2)); } catch {}
}

// emoji-save — receives {id, name, format}, stores CDN URL, no file writing
ipcMain.handle('emoji-save', (_e, { id, name, format }) => {
  try {
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
    const cdnUrl   = `https://cdn.discordapp.com/emojis/${id}.${format}`;
    const list     = loadEmojiIndex();
    const filtered = list.filter(e => e.id !== id); // replace if same ID exists
    filtered.push({ id, name: safeName, format, cdnUrl });
    saveEmojiIndex(filtered);
    return filtered;
  } catch (err) {
    throw new Error(err.message);
  }
});

// emoji-list — returns full stash array
ipcMain.handle('emoji-list', () => loadEmojiIndex());

// emoji-delete — remove entry by id (no file to unlink)
ipcMain.handle('emoji-delete', (_e, id) => {
  try {
    const updated = loadEmojiIndex().filter(e => e.id !== id);
    saveEmojiIndex(updated);
    return updated;
  } catch (err) {
    throw new Error(err.message);
  }
});

// ── Addon IPC handlers ──────────────────────────────────────────────────────

// addons-list — returns array of {filename, src} for all .js files in addons dir
ipcMain.handle('addons-list', () => {
  ensureAddonsFolder();
  const files = fs.readdirSync(ADDONS_DIR)
    .filter(f => f.endsWith('.js') && f !== 'ADDON_TEMPLATE.js');
  const result = [];
  for (const file of files) {
    try {
      const src = fs.readFileSync(path.join(ADDONS_DIR, file), 'utf8');
      result.push({ filename: file, src });
    } catch {}
  }
  return result;
});

// profile-api — proxy HTTP calls to the profile server from main process
// (avoids CORS/fetch restrictions when overlay.html loads from file://)
ipcMain.handle('profile-api', async (_e, { method, url, body, token }) => {
  try {
    const opts = {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'EntropyClient/1.0' },
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body)  opts.body = JSON.stringify(body);
    const r = await fetch(url, opts);
    const data = await r.json();
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: e.message } };
  }
});

// splash-save-gif — write a GIF file to the splashes folder
ipcMain.handle('splash-save-gif', (_e, { id, name, buffer }) => {
  try {
    if (!fs.existsSync(SPLASHES_DIR)) fs.mkdirSync(SPLASHES_DIR, { recursive: true });
    // Sanitize filename and always use .gif extension
    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^.]+$/, '') + '.gif';
    const fileName = id + '_' + safeName;
    const filePath = path.join(SPLASHES_DIR, fileName);
    fs.writeFileSync(filePath, Buffer.from(buffer));
    return { ok: true, filePath, fileName };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// splash-delete-gif — remove a GIF file from the splashes folder
ipcMain.handle('splash-delete-gif', (_e, filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// splash-fetch-url — fetch a remote URL and return its bytes (used for Giphy downloads)
ipcMain.handle('splash-fetch-url', async (_e, url) => {
  try {
    const https = require('https');
    const http  = require('http');
    const lib   = url.startsWith('https') ? https : http;
    return await new Promise((resolve, reject) => {
      lib.get(url, { headers: { 'User-Agent': 'EntropyClient/1.0' } }, res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ ok: true, buffer: Array.from(Buffer.concat(chunks)) }));
        res.on('error', reject);
      }).on('error', reject);
    });
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// splash-scan-folder — return list of GIF files currently in the splashes folder
ipcMain.handle('splash-scan-folder', () => {
  try {
    if (!fs.existsSync(SPLASHES_DIR)) return { ok: true, files: [] };
    const files = fs.readdirSync(SPLASHES_DIR)
      .filter(f => f.toLowerCase().endsWith('.gif'))
      .map(f => ({ fileName: f, filePath: path.join(SPLASHES_DIR, f) }));
    return { ok: true, files };
  } catch (e) {
    return { ok: false, error: e.message, files: [] };
  }
});

// splash-open-folder — reveal the splashes folder in file explorer
ipcMain.handle('splash-open-folder', () => {
  if (!fs.existsSync(SPLASHES_DIR)) fs.mkdirSync(SPLASHES_DIR, { recursive: true });
  shell.openPath(SPLASHES_DIR);
});

// addons-open-folder — reveal addons folder in file explorer
ipcMain.handle('addons-open-folder', () => {
  ensureAddonsFolder();
  return shell.openPath(ADDONS_DIR);
});

// emoji-rename — update name in index
ipcMain.handle('emoji-rename', (_e, { id, newName }) => {
  try {
    const list  = loadEmojiIndex();
    const entry = list.find(e => e.id === id);
    if (!entry) throw new Error('Emoji not found');
    entry.name = newName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
    saveEmojiIndex(list);
    return list;
  } catch (err) {
    throw new Error(err.message);
  }
});

// emoji-open-folder — no-op (kept for API compat, no local folder used)
ipcMain.handle('emoji-open-folder', () => Promise.resolve());

// Account switcher — sets up the partition's user-agent then signals ready
ipcMain.handle('switch-account', async (_e, { partition }) => {
  try {
    const ses = session.fromPartition(partition);
    ses.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    return { ok: true };
  } catch (err) {
    console.error('[EC] switch-account error:', err);
    return { ok: false, error: err.message };
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// APP LIFECYCLE
// ══════════════════════════════════════════════════════════════════════════════
app.whenReady().then(() => {
  session.fromPartition('persist:main').setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  // F2 screensaver — call openScreensaver directly via executeJavaScript
  // This bypasses the entire IPC/preload chain which may not be wired up correctly
  const f2Registered = globalShortcut.register('F2', () => {
    console.log('[EC] F2 fired via globalShortcut');
    if (!win) return;

    // Go fullscreen via IPC if opening, exit if closing
    win.webContents.executeJavaScript(`
      (function() {
        var ss  = document.getElementById('screensaver');
        var wv  = document.getElementById('site');
        if (!ss) return 'no-ss-element';

        // CLOSE if already active
        if (window.__ssActive) {
          window.__ssActive = false;
          ss.style.cssText = 'position:fixed;inset:0;z-index:9999999;display:none;background:#000;cursor:none;';
          if (wv) wv.style.visibility = 'visible';
          var gif = document.getElementById('screensaver-gif');
          if (gif) { gif.src = ''; gif.style.display = 'none'; }
          var bg2 = document.getElementById('screensaver-bg');
          if (bg2) bg2.style.backgroundImage = 'none';
          if (window.__ssClockTimer) { clearInterval(window.__ssClockTimer); window.__ssClockTimer = null; }
          if (window.__ssCycleStop) { window.__ssCycleStop(); window.__ssCycleStop = null; }
          return 'closed';
        }

        // OPEN
        window.__ssActive = true;

        // Read screensaver settings
        var useSplashes = localStorage.getItem('ec_ss_use_splashes') !== '0';
        var interval    = parseInt(localStorage.getItem('ec_ss_interval') || '5');
        var shuffle     = localStorage.getItem('ec_ss_shuffle') !== '0';
        var showClock   = localStorage.getItem('ec_ss_show_clock') !== '0';

        // Hide webview (native layer — must be hidden for screensaver to show)
        if (wv) wv.style.visibility = 'hidden';

        // Show screensaver
        ss.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex !important;align-items:flex-end;justify-content:flex-end;background:#000;cursor:none;';

        // Clock
        var clockEl = document.getElementById('screensaver-clock');
        if (clockEl) clockEl.style.display = showClock ? '' : 'none';
        if (showClock) {
          var timeEl = document.getElementById('screensaver-time');
          var dateEl = document.getElementById('screensaver-date');
          function tick() {
            var now = new Date();
            var hh = String(now.getHours()).padStart(2,'0');
            var mm = String(now.getMinutes()).padStart(2,'0');
            var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
            var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            if (timeEl) timeEl.textContent = hh + ':' + mm;
            if (dateEl) dateEl.textContent = days[now.getDay()] + ', ' + months[now.getMonth()] + ' ' + now.getDate();
          }
          tick();
          window.__ssClockTimer = setInterval(tick, 30000);
        }

        // Toast
        setTimeout(function() {
          var toast = document.getElementById('screensaver-toast');
          if (toast) { toast.classList.add('show'); setTimeout(function() { toast.classList.remove('show'); }, 2500); }
        }, 600);

        // Splash images cycle
        if (useSplashes) {
          try {
            var raw = localStorage.getItem('ec_splashes');
            var splashes = raw ? JSON.parse(raw) : [];
            var active = splashes.filter(function(s) { return s.selected; });
            if (active.length) {
              var bg  = document.getElementById('screensaver-bg');
              var gif = document.getElementById('screensaver-gif');
              if (typeof buildCycleEngine === 'function') {
                window.__ssCycleStop = buildCycleEngine(active, bg, gif, interval, shuffle, null);
              } else {
                // fallback: show first image statically
                var first = active[0];
                if (first.isGif && first.filePath && bg) {
                  bg.style.backgroundImage = 'none';
                  if (gif) { gif.src = 'file://' + first.filePath; gif.style.display = 'block'; }
                } else if (first.dataUrl && bg) {
                  bg.style.backgroundImage = 'url(' + first.dataUrl + ')';
                  bg.style.backgroundSize = 'cover';
                  bg.style.backgroundPosition = 'center';
                }
              }
            }
          } catch(e) {}
        }

        return 'opened';
      })();
    `).then(function(result) {
      console.log('[EC] screensaver result:', result);
      if (result === 'opened') {
        win.setFullScreen(true);
      } else if (result === 'closed') {
        win.setFullScreen(false);
      }
    }).catch(function(err) { console.error('[EC] executeJavaScript error:', err); });
  });
  console.log('[EC] globalShortcut F2 registered:', f2Registered);

  // Hook guest webContents (the <webview>) via web-contents-created
  // before-input-event fires before the page JS sees the key
  app.on('web-contents-created', (_e, wc) => {
    console.log('[EC] web-contents-created type:', wc.getType());
    if (wc.getType() === 'webview') {
      console.log('[EC] Attaching before-input-event to webview');
      wc.on('before-input-event', (e, input) => {
        if (input.type === 'keyDown' && input.key === 'F2') {
          console.log('[EC] F2 caught via webview before-input-event');
          e.preventDefault();
          if (win) win.webContents.send('key-f2');
        }
      });
    }
  });

  globalShortcut.register('CommandOrControl+Shift+K', () => {
    if (!win) return;
    win.isVisible() ? win.hide() : (win.show(), win.focus());
  });

  try { ensureThemesFolder();
  ensureAddonsFolder(); } catch (err) { console.error('ensureThemesFolder failed:', err); }

  createWindow();
});

app.on('window-all-closed', () => { /* stay alive in tray on all platforms */ });
app.on('activate', () => { if (win) { win.show(); win.focus(); } });
app.on('will-quit', () => globalShortcut.unregisterAll());