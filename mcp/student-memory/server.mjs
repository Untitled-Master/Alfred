#!/usr/bin/env node
// albert-student-memory — MCP server (stdio) tracking per-topic mastery.
// Storage: <opencode-data-dir>/alfred/memory.json (shared with the app, which
// also injects a mastery brief into every tutor turn). Mastery follows the
// student across repos — never a dot-dir inside a workspace.
// IMPORTANT: never print to stdout (it carries JSON-RPC). Use stderr.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

// Mirrors opencode's own data-dir layout (xdg-basedir): $XDG_DATA_HOME/opencode,
// else ~/.local/share/opencode. Same tree that holds its session storage.
const opencodeDataDir = () => {
  const home = process.env.OPENCODE_TEST_HOME || os.homedir()
  return path.join(process.env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'opencode')
}
const DATA_DIR = process.argv[3] || process.env.ALBERT_DATA_DIR || path.join(opencodeDataDir(), 'alfred')
const MEM_PATH = path.join(DATA_DIR, 'memory.json')
const today = () => new Date().toISOString().slice(0, 10)

async function load() {
  try {
    const mem = JSON.parse(await fs.readFile(MEM_PATH, 'utf8'))
    if (mem && typeof mem === 'object' && mem.topics && typeof mem.topics === 'object') return mem
  } catch { /* cold */ }
  return { student_id: 'belma', topics: {} }
}

async function save(mem) {
  await fs.mkdir(DATA_DIR, { recursive: true })
  await fs.writeFile(MEM_PATH, JSON.stringify(mem, null, 2))
}

function brief(mem) {
  const ks = Object.keys(mem.topics || {})
  if (!ks.length) return 'No mastery data yet.'
  return ks
    .map((k) => {
      const t = mem.topics[k]
      const misc = (t.misconceptions || []).join('; ')
      return `${k}=${t.mastery ?? 0}/5${misc ? ` (watch: ${misc})` : ''}`
    })
    .join(', ')
}

const text = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj) }] })
const server = new McpServer({ name: 'albert-student-memory', version: '1.0.0' })

server.registerTool(
  'get_mastery',
  {
    description: 'Get the student mastery level (0-5) for a topic, with misconceptions and last_seen date. Unknown topics return mastery 0.',
    inputSchema: { topic: z.string().describe('Topic id, e.g. "subnetting"') }
  },
  async ({ topic }) => {
    const mem = await load()
    const t = mem.topics[topic] || { mastery: 0, misconceptions: [], last_seen: null }
    return text({ topic, ...t })
  }
)

server.registerTool(
  'save_attempt',
  {
    description: 'Record a quiz attempt: mastery +1 if correct, -1 if wrong (clamped 0-5). Optionally append a misconception note on wrong answers.',
    inputSchema: {
      topic: z.string().describe('Topic id'),
      correct: z.boolean().describe('Whether the answer was correct'),
      note: z.string().optional().describe('Misconception note, e.g. "forgets -2 for hosts"')
    }
  },
  async ({ topic, correct, note }) => {
    const mem = await load()
    const t = mem.topics[topic] || { mastery: 0, misconceptions: [], last_seen: null }
    t.mastery = Math.min(5, Math.max(0, (t.mastery || 0) + (correct ? 1 : -1)))
    t.last_seen = today()
    if (!correct && note) {
      t.misconceptions = t.misconceptions || []
      if (!t.misconceptions.includes(note)) t.misconceptions.push(note.slice(0, 200))
      t.misconceptions = t.misconceptions.slice(-10)
    }
    mem.topics[topic] = t
    await save(mem)
    return text({ topic, ...t })
  }
)

server.registerTool(
  'get_next_topic',
  {
    description: 'Which topic to quiz next: the lowest mastery (alphabetical tiebreak). Returns null when nothing is tracked yet.',
    inputSchema: {}
  },
  async () => {
    const mem = await load()
    const ks = Object.keys(mem.topics || {})
    if (!ks.length) return text({ next: null, topics: {} })
    ks.sort((a, b) => mem.topics[a].mastery - mem.topics[b].mastery || (a < b ? -1 : 1))
    return text({ next: ks[0], topics: mem.topics })
  }
)

server.registerTool(
  'get_brief',
  {
    description: 'One-line mastery summary for prompt injection, e.g. "subnetting=2/5 (watch: forgets -2), STP=1/5".',
    inputSchema: {}
  },
  async () => text({ brief: brief(await load()) })
)

await server.connect(new StdioServerTransport())
