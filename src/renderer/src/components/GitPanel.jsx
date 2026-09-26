import { useEffect, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  FolderOpen,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Loader2,
  RefreshCw,
  Sparkles,
  X
} from 'lucide-react'
import CodeBlock from './CodeBlock'

/* ─────────────────────────────────────────────────────────
 * GIT PANEL — right sidebar with two modes:
 *   Changes  — staged/unstaged diffs with line counts
 *   Commits  — recent commits with avatars, hashes, and line stats
 * ───────────────────────────────────────────────────────── */

// `git diff --unified` -> CodeBlock rows (old/cur/type/pieces).
function parseUnified(text) {
  const rows = []
  let old = 0
  let cur = 0
  let inHunk = false
  for (const line of String(text || '').split('\n')) {
    if (line.startsWith('@@')) {
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (m) {
        old = Number(m[1])
        cur = Number(m[2])
        inHunk = true
      }
      continue
    }
    if (!inHunk) continue
    if (
      line.startsWith('diff ') ||
      line.startsWith('index ') ||
      line.startsWith('new file') ||
      line.startsWith('deleted ') ||
      line.startsWith('similarity') ||
      line.startsWith('rename ')
    ) {
      inHunk = false
      continue
    }
    if (line.startsWith('\\')) continue // "\ No newline at end of file"
    if (line.startsWith('+')) {
      rows.push({ old: null, cur, type: 'add', pieces: [{ text: line.slice(1) }] })
      cur++
    } else if (line.startsWith('-')) {
      rows.push({ old, cur: null, type: 'del', pieces: [{ text: line.slice(1) }] })
      old++
    } else if (line.startsWith(' ')) {
      rows.push({ old, cur, type: 'ctx', pieces: [{ text: line.slice(1) }] })
      old++
      cur++
    } else if (line === '') {
      rows.push({ old, cur, type: 'ctx', pieces: [{ text: '' }] })
      old++
      cur++
    }
    if (rows.length >= 600) break
  }
  return rows
}

function FileRow({ file, badge, staged, openDiff, onToggle }) {
  const key = `${staged ? 's' : 'u'}:${file.path}`
  const open = openDiff?.key === key
  const additions = staged ? file.stagedAdditions : file.unstagedAdditions
  const deletions = staged ? file.stagedDeletions : file.unstagedDeletions
  const hasLines = additions > 0 || deletions > 0
  return (
    <div>
      <button
        type="button"
        className="git-file"
        title={file.path}
        onClick={() => onToggle(file, staged)}
      >
        <span
          className={`git-badge ${file.untracked ? 'untracked' : staged ? 'staged' : 'unstaged'}`}
        >
          {badge}
        </span>
        <span className="gf-name">{file.path}</span>
        {hasLines && (
          <span className="gf-lines" title={`+${additions} / −${deletions} lines`}>
            {additions > 0 && <span className="add">+{additions}</span>}
            {deletions > 0 && <span className="del">−{deletions}</span>}
          </span>
        )}
      </button>
      {open && (
        <div className="git-diff">
          {openDiff.untracked ? (
            <div className="git-empty">Untracked — stage it to diff.</div>
          ) : openDiff.text != null ? (
            openDiff.text ? (
              <CodeBlock
                filename={file.path}
                diff={parseUnified(openDiff.text)}
                variant="Diff"
                hideToggle
              />
            ) : (
              <div className="git-empty">No diff content.</div>
            )
          ) : openDiff.err ? (
            <div className="git-empty">{openDiff.err}</div>
          ) : (
            <div className="git-empty">Loading diff…</div>
          )}
          {openDiff.truncated && <div className="git-empty">Truncated at 100KB.</div>}
        </div>
      )}
    </div>
  )
}

const AVATAR_COLORS = [
  '#5b8def',
  '#e07a5f',
  '#81b29a',
  '#f2cc8f',
  '#9b5de5',
  '#00bbf9',
  '#f15bb5',
  '#00f5d4'
]

function initials(name) {
  const parts = String(name || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function colorFor(email, name) {
  const s = `${email || ''}|${name || ''}`
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function fmtLines(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function Avatar({ person, size = 32 }) {
  const [broken, setBroken] = useState(false)
  const bg = colorFor(person?.email, person?.name)
  const avatarUrl = person?.avatar
  if (avatarUrl && !broken) {
    return (
      <img
        className="gc-avatar"
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        onError={() => setBroken(true)}
      />
    )
  }
  return (
    <span
      className="gc-avatar fallback"
      style={{
        width: size,
        height: size,
        background: bg,
        fontSize: Math.max(9, Math.round(size * 0.38))
      }}
    >
      {initials(person?.name)}
    </span>
  )
}

function CommitsTab({ info }) {
  const log = info?.log || []
  if (!log.length) {
    return (
      <div className="git-empty commits-empty">
        <GitCommit size={16} />
        <div>No commits found yet.</div>
      </div>
    )
  }
  return (
    <div className="commits-wrap">
      <div className="git-sec-label">Recent commits · {log.length}</div>
      <div className="git-timeline">
        {log.map((c, idx) => {
          const adds = c.additions || 0
          const dels = c.deletions || 0
          const totalLines = adds + dels
          const addPct = totalLines > 0 ? Math.round((adds / totalLines) * 100) : 0
          const isLast = idx === log.length - 1
          const [subject, ...bodyLines] = String(c.msg || '').split('\n')
          const body = bodyLines.join('\n').trim()
          return (
            <div
              key={c.hash || c.short || idx}
              className="git-commit-item"
              title={`${c.hash || c.short || ''}\n${c.author || ''} · ${c.ago || ''}`}
            >
              <div className="git-line-track-col" aria-hidden>
                <span className="git-commit-dot" />
                {!isLast && <span className="git-commit-stem" />}
              </div>
              <div className="git-commit-content">
                <div className="gc-header">
                  <Avatar person={{ name: c.author, email: c.email, avatar: c.avatar }} size={20} />
                  <span className="gc-author" title={c.email || c.author}>
                    {c.author}
                  </span>
                  <span className="gc-ago">{c.ago}</span>
                </div>
                <div className="gc-msg" title={c.msg}>
                  {subject || '(no message)'}
                </div>
                {body && (
                  <div className="gc-body-text" title={body}>
                    {body}
                  </div>
                )}
                <div className="gc-meta-row">
                  <span className="gc-hash" title={c.hash || c.short}>
                    {c.short}
                  </span>
                  {c.files > 1 && <span className="gc-files">{c.files} files</span>}
                  {totalLines > 0 ? (
                    <span
                      className="gc-lines-group"
                      title={`+${adds} / −${dels} lines in ${c.files || 1} file(s)`}
                    >
                      {adds > 0 && <span className="add">+{fmtLines(adds)}</span>}
                      {dels > 0 && <span className="del">−{fmtLines(dels)}</span>}
                      <span className="gc-line-bar" aria-hidden>
                        <i className="add" style={{ width: `${addPct}%` }} />
                        <i className="del" style={{ width: `${100 - addPct}%` }} />
                      </span>
                    </span>
                  ) : (
                    <span className="gc-no-diff">no changes</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const NEW_BRANCH_VALUE = '__new__'

function BranchSelect({ id, value, options, allowNew, onChange, disabled, title }) {
  return (
    <span className="gcd-select-wrap">
      <select
        id={id}
        className="gcd-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        title={title}
      >
        {options.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
        {allowNew && <option value={NEW_BRANCH_VALUE}>+ New branch…</option>}
      </select>
      <ChevronDown size={13} className="gcd-select-chevron" aria-hidden />
    </span>
  )
}

function CommitDropdown({ dir, info, onRefresh, onClose }) {
  const [message, setMessage] = useState('')
  const [description, setDescription] = useState('')
  const [branchSel, setBranchSel] = useState('') // '' = follow current | branch name | NEW_BRANCH_VALUE
  const [newBranch, setNewBranch] = useState('')
  const [push, setPush] = useState(true)
  const [pushTarget, setPushTarget] = useState('') // '' = follow commit branch
  const [createPr, setCreatePr] = useState(false)
  const [prTitle, setPrTitle] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const currentBranch = info?.branch || ''
  const branches = info?.branches?.length ? info.branches : currentBranch ? [currentBranch] : []
  const pushOptions = [...new Set([...branches, ...(info?.remoteBranches || [])])]
  // Effective selections fall back gracefully while gitInfo loads.
  const effBranch =
    branchSel === NEW_BRANCH_VALUE
      ? NEW_BRANCH_VALUE
      : branches.includes(branchSel)
        ? branchSel
        : currentBranch
  const effPushTarget = pushOptions.includes(pushTarget) ? pushTarget : currentBranch
  const isNewBranch = effBranch === NEW_BRANCH_VALUE
  const busy = aiLoading || submitting || switching

  // Switch branches immediately so the panel shows what you'd commit.
  const handleBranchPick = async (value) => {
    setError('')
    setSuccess('')
    if (value === NEW_BRANCH_VALUE) {
      setBranchSel(NEW_BRANCH_VALUE)
      return
    }
    if (!value || value === currentBranch) {
      setBranchSel(value)
      return
    }
    const checkout = window.api?.opencode?.gitCheckout
    if (typeof checkout !== 'function') {
      setError('Branch switching needs a fresh app shell — press Ctrl+R, or restart `npm run dev`.')
      return
    }
    setSwitching(true)
    try {
      await checkout(value, false, dir)
      setBranchSel(value)
      if (typeof onRefresh === 'function') onRefresh()
    } catch (e) {
      setError(e.message || `Could not switch to ${value}`)
    } finally {
      setSwitching(false)
    }
  }

  // Fill with AI button
  const handleFillAi = async () => {
    setError('')
    setSuccess('')
    const generate = window.api?.opencode?.gitGenerateCommit
    if (typeof generate !== 'function') {
      setError('AI commit needs a fresh app shell — press Ctrl+R, or restart `npm run dev`.')
      return
    }
    setAiLoading(true)
    try {
      const gen = await generate(dir)
      if (gen) {
        if (gen.title) setMessage(gen.title)
        if (gen.description) setDescription(gen.description)
        if (gen.branch) {
          setBranchSel(NEW_BRANCH_VALUE)
          setNewBranch(gen.branch)
        }
        if (gen.prTitle) setPrTitle(gen.prTitle)
        setSuccess('Filled with AI — you can edit anything before pushing.')
      }
    } catch (e) {
      setError(e.message || 'Could not generate with AI')
    } finally {
      setAiLoading(false)
    }
  }

  // Handle Commit & Push submission
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!message.trim()) {
      setError('Commit message is required.')
      return
    }
    if (isNewBranch && !newBranch.trim()) {
      setError('New branch name is required.')
      return
    }
    setError('')
    setSuccess('')
    setSubmitting(true)
    try {
      const targetBranch = isNewBranch
        ? newBranch.trim()
        : effBranch && effBranch !== currentBranch
          ? effBranch
          : undefined
      const res = await window.api?.opencode?.gitCommitAction(
        {
          message: message.trim(),
          description: description.trim(),
          newBranch: targetBranch,
          push,
          pushBranch: push ? effPushTarget || undefined : undefined,
          createPr,
          prTitle: prTitle.trim() || message.trim()
        },
        dir
      )

      if (res?.success) {
        setSuccess(
          `Committed on ${res.branch}${push ? ` & pushed to origin/${res.pushedTo || res.branch}` : ''}${res.prUrl ? ' (opened PR in browser)' : ''}!`
        )
        if (typeof onRefresh === 'function') onRefresh()
        setTimeout(() => {
          onClose()
        }, 1200)
      }
    } catch (err) {
      setError(err.message || 'Commit failed')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = message.trim().length > 0 && !busy && !(isNewBranch && !newBranch.trim())

  return (
    <div className="git-commit-dropdown">
      <div className="gcd-header">
        <div className="gcd-title">
          <GitCommit size={14} className="gcd-icon-green" />
          <span>Commit & Push</span>
          {switching && <Loader2 size={12} className="spin gcd-switching" />}
        </div>
        <button type="button" className="icon-btn gcd-close" title="Close" onClick={onClose}>
          <X size={13} />
        </button>
      </div>

      <div className="gcd-ai-row">
        <button
          type="button"
          className="gcd-ai-btn"
          onClick={handleFillAi}
          disabled={busy}
          title="Analyze changes and fill commit message, branch, and PR title with AI"
        >
          {aiLoading ? (
            <>
              <Loader2 size={13} className="spin" />
              <span>Analyzing diff with AI…</span>
            </>
          ) : (
            <>
              <Sparkles size={13} />
              <span>Fill with AI</span>
            </>
          )}
        </button>
      </div>

      {error && <div className="gcd-alert error">{error}</div>}
      {success && <div className="gcd-alert success">{success}</div>}

      <form onSubmit={handleSubmit} className="gcd-form">
        <div className="gcd-field">
          <div className="gcd-label-row">
            <label htmlFor="gcd-msg">Commit message *</label>
            <span className="gcd-count">{message.length}/72</span>
          </div>
          <input
            id="gcd-msg"
            type="text"
            className="gcd-input"
            placeholder="e.g. feat(git): add commit and push with AI"
            value={message}
            maxLength={72}
            onChange={(e) => setMessage(e.target.value)}
            disabled={submitting}
            autoFocus
          />
        </div>

        <div className="gcd-field">
          <label htmlFor="gcd-desc">
            Description <span className="gcd-opt">(optional)</span>
          </label>
          <textarea
            id="gcd-desc"
            className="gcd-textarea"
            rows={3}
            placeholder="Extended notes or bullet points..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div className="gcd-field">
          <label htmlFor="gcd-branch">Branch</label>
          <BranchSelect
            id="gcd-branch"
            value={effBranch}
            options={branches}
            allowNew
            onChange={handleBranchPick}
            disabled={busy}
            title="Switch branches — the commit lands on the selected one"
          />
          {isNewBranch && (
            <input
              type="text"
              className="gcd-input gcd-branch-input"
              placeholder="e.g. feat/new-feature"
              value={newBranch}
              onChange={(e) => setNewBranch(e.target.value)}
              disabled={submitting}
            />
          )}
        </div>

        <div className="gcd-field">
          <label className="gcd-check" htmlFor="gcd-push">
            <input
              id="gcd-push"
              type="checkbox"
              checked={push}
              onChange={(e) => setPush(e.target.checked)}
              disabled={submitting}
            />
            <span>Push to origin</span>
          </label>
          {push && (
            <BranchSelect
              id="gcd-push-target"
              value={effPushTarget}
              options={pushOptions}
              allowNew={false}
              onChange={setPushTarget}
              disabled={busy}
              title="Remote branch to push HEAD to"
            />
          )}
        </div>

        <div className="gcd-checkboxes">
          <label className="gcd-check">
            <input
              type="checkbox"
              checked={createPr}
              onChange={(e) => {
                setCreatePr(e.target.checked)
                if (e.target.checked && !push) setPush(true)
              }}
              disabled={submitting}
            />
            <span className="gcd-check-label">
              <GitPullRequest size={12} /> Create Pull Request on GitHub
            </span>
          </label>
        </div>

        {createPr && (
          <div className="gcd-field">
            <label>PR Title</label>
            <input
              type="text"
              className="gcd-input"
              placeholder={message || 'PR Title'}
              value={prTitle}
              onChange={(e) => setPrTitle(e.target.value)}
              disabled={submitting}
            />
          </div>
        )}

        <div className="gcd-actions">
          <button
            type="button"
            className="gcd-btn-secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button type="submit" className="gcd-btn-primary" disabled={!canSubmit}>
            {submitting ? (
              <>
                <Loader2 size={13} className="spin" />
                <span>Processing…</span>
              </>
            ) : createPr ? (
              <>
                <GitPullRequest size={13} />
                <span>Commit, Push & PR</span>
              </>
            ) : push ? (
              <>
                <GitCommit size={13} />
                <span>Commit & Push</span>
              </>
            ) : (
              <>
                <GitCommit size={13} />
                <span>Commit</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

function ChangesTab({ dir, info, openDiff, onToggle, onRefresh }) {
  const [commitOpen, setCommitOpen] = useState(false)
  const staged = (info?.files || []).filter((f) => f.staged)
  const unstaged = (info?.files || []).filter((f) => f.unstaged)
  const untracked = (info?.files || []).filter((f) => f.untracked)

  const stagedAdd = staged.reduce((s, f) => s + (f.stagedAdditions || 0), 0)
  const stagedDel = staged.reduce((s, f) => s + (f.stagedDeletions || 0), 0)
  const unstagedAdd = unstaged.reduce((s, f) => s + (f.unstagedAdditions || 0), 0)
  const unstagedDel = unstaged.reduce((s, f) => s + (f.unstagedDeletions || 0), 0)

  const stagedCount = staged.length + unstaged.length

  return (
    <>
      <div className="git-commit-bar">
        <button
          type="button"
          className={`git-btn-commit${commitOpen ? ' open' : ''}`}
          onClick={() => setCommitOpen((o) => !o)}
          title="Commit and push changes"
          aria-expanded={commitOpen}
        >
          <GitCommit size={13} />
          <span>Commit</span>
          {stagedCount > 0 && <span className="gcb-count">{stagedCount}</span>}
          {commitOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {commitOpen && (
        <CommitDropdown
          dir={dir}
          info={info}
          onRefresh={onRefresh}
          onClose={() => setCommitOpen(false)}
        />
      )}
      <div>
        <div className="git-sec-label" style={{ display: 'flex', alignItems: 'center' }}>
          <span>Staged · {staged.length}</span>
          {(stagedAdd > 0 || stagedDel > 0) && (
            <span className="gf-lines" style={{ marginLeft: 6 }}>
              {stagedAdd > 0 && <span className="add">+{stagedAdd}</span>}
              {stagedDel > 0 && <span className="del">−{stagedDel}</span>}
            </span>
          )}
        </div>
        {staged.length === 0 && <div className="git-empty">Nothing staged.</div>}
        {staged.map((f) => (
          <FileRow
            key={`s:${f.path}`}
            file={f}
            badge={f.staged}
            staged
            openDiff={openDiff}
            onToggle={onToggle}
          />
        ))}
      </div>
      <div>
        <div className="git-sec-label" style={{ display: 'flex', alignItems: 'center' }}>
          <span>Changes · {unstaged.length}</span>
          {(unstagedAdd > 0 || unstagedDel > 0) && (
            <span className="gf-lines" style={{ marginLeft: 6 }}>
              {unstagedAdd > 0 && <span className="add">+{unstagedAdd}</span>}
              {unstagedDel > 0 && <span className="del">−{unstagedDel}</span>}
            </span>
          )}
        </div>
        {unstaged.length === 0 && <div className="git-empty">Working tree clean.</div>}
        {unstaged.map((f) => (
          <FileRow
            key={`u:${f.path}`}
            file={f}
            badge={f.unstaged}
            staged={false}
            openDiff={openDiff}
            onToggle={onToggle}
          />
        ))}
      </div>
      {untracked.length > 0 && (
        <div>
          <div className="git-sec-label">Untracked · {untracked.length}</div>
          {untracked.map((f) => (
            <FileRow
              key={`t:${f.path}`}
              file={f}
              badge="?"
              staged={false}
              openDiff={openDiff}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </>
  )
}

export default function GitPanel({ dir, info, loading, onRefresh, onClose }) {
  const [tab, setTab] = useState('changes') // 'changes' | 'commits'
  const [openDiff, setOpenDiff] = useState(null)

  useEffect(() => {
    setOpenDiff(null)
  }, [dir])

  const toggleDiff = async (file, staged) => {
    if (file.untracked && !staged) {
      const key = `u:${file.path}`
      setOpenDiff((cur) =>
        cur?.key === key ? null : { key, path: file.path, staged: false, text: '', untracked: true }
      )
      return
    }
    const key = `${staged ? 's' : 'u'}:${file.path}`
    if (openDiff?.key === key) {
      setOpenDiff(null)
      return
    }
    setOpenDiff({ key, path: file.path, staged })
    try {
      const r = await window.api.opencode.gitDiff(file.path, staged, dir)
      setOpenDiff((cur) =>
        cur?.key === key ? { ...cur, text: r.diff || '', truncated: r.truncated } : cur
      )
    } catch (e) {
      setOpenDiff((cur) => (cur?.key === key ? { ...cur, err: e.message || 'diff failed' } : cur))
    }
  }

  const refresh = () => {
    setOpenDiff(null)
    onRefresh()
  }

  const commitCount = (info?.log || []).length

  return (
    <aside className="gitbar">
      <div className="git-head">
        <span className="git-title" title="Git">
          <GitBranch size={14} />
          Git
        </span>
        <span className="git-branch" title={info?.root || dir || ''}>
          {info?.branch || (info && !info.repo ? 'no repo' : dir ? '…' : '—')}
        </span>
        {info?.repo && (info.ahead > 0 || info.behind > 0) && (
          <span className="git-count" title="ahead / behind upstream">
            ↑{info.ahead} ↓{info.behind}
          </span>
        )}
        <button className="icon-btn" title="Refresh" onClick={refresh}>
          <RefreshCw size={13} />
        </button>
        <button className="icon-btn" title="Close git panel" onClick={onClose}>
          <X size={13} />
        </button>
      </div>
      <div className="git-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'changes'}
          className={`git-tab${tab === 'changes' ? ' on' : ''}`}
          onClick={() => setTab('changes')}
        >
          <GitBranch size={12} /> Changes
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'commits'}
          className={`git-tab${tab === 'commits' ? ' on' : ''}`}
          onClick={() => setTab('commits')}
        >
          <GitCommit size={12} /> Recent commits{commitCount > 0 ? ` · ${commitCount}` : ''}
        </button>
      </div>
      <div className="git-body">
        {!dir ? (
          <div className="git-empty">
            <FolderOpen size={14} style={{ marginBottom: 6 }} />
            <div>
              Pick a workspace folder to see its git state — or open a session and this follows it.
            </div>
          </div>
        ) : loading ? (
          [60, 40, 75].map((w, i) => (
            <div key={i} className="skel-row" aria-hidden>
              <div className="skel skel-title" style={{ width: `${w}%` }} />
              <div className="skel skel-sub" style={{ width: `${w - 18}%` }} />
            </div>
          ))
        ) : !info || !info.repo ? (
          <div className="git-empty">
            Not a git repository — pick a folder with code to see changes here.
          </div>
        ) : tab === 'commits' ? (
          <CommitsTab info={info} />
        ) : (
          <ChangesTab
            dir={dir}
            info={info}
            openDiff={openDiff}
            onToggle={toggleDiff}
            onRefresh={refresh}
          />
        )}
      </div>
    </aside>
  )
}
