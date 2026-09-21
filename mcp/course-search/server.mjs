#!/usr/bin/env node
// albert-course-search — MCP server (stdio) exposing workspace PDFs as
// searchable chunks. No vector DB: BM25 over ~800-char overlapping chunks,
// unicode-letter tokenization (French-friendly). Index cached to
// ALBERT_DATA_DIR/course-index.json with mtime/size invalidation.
// IMPORTANT: never print to stdout (it carries JSON-RPC). Use stderr.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { promises as fs } from 'fs'
import path from 'path'
import { PDFParse } from 'pdf-parse'

const COURSE_DIR = process.argv[2] || process.env.ALBERT_COURSE_DIR || process.cwd()
const DATA_DIR = process.argv[3] || process.env.ALBERT_DATA_DIR || path.join(COURSE_DIR, '.albert')
const INDEX_PATH = path.join(DATA_DIR, 'course-index.json')
const SKIP_DIRS = new Set(['node_modules', '.git', 'out', 'dist', 'build', '.next', 'target', 'vendor', '.albert'])
const MAX_FILES = 50
const MAX_FILE_MB = 50
const CHUNK = 800
const STEP = 650

async function* walk(dir, depth = 0) {
  if (depth > 6) return
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) yield* walk(full, depth + 1)
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.pdf')) {
      yield full
    }
  }
}

async function currentMeta() {
  const meta = {}
  let count = 0
  for await (const f of walk(COURSE_DIR)) {
    if (count++ >= MAX_FILES) break
    try {
      const st = await fs.stat(f)
      if (st.size > MAX_FILE_MB * 1024 * 1024) continue
      meta[f] = { mtime: st.mtimeMs, size: st.size }
    } catch { /* unreadable */ }
  }
  return meta
}

function sameFiles(a, b) {
  const ka = Object.keys(a || {})
  const kb = Object.keys(b || {})
  if (ka.length !== kb.length) return false
  return ka.every((f) => b[f] && b[f].mtime === a[f].mtime && b[f].size === a[f].size)
}

async function loadIndex(force) {
  let cached = null
  try {
    cached = JSON.parse(await fs.readFile(INDEX_PATH, 'utf8'))
  } catch { /* cold */ }
  const meta = await currentMeta()
  if (!force && cached && sameFiles(meta, cached.files)) return cached
  const chunks = []
  for (const f of Object.keys(meta)) {
    let text = ''
    try {
      const buf = await fs.readFile(f)
      const parser = new PDFParse({ data: buf })
      try {
        const data = await parser.getText()
        text = String(data.text || '')
      } finally {
        await parser.destroy().catch(() => {})
      }
    } catch { /* unreadable pdf skipped */ }
    text = text.replace(/\s+/g, ' ').trim()
    if (!text) continue
    const doc = path.relative(COURSE_DIR, f)
    for (let i = 0; i < text.length; i += STEP) {
      const slice = text.slice(i, i + CHUNK)
      if (slice.trim().length < 50) continue
      chunks.push({ doc, idx: chunks.length, text: slice })
    }
  }
  const index = { builtAt: Date.now(), files: meta, chunks }
  try {
    await fs.mkdir(DATA_DIR, { recursive: true })
    await fs.writeFile(INDEX_PATH, JSON.stringify(index))
  } catch { /* cache optional */ }
  return index
}

const tok = (s) => String(s).toLowerCase().match(/[a-zàâäéèêëîïôöùûüçñ0-9]+/gi) || []

function search(index, query, topK = 5) {
  const docs = index.chunks || []
  const N = docs.length
  const qts = tok(query)
  if (!N || !qts.length) return []
  const docTfs = docs.map((d) => {
    const tf = {}
    const ts = tok(d.text)
    for (const t of ts) tf[t] = (tf[t] || 0) + 1
    return { tf, len: ts.length }
  })
  const avgLen = docTfs.reduce((a, d) => a + d.len, 0) / N
  const df = {}
  for (const { tf } of docTfs) for (const t of Object.keys(tf)) df[t] = (df[t] || 0) + 1
  const k1 = 1.2
  const b = 0.75
  return docs
    .map((d, i) => {
      const { tf, len } = docTfs[i]
      let s = 0
      for (const t of qts) {
        const f = tf[t] || 0
        if (!f) continue
        const idf = Math.log(1 + (N - (df[t] || 0) + 0.5) / ((df[t] || 0) + 0.5))
        s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * len) / avgLen)))
      }
      return { doc: d.doc, idx: d.idx, text: d.text, score: Math.round(s * 100) / 100 }
    })
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(10, Math.max(1, topK || 5)))
}

const server = new McpServer({ name: 'albert-course-search', version: '1.0.0' })

server.registerTool(
  'course_search',
  {
    description:
      'Search the student course PDFs (Networks/Réseaux chapters, TPs) by keywords. Returns matching chunks as {doc, idx, text, score}. Call reindex first if PDFs changed.',
    inputSchema: {
      query: z.string().describe('Search terms, e.g. "STP root bridge" or "adressage IP"'),
      top_k: z.number().int().min(1).max(10).optional().describe('Max results (default 5)')
    }
  },
  async ({ query, top_k }) => {
    const index = await loadIndex(false)
    const hits = search(index, query, top_k ?? 5)
    return {
      content: [{ type: 'text', text: JSON.stringify({ chunks: hits, indexed_docs: Object.keys(index.files || {}).length }) }]
    }
  }
)

server.registerTool(
  'reindex',
  {
    description: 'Rescan workspace PDFs and rebuild the search index. Returns doc/chunk counts.',
    inputSchema: { force: z.boolean().optional().describe('Rebuild even if unchanged') }
  },
  async ({ force }) => {
    const index = await loadIndex(!!force)
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ docs: Object.keys(index.files || {}).length, chunks: (index.chunks || []).length, builtAt: index.builtAt })
        }
      ]
    }
  }
)

await server.connect(new StdioServerTransport())
