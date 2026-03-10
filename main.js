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
const ADDONS_DIR  = path.join(app.getPath('userData'), 'addons');


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
  { filename: "hide-members.js", hex: '2f2f20456e74726f707920436c69656e74204164646f6e0a2f2f20e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e294800a6d6f64756c652e6578706f727473203d207b0a202069643a2020202020202027686964652d6d656d62657273272c0a202069636f6e3a202020202027f09f91a5272c0a20206e616d653a20202020202748696465204d656d626572204c697374272c0a2020646573633a202020202027436f6c6c6170736573207468652072696768742d73696465206d656d626572732070616e656c2e272c0a202063617465676f72793a202756697375616c272c0a0a20206373733a20600a202020205b636c6173732a3d226d656d626572732d73696465626172225d2c5b636c6173732a3d224d656d6265727353696465626172225d2c0a202020205b636c6173732a3d226d656d6265722d6c697374225d2c5b636c6173732a3d224d656d6265724c697374225d2c0a202020205b636c6173732a3d2275736572732d73696465626172225d2c5b636c6173732a3d22557365727353696465626172225d2c0a2020202061736964655b636c6173732a3d227269676874225d2c61736964655b636c6173732a3d2273696465225d2c0a202020205b636c6173732a3d22726967687450616e656c225d2c5b636c6173732a3d2272696768742d70616e656c225d2c0a202020205b646174612d7465737469642a3d226d656d626572225d2c5b646174612d7465737469642a3d227573657273225d2c0a202020205b636c6173732a3d226368616e6e656c4d656d62657273225d2c5b636c6173732a3d226368616e6e656c2d6d656d62657273225d207b0a202020202020646973706c61793a206e6f6e652021696d706f7274616e743b0a202020207d0a2020602c0a7d3b0a' },
  { filename: "custom-font.js", hex: '2f2f20456e74726f707920436c69656e74204164646f6e0a2f2f20e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e294800a6d6f64756c652e6578706f727473203d207b0a202069643a2020202020202027637573746f6d2d666f6e74272c0a202069636f6e3a202020202027f09f94a4272c0a20206e616d653a202020202027437573746f6d204d65737361676520466f6e74272c0a2020646573633a2020202020274170706c696573206120636c65616e206d6f6e6f737061636520666f6e7420746f2063686174206d657373616765732e272c0a202063617465676f72793a202756697375616c272c0a0a20206373733a20600a202020205b636c6173732a3d226d6573736167652d636f6e74656e74225d2c5b636c6173732a3d224d657373616765436f6e74656e74225d2c0a202020205b636c6173732a3d22636861742d6d657373616765225d2c5b646174612d6d6573736167652d69645d207370616e2c0a202020205b636c6173732a3d22746578742d636f6e74656e74225d2c5b636c6173732a3d2254657874436f6e74656e74225d207b0a202020202020666f6e742d66616d696c793a20274a6574427261696e73204d6f6e6f272c20274669726120436f6465272c2027436173636164696120436f6465272c206d6f6e6f73706163652021696d706f7274616e743b0a202020207d0a2020602c0a7d3b0a' },
  { filename: "markdown-preview.js", hex: '2f2f20456e74726f707920436c69656e74204164646f6e0a2f2f20e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e294800a6d6f64756c652e6578706f727473203d207b0a202069643a20202020202020276d61726b646f776e2d70726576696577272c0a202069636f6e3a202020202027e29c8defb88f272c0a20206e616d653a2020202020274d61726b646f776e2050726576696577272c0a2020646573633a20202020202752656e64657273202a2a626f6c642a2a2c202a6974616c69632a2c2060636f6465602c20616e64207e7e737472696b657e7e206c69766520617320796f7520747970652e272c0a202063617465676f72793a202743686174272c0a0a20207363726970743a20600a202020202866756e6374696f6e28297b0a2020202020206966202877696e646f772e5f5f65634d6450726576696577292072657475726e3b0a20202020202077696e646f772e5f5f65634d6450726576696577203d20747275653b0a0a2020202020207661722070726576696577203d20646f63756d656e742e637265617465456c656d656e74282764697627293b0a202020202020707265766965772e6964203d20275f5f65632d6d642d70726576696577273b0a202020202020707265766965772e7374796c652e63737354657874203d0a202020202020202027706f736974696f6e3a66697865643b626f74746f6d3a383070783b6c6566743a3530253b7472616e73666f726d3a7472616e736c61746558282d353025293b270a20202020202020202b20276261636b67726f756e643a726762612831382c31382c32342c302e3937293b626f726465723a31707820736f6c69642072676261283235352c3130372c302c302e3235293b270a20202020202020202b2027626f726465722d7261646975733a313070783b70616464696e673a3130707820313670783b666f6e742d73697a653a313370783b636f6c6f723a236363633b270a20202020202020202b20276d61782d77696474683a35323070783b6d696e2d77696474683a32303070783b706f696e7465722d6576656e74733a6e6f6e653b7a2d696e6465783a39393939393b270a20202020202020202b2027646973706c61793a6e6f6e653b6c696e652d6865696768743a312e363b626f782d736861646f773a30203870782033327078207267626128302c302c302c302e35293b270a20202020202020202b2027776f72642d627265616b3a627265616b2d776f72643b273b0a202020202020646f63756d656e742e626f64792e617070656e644368696c642870726576696577293b0a0a20202020202066756e6374696f6e2072656e6465724d64287465787429207b0a202020202020202072657475726e20746578740a202020202020202020202e7265706c616365282f262f672c2726616d703b27292e7265706c616365282f3c2f672c27266c743b27292e7265706c616365282f3e2f672c272667743b27290a202020202020202020202e7265706c616365282f5c2a5c2a282e2b3f295c2a5c2a2f672c273c7374726f6e673e24313c2f7374726f6e673e27290a202020202020202020202e7265706c616365282f5c2a282e2b3f295c2a2f672c273c656d3e24313c2f656d3e27290a202020202020202020202e7265706c616365282f7e7e282e2b3f297e7e2f672c273c733e24313c2f733e27290a202020202020202020202e7265706c616365282f5c60285b5e5c605d2b295c602f672c273c636f6465207374796c653d226261636b67726f756e643a72676261283235352c3235352c3235352c302e3038293b70616464696e673a317078203570783b626f726465722d7261646975733a3370783b666f6e742d66616d696c793a6d6f6e6f73706163653b666f6e742d73697a653a31327078223e24313c2f636f64653e27290a202020202020202020202e7265706c616365282f5e3e20282e2b292f676d2c273c626c6f636b71756f7465207374796c653d22626f726465722d6c6566743a33707820736f6c696420236666366230303b6d617267696e3a303b70616464696e672d6c6566743a3870783b636f6c6f723a23383838223e24313c2f626c6f636b71756f74653e27293b0a2020202020207d0a0a2020202020207661722054415f53454c203d202774657874617265612e6d6573736167652d696e7075742d74657874617265612c74657874617265612e666f6e742d6e6f726d616c2e666c65782d312e62672d7472616e73706172656e74273b0a202020202020766172206c61737456616c203d2027273b0a20202020202076617220706f6c6c203d20736574496e74657276616c2866756e6374696f6e2829207b0a2020202020202020766172207461203d20646f63756d656e742e717565727953656c6563746f722854415f53454c293b0a202020202020202069662028217461207c7c20646f63756d656e742e616374697665456c656d656e7420213d3d20746129207b0a20202020202020202020707265766965772e7374796c652e646973706c6179203d20276e6f6e65273b206c61737456616c203d2027273b2072657475726e3b0a20202020202020207d0a20202020202020207661722076616c203d2074612e76616c75653b0a20202020202020206966202876616c203d3d3d206c61737456616c292072657475726e3b0a20202020202020206c61737456616c203d2076616c3b0a2020202020202020696620282176616c2e7472696d2829207c7c20212f5b2a5f7e5c603e5d2f2e746573742876616c2929207b20707265766965772e7374796c652e646973706c61793d276e6f6e65273b2072657475726e3b207d0a2020202020202020707265766965772e696e6e657248544d4c203d2072656e6465724d642876616c293b0a2020202020202020707265766965772e7374796c652e646973706c6179203d2027626c6f636b273b0a2020202020207d2c20313230293b0a0a20202020202077696e646f772e5f5f65634d64507265766965774f6666203d2066756e6374696f6e2829207b0a2020202020202020636c656172496e74657276616c28706f6c6c293b0a202020202020202076617220656c203d20646f63756d656e742e676574456c656d656e744279496428275f5f65632d6d642d7072657669657727293b0a202020202020202069662028656c2920656c2e72656d6f766528293b0a202020202020202077696e646f772e5f5f65634d6450726576696577203d2066616c73653b0a2020202020207d3b0a202020207d2928293b0a2020602c0a0a20206f6e44697361626c653a20606966202877696e646f772e5f5f65634d64507265766965774f6666292077696e646f772e5f5f65634d64507265766965774f666628293b602c0a7d3b0a' },
  { filename: "typing-sound.js", hex: '2f2f20456e74726f707920436c69656e74204164646f6e0a2f2f20e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e294800a6d6f64756c652e6578706f727473203d207b0a202069643a2020202020202027747970696e672d736f756e64272c0a202069636f6e3a202020202027e28ca8efb88f272c0a20206e616d653a202020202027547970696e6720536f756e64272c0a2020646573633a202020202027506c617973206120737562746c6520636c69636b20736f756e6420617320796f752074797065206d657373616765732e272c0a202063617465676f72793a202746756e272c0a0a20207363726970743a20600a202020202866756e6374696f6e28297b0a2020202020206966202877696e646f772e5f5f6563547970696e67536f756e64292072657475726e3b0a20202020202077696e646f772e5f5f6563547970696e67536f756e64203d20747275653b0a20202020202076617220637478203d206e6577202877696e646f772e417564696f436f6e74657874207c7c2077696e646f772e7765626b6974417564696f436f6e746578742928293b0a20202020202066756e6374696f6e20636c69636b2829207b0a2020202020202020766172206f203d206374782e6372656174654f7363696c6c61746f7228293b0a20202020202020207661722067203d206374782e6372656174654761696e28293b0a20202020202020206f2e636f6e6e6563742867293b20672e636f6e6e656374286374782e64657374696e6174696f6e293b0a20202020202020206f2e6672657175656e63792e76616c7565203d2031323030202b204d6174682e72616e646f6d2829202a203430303b0a20202020202020206f2e74797065203d2027737175617265273b0a2020202020202020672e6761696e2e73657456616c7565417454696d6528302e30342c206374782e63757272656e7454696d65293b0a2020202020202020672e6761696e2e6578706f6e656e7469616c52616d70546f56616c7565417454696d6528302e303030312c206374782e63757272656e7454696d65202b20302e3034293b0a20202020202020206f2e7374617274286374782e63757272656e7454696d65293b0a20202020202020206f2e73746f70286374782e63757272656e7454696d65202b20302e3034293b0a2020202020207d0a20202020202066756e6374696f6e206f6e4b6579286529207b0a20202020202020206966202821652e6b6579292072657475726e3b0a202020202020202069662028652e6b65792e6c656e677468203d3d3d2031207c7c20652e6b6579203d3d3d20274261636b737061636527207c7c20652e6b6579203d3d3d202720272920636c69636b28293b0a2020202020207d0a202020202020646f63756d656e742e6164644576656e744c697374656e657228276b6579646f776e272c206f6e4b65792c2074727565293b0a20202020202077696e646f772e5f5f6563547970696e67536f756e644f6666203d2066756e6374696f6e2829207b0a2020202020202020646f63756d656e742e72656d6f76654576656e744c697374656e657228276b6579646f776e272c206f6e4b65792c2074727565293b0a202020202020202077696e646f772e5f5f6563547970696e67536f756e64203d2066616c73653b0a2020202020207d3b0a202020207d2928293b0a2020602c0a0a20206f6e44697361626c653a20606966202877696e646f772e5f5f6563547970696e67536f756e644f6666292077696e646f772e5f5f6563547970696e67536f756e644f666628293b602c0a7d3b0a' },
  { filename: "message-sound.js", hex: '2f2f20456e74726f707920436c69656e74204164646f6e0a2f2f20e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e294800a6d6f64756c652e6578706f727473203d207b0a202069643a20202020202020276d6573736167652d736f756e64272c0a202069636f6e3a202020202027f09f9494272c0a20206e616d653a2020202020274d65737361676520536f756e64272c0a2020646573633a202020202027506c617973206120736f6674206368696d65207768656e2061206e6577206d657373616765206172726976657320696e20636861742e272c0a202063617465676f72793a202746756e272c0a0a20207363726970743a20600a202020202866756e6374696f6e28297b0a2020202020206966202877696e646f772e5f5f65634d7367536f756e64292072657475726e3b0a20202020202077696e646f772e5f5f65634d7367536f756e64203d20747275653b0a20202020202076617220637478203d206e6577202877696e646f772e417564696f436f6e74657874207c7c2077696e646f772e7765626b6974417564696f436f6e746578742928293b0a20202020202066756e6374696f6e206368696d652829207b0a20202020202020205b3532332c203635392c203738345d2e666f72456163682866756e6374696f6e28667265712c206929207b0a20202020202020202020766172206f203d206374782e6372656174654f7363696c6c61746f7228293b0a202020202020202020207661722067203d206374782e6372656174654761696e28293b0a202020202020202020206f2e636f6e6e6563742867293b20672e636f6e6e656374286374782e64657374696e6174696f6e293b0a202020202020202020206f2e6672657175656e63792e76616c7565203d20667265713b0a202020202020202020206f2e74797065203d202773696e65273b0a202020202020202020207661722074203d206374782e63757272656e7454696d65202b2069202a20302e31323b0a20202020202020202020672e6761696e2e73657456616c7565417454696d6528302c2074293b0a20202020202020202020672e6761696e2e6c696e65617252616d70546f56616c7565417454696d6528302e30382c2074202b20302e3032293b0a20202020202020202020672e6761696e2e6578706f6e656e7469616c52616d70546f56616c7565417454696d6528302e303030312c2074202b20302e3335293b0a202020202020202020206f2e73746172742874293b206f2e73746f702874202b20302e3335293b0a20202020202020207d293b0a2020202020207d0a202020202020766172206f6273203d206e6577204d75746174696f6e4f627365727665722866756e6374696f6e286d75747329207b0a2020202020202020666f7220287661722069203d20303b2069203c206d7574732e6c656e6774683b20692b2b29207b0a20202020202020202020766172206164646564203d206d7574735b695d2e61646465644e6f6465733b0a20202020202020202020666f722028766172206a203d20303b206a203c2061646465642e6c656e6774683b206a2b2b29207b0a202020202020202020202020766172206e203d2061646465645b6a5d3b0a202020202020202020202020696620286e2e6e6f646554797065203d3d3d203120262620280a2020202020202020202020202020286e2e64617461736574202626206e2e646174617365742e6d657373616765496429207c7c0a2020202020202020202020202020286e2e717565727953656c6563746f72202626206e2e717565727953656c6563746f7228275b646174612d6d6573736167652d69645d2729290a2020202020202020202020202929207b206368696d6528293b20627265616b3b207d0a202020202020202020207d0a20202020202020207d0a2020202020207d293b0a2020202020206f62732e6f62736572766528646f63756d656e742e626f64792c207b206368696c644c6973743a20747275652c20737562747265653a2074727565207d293b0a20202020202077696e646f772e5f5f65634d7367536f756e644f6666203d2066756e6374696f6e2829207b0a20202020202020206f62732e646973636f6e6e65637428293b0a202020202020202077696e646f772e5f5f65634d7367536f756e64203d2066616c73653b0a2020202020207d3b0a202020207d2928293b0a2020602c0a0a20206f6e44697361626c653a20606966202877696e646f772e5f5f65634d7367536f756e644f6666292077696e646f772e5f5f65634d7367536f756e644f666628293b602c0a7d3b0a' },
  { filename: "ADDON_TEMPLATE.js", hex: '2f2f20456e74726f707920436c69656e7420e2809420437573746f6d204164646f6e2054656d706c6174650a2f2f20e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e294800a2f2f20436f707920746869732066696c652c2072656e616d652069742c20616e642066696c6c20696e20746865206669656c64732e0a2f2f20506c61636520697420696e2074686973206164646f6e732f20666f6c6465722e2049742077696c6c206170706561720a2f2f20696e20746865204164646f6e7320746162206175746f6d61746963616c6c79206f6e206e657874206c61756e63682e0a2f2f0a2f2f204649454c44533a0a2f2f202020696420202020202020e2809420756e6971756520737472696e672c206e6f207370616365732028652e672e20276d792d6164646f6e27290a2f2f20202069636f6e2020202020e280942073696e676c6520656d6f6a692073686f776e20696e207468652055490a2f2f2020206e616d652020202020e2809420646973706c6179206e616d650a2f2f202020646573632020202020e280942073686f7274206465736372697074696f6e0a2f2f20202063617465676f727920e28094202756697375616c27207c20274368617427207c202746756e27207c206f7220616e7920637573746f6d20737472696e670a2f2f202020637373202020202020e2809420286f7074696f6e616c292043535320696e6a656374656420696e746f20746865206b6c6f616b20776562766965770a2f2f202020736372697074202020e2809420286f7074696f6e616c29204a5320657865637574656420696e7369646520746865206b6c6f616b20776562766965770a2f2f2020206f6e44697361626c65e2809420286f7074696f6e616c29204a5320746f20636c65616e207570207768656e206164646f6e20697320746f67676c6564206f66660a2f2f0a2f2f204e4f5445533a0a2f2f2020202d207363726970742f6f6e44697361626c652072756e20696e7369646520746865206b6c6f616b205041474520636f6e746578742c206e6f7420456c656374726f6e2e0a2f2f2020202d205573652077696e646f772e5f5f65634d794164646f6e2067756172647320746f2070726576656e7420646f75626c652d696e6a656374696f6e2e0a2f2f2020202d20435353206973206175746f6d61746963616c6c792072656d6f766564207768656e20796f752064697361626c6520746865206164646f6e2e0a2f2f20e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e29480e294800a0a6d6f64756c652e6578706f727473203d207b0a202069643a20202020202020276d792d6164646f6e272c0a202069636f6e3a202020202027f09f94a7272c0a20206e616d653a2020202020274d79204164646f6e272c0a2020646573633a2020202020274465736372696265207768617420796f7572206164646f6e20646f657320686572652e272c0a202063617465676f72793a2027437573746f6d272c0a0a20206373733a20600a202020202f2a2043535320696e6a656374656420696e746f206b6c6f616b20e280942065646974206173206e6565646564202a2f0a202020202f2a20626f6479207b206261636b67726f756e643a207265642021696d706f7274616e743b207d202a2f0a2020602c0a0a20207363726970743a20600a202020202866756e6374696f6e28297b0a2020202020206966202877696e646f772e5f5f65634d794164646f6e292072657475726e3b0a20202020202077696e646f772e5f5f65634d794164646f6e203d20747275653b0a202020202020636f6e736f6c652e6c6f6728275b45435d204d79204164646f6e2061637469766527293b0a2020202020202f2f20596f757220636f6465206865726520e280942072756e7320696e7369646520746865206b6c6f616b20706167650a20202020202077696e646f772e5f5f65634d794164646f6e4f6666203d2066756e6374696f6e2829207b0a202020202020202077696e646f772e5f5f65634d794164646f6e203d2066616c73653b0a2020202020207d3b0a202020207d2928293b0a2020602c0a0a20206f6e44697361626c653a20606966202877696e646f772e5f5f65634d794164646f6e4f6666292077696e646f772e5f5f65634d794164646f6e4f666628293b602c0a7d3b0a' }
];

function ensureAddonsFolder() {
  if (!fs.existsSync(ADDONS_DIR)) fs.mkdirSync(ADDONS_DIR, { recursive: true });
  // Write each bundled addon once — only if not already present (preserves user edits)
  DEFAULT_ADDONS.forEach(({ filename, hex }) => {
    const dest = path.join(ADDONS_DIR, filename);
    if (!fs.existsSync(dest)) {
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

// addons-list — returns array of {filename, manifest} for all .js files in addons dir
ipcMain.handle('addons-list', () => {
  ensureAddonsFolder();
  const files = fs.readdirSync(ADDONS_DIR).filter(f => f.endsWith('.js') && f !== 'ADDON_TEMPLATE.js');
  const result = [];
  for (const file of files) {
    try {
      const src = fs.readFileSync(path.join(ADDONS_DIR, file), 'utf8');
      // Parse manifest fields without requiring the module (safe, no exec)
      const manifest = parseAddonManifest(src);
      if (manifest && manifest.id) result.push({ filename: file, manifest, src });
    } catch {}
  }
  return result;
});

// addons-open-folder — reveal addons folder in file explorer
ipcMain.handle('addons-open-folder', () => {
  ensureAddonsFolder();
  shell.openPath(ADDONS_DIR);
});

// Parse addon manifest fields from source text using regex (no eval)
function parseAddonManifest(src) {
  function field(key) {
    const m = src.match(new RegExp(key + "\\s*:\\s*['\\`]([^'\\`]*)['\\`]"));
    return m ? m[1].trim() : '';
  }
  function fieldML(key) {
    // multi-line template literal or single-quote string
    const m = src.match(new RegExp(key + "\\s*:\\s*\\`([\\s\\S]*?)\\`"));
    if (m) return m[1];
    const m2 = src.match(new RegExp(key + "\\s*:\\s*'([^']*)'"));
    return m2 ? m2[1] : '';
  }
  return {
    id:        field('id'),
    icon:      field('icon'),
    name:      field('name'),
    desc:      field('desc'),
    category:  field('category'),
    css:       fieldML('css'),
    script:    fieldML('script'),
    onDisable: fieldML('onDisable'),
  };
}

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

// ══════════════════════════════════════════════════════════════════════════════
// APP LIFECYCLE
// ══════════════════════════════════════════════════════════════════════════════
app.whenReady().then(() => {
  session.fromPartition('persist:main').setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

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