'use strict';
// Starts the real app in a temporary profile, drives it through the SM bridge and saves a screenshot.
// Run (Linux, headless): xvfb-run npx electron test/smoke-main.js --no-sandbox
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'savemind-smoke-'));
app.setPath('userData', profile);
require('../main.js');

app.whenReady().then(() => setTimeout(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  const run = (code) => win.webContents.executeJavaScript(code);
  const out = {};
  try {
    out.platform = await run('JSON.parse(SM.getState()).platform');
    out.desk = await run('document.body.classList.contains("desk")');
    out.add = await run('SM.addLink("https://github.com/n8n-io/n8n", "Workflow tool", false)');
    out.dup = await run('SM.addLink("https://www.github.com/n8n-io/n8n/", "", false)');
    out.col = await run('SM.createCollection("Tools to Try")');
    out.id = JSON.parse(out.add).id;
    await run('SM.moveLink(' + out.id + ', ' + out.col + ')');
    await run('SM.setDeadline(' + out.id + ', "2030-01-15", "", 3)');
    await run('SMNative.changed(); SMNative.go("#/link/' + out.id + '")');
    await new Promise((r) => setTimeout(r, 800));
    const st = JSON.parse(await run('SM.getState()'));
    out.links = st.links.length;
    out.linkCollection = st.links[0].collection_id === out.col;
    out.deadline = st.links[0].deadline_source;
    out.status = st.links[0].status + '/' + st.links[0].error;
    out.paneTitle = await run('document.querySelector("#pane h2") && document.querySelector("#pane h2").textContent');
    out.sideItems = await run('document.querySelectorAll("#side .sitem").length');
    const img = await win.webContents.capturePage();
    fs.writeFileSync(process.env.SMOKE_SHOT || path.join(profile, 'smoke.png'), img.toPNG());
    await new Promise((r) => setTimeout(r, 500));
    out.savedFile = fs.existsSync(path.join(profile, 'savemind-data.json'));
    console.log('SMOKE ' + JSON.stringify(out));
  } catch (e) {
    console.log('SMOKE-ERROR ' + e.stack);
  }
  app.exit(0);
}, 2500));
