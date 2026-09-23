import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  window: {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    ping: () => ipcRenderer.send('ping')
  },
  platform: process.platform,
  updates: {
    state: () => ipcRenderer.invoke('upd:state'),
    check: () => ipcRenderer.invoke('upd:check'),
    install: () => ipcRenderer.invoke('upd:install'),
    onEvent: (cb) => {
      const listener = (_e, payload) => cb(payload)
      ipcRenderer.on('upd:event', listener)
      return () => ipcRenderer.removeListener('upd:event', listener)
    }
  },
  opencode: {
    status: () => ipcRenderer.invoke('oc:status'),
    models: () => ipcRenderer.invoke('oc:models'),
    createSession: (title) => ipcRenderer.invoke('oc:session-create', title),
    prompt: (sessionID, model, text, attachments, variant, textOnly) => ipcRenderer.invoke('oc:prompt', sessionID, model, text, attachments || [], variant || '', !!textOnly),
    commands: () => ipcRenderer.invoke('oc:commands'),
    command: (sessionID, payload) => ipcRenderer.invoke('oc:command', sessionID, payload),
    abort: (sessionID) => ipcRenderer.invoke('oc:abort', sessionID),
    messages: (sessionID) => ipcRenderer.invoke('oc:messages', sessionID),
    sessionGet: (sessionID) => ipcRenderer.invoke('oc:session-get', sessionID),
    deleteSession: (sessionID) => ipcRenderer.invoke('oc:session-delete', sessionID),
    title: (conversation, model) => ipcRenderer.invoke('oc:title', conversation, model),
    pickFolder: () => ipcRenderer.invoke('oc:pick-folder'),
    setWorkspace: (dir) => ipcRenderer.invoke('oc:set-workspace', dir),
    findFiles: (query) => ipcRenderer.invoke('oc:find-files', query),
    listFiles: (dir) => ipcRenderer.invoke('oc:list-files', dir),
    readWorkspaceFile: (relPath) => ipcRenderer.invoke('oc:read-workspace-file', relPath),
    memory: () => ipcRenderer.invoke('oc:memory'),
    prompts: () => ipcRenderer.invoke('oc:get-prompts'),
    setPrompts: (soul, system) => ipcRenderer.invoke('oc:set-prompts', soul, system),
    setMode: (id) => ipcRenderer.invoke('oc:set-mode', id),
    saveCustomMode: (payload) => ipcRenderer.invoke('oc:save-custom-mode', payload),
    deleteCustomMode: (id) => ipcRenderer.invoke('oc:delete-custom-mode', id),
    replyPermission: (requestID, reply) => ipcRenderer.invoke('oc:permission-reply', requestID, reply),
    replyQuestion: (requestID, answers) => ipcRenderer.invoke('oc:question-reply', requestID, answers),
    onEvent: (cb) => {
      const listener = (_e, payload) => cb(payload)
      ipcRenderer.on('oc:event', listener)
      return () => ipcRenderer.removeListener('oc:event', listener)
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
