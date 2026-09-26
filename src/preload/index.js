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
    createSession: (opts) => ipcRenderer.invoke('oc:session-create', opts || {}),
    setSessionTitle: (sessionID, title) => ipcRenderer.invoke('oc:session-title', sessionID, title),
    sessions: (query) => ipcRenderer.invoke('oc:sessions', query || {}),
    projects: () => ipcRenderer.invoke('oc:projects'),
    agents: () => ipcRenderer.invoke('oc:agents'),
    fork: (sessionID, messageID) => ipcRenderer.invoke('oc:fork', sessionID, messageID),
    children: (sessionID) => ipcRenderer.invoke('oc:children', sessionID),
    todos: (sessionID) => ipcRenderer.invoke('oc:todos', sessionID),
    prompt: (sessionID, model, text, attachments, variant, textOnly, agent) =>
      ipcRenderer.invoke(
        'oc:prompt',
        sessionID,
        model,
        text,
        attachments || [],
        variant || '',
        !!textOnly,
        agent || ''
      ),
    commands: () => ipcRenderer.invoke('oc:commands'),
    command: (sessionID, payload) => ipcRenderer.invoke('oc:command', sessionID, payload),
    abort: (sessionID) => ipcRenderer.invoke('oc:abort', sessionID),
    messages: (sessionID, query) => ipcRenderer.invoke('oc:messages', sessionID, query || {}),
    sessionGet: (sessionID) => ipcRenderer.invoke('oc:session-get', sessionID),
    deleteSession: (sessionID) => ipcRenderer.invoke('oc:session-delete', sessionID),
    pickFolder: () => ipcRenderer.invoke('oc:pick-folder'),
    setWorkspace: (dir) => ipcRenderer.invoke('oc:set-workspace', dir),
    findFiles: (query) => ipcRenderer.invoke('oc:find-files', query),
    listFiles: (dir) => ipcRenderer.invoke('oc:list-files', dir),
    readWorkspaceFile: (relPath) => ipcRenderer.invoke('oc:read-workspace-file', relPath),
    gitInfo: (dir) => ipcRenderer.invoke('oc:git-info', dir || ''),
    gitDiff: (relPath, staged, dir) =>
      ipcRenderer.invoke('oc:git-diff', relPath, !!staged, dir || ''),
    gitContributors: (dir) => ipcRenderer.invoke('oc:git-contributors', dir || ''),
    gitCommitAction: (opts, dir) =>
      ipcRenderer.invoke('oc:git-commit-action', opts || {}, dir || ''),
    gitCheckout: (branch, create, dir) =>
      ipcRenderer.invoke('oc:git-checkout', branch || '', !!create, dir || ''),
    gitGenerateCommit: (dir) => ipcRenderer.invoke('oc:git-generate-commit', dir || ''),
    memory: () => ipcRenderer.invoke('oc:memory'),
    prompts: () => ipcRenderer.invoke('oc:get-prompts'),
    setPrompts: (soul, system) => ipcRenderer.invoke('oc:set-prompts', soul, system),
    setMode: (id) => ipcRenderer.invoke('oc:set-mode', id),
    saveCustomMode: (payload) => ipcRenderer.invoke('oc:save-custom-mode', payload),
    deleteCustomMode: (id) => ipcRenderer.invoke('oc:delete-custom-mode', id),
    replyPermission: (requestID, reply) =>
      ipcRenderer.invoke('oc:permission-reply', requestID, reply),
    replyQuestion: (requestID, answers) =>
      ipcRenderer.invoke('oc:question-reply', requestID, answers),
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
