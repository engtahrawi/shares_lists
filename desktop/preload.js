'use strict';
// Exposes window.SM to the shared interface with the same synchronous API as the Android bridge.
const { contextBridge, ipcRenderer } = require('electron');

const METHODS = ['getState', 'getStats', 'appVersion', 'validateUrl', 'checkDuplicate', 'addLink', 'updateLink',
  'setFlag', 'setDeadline', 'clearDeadline', 'setEffort', 'setSteps', 'reanalyzeMissingPlans', 'acceptSuggestion',
  'moveLink', 'deleteLink', 'retry', 'createCollection', 'renameCollection', 'deleteCollection', 'openUrl',
  'shareLink', 'copyText', 'readClipboard', 'saveSettings', 'setApiKey', 'testApiKey', 'exportData', 'importData',
  'deleteAllData', 'signIn', 'signOut', 'syncNow', 'toast'];

const api = {};
for (const m of METHODS) api[m] = (...args) => ipcRenderer.sendSync('sm', m, args);
contextBridge.exposeInMainWorld('SM', api);
