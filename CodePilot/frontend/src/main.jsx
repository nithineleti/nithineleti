import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Activity, ArrowRight, Bug, CheckCircle2, CircleDot,
  Code2, FileCode2, FolderGit2, GitBranch, Loader2, LogOut, Play, Plus, ShieldCheck,
  Sparkles, TerminalSquare, XCircle
} from 'lucide-react'
import './styles.css'

const API = import.meta.env.VITE_API_URL || '/api'
const DEMO_EMAIL = 'demo@codepilot.local'
const DEMO_PASSWORD = 'DemoPass123!'

async function request(path, options = {}, token = '') {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${API}${path}`, { ...options, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || data.message || `Request failed (${res.status})`)
  return data
}

function StatusBadge({ status }) {
  const type = ['completed', 'approved_for_human_review'].includes(status) ? 'ok' : ['failed', 'rejected', 'needs_attention'].includes(status) ? 'bad' : 'run'
  return <span className={`status ${type}`}><CircleDot size={12}/>{String(status || 'queued').replaceAll('_', ' ')}</span>
}

function TestCard({ title, data, baseline = false }) {
  if (!data) return <div className="card empty"><h3>{title}</h3><p>Waiting for evidence…</p></div>
  const expectedFailure = baseline && !data.passed
  const good = baseline ? !data.passed : data.passed
  return (
    <div className="card test-card">
      <div className="card-title-row">
        <div><span className="eyebrow">TEST EVIDENCE</span><h3>{title}</h3></div>
        {good ? <CheckCircle2 className="good" size={24}/> : <XCircle className="bad-icon" size={24}/>} 
      </div>
      <div className="mini-grid">
        <div><span>Result</span><strong>{expectedFailure ? 'Defect reproduced' : data.passed ? 'Passed' : 'Failed'}</strong></div>
        <div><span>Exit code</span><strong>{data.exit_code}</strong></div>
        <div><span>Duration</span><strong>{data.duration_seconds}s</strong></div>
      </div>
      <code className="terminal">{data.output || 'No test output'}</code>
    </div>
  )
}

function Login({ onLogin }) {
  const [email, setEmail] = useState(DEMO_EMAIL)
  const [password, setPassword] = useState(DEMO_PASSWORD)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const data = await request('/auth/login', { method:'POST', body: JSON.stringify({ email, password }) })
      localStorage.setItem('codepilot_token', data.access_token)
      onLogin(data.access_token, data.user)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return <div className="login-page">
    <div className="login-glow one"/><div className="login-glow two"/>
    <div className="login-shell">
      <section className="login-copy">
        <div className="brand-mark"><Code2 size={24}/></div>
        <span className="kicker">AUTONOMOUS SOFTWARE ENGINEERING</span>
        <h1>From bug report to<br/><span>validated change.</span></h1>
        <p>Repository analysis, code retrieval, constrained repair, automated tests, review gates and pull-request preparation — in one traceable workflow.</p>
        <div className="feature-row"><ShieldCheck size={18}/> Human approval remains the final merge gate.</div>
      </section>
      <form className="login-card" onSubmit={submit}>
        <div><span className="eyebrow">SEMESTER DEMO</span><h2>Enter CodePilot</h2><p>Demo credentials are pre-filled.</p></div>
        <label>Email<input value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username"/></label>
        <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password"/></label>
        {error && <div className="alert bad-alert">{error}</div>}
        <button className="primary" disabled={busy}>{busy ? <Loader2 className="spin" size={18}/> : <ArrowRight size={18}/>} Sign in</button>
        <div className="demo-note"><TerminalSquare size={16}/> Offline demo mode works without an external inference account.</div>
      </form>
    </div>
  </div>
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('codepilot_token') || '')
  const [user, setUser] = useState(null)
  const [projects, setProjects] = useState([])
  const [project, setProject] = useState(null)
  const [bug, setBug] = useState('')
  const [run, setRun] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [repoName, setRepoName] = useState('')
  const [repoUrl, setRepoUrl] = useState('')

  useEffect(() => {
    if (!token) return
    request('/me', {}, token).then(setUser).catch(() => { localStorage.removeItem('codepilot_token'); setToken('') })
    request('/projects', {}, token).then(setProjects).catch(()=>{})
  }, [token])

  useEffect(() => {
    if (!run || !['queued','claimed','running'].includes(run.status)) return
    const id = setInterval(async () => {
      try { setRun(await request(`/runs/${run.id}`, {}, token)) } catch (_) {}
    }, 900)
    return () => clearInterval(id)
  }, [run?.id, run?.status, token])

  if (!token) return <Login onLogin={(t,u)=>{setToken(t);setUser(u)}} />

  async function loadDemo() {
    setBusy(true); setError('')
    try {
      const p = await request('/demo/project', { method:'POST' }, token)
      setProject(p); setBug(p.demo_bug_report)
      setProjects(prev => [p, ...prev.filter(x=>x.id!==p.id)])
      const existing = await request(`/projects/${p.id}/runs`, {}, token)
      setRun(existing[0] || null)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }


  async function addRepository(e) {
    e.preventDefault()
    if (!repoName.trim() || !repoUrl.trim()) return
    setBusy(true); setError('')
    try {
      const p = await request('/projects', { method:'POST', body: JSON.stringify({ name: repoName.trim(), repo_url: repoUrl.trim(), default_branch:'main' }) }, token)
      setProjects(prev => [p, ...prev.filter(x=>x.id!==p.id)])
      setProject(p); setRun(null); setRepoName(''); setRepoUrl('')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function execute() {
    if (!project) return setError('Load or select a project first.')
    setBusy(true); setError('')
    try {
      const data = await request(`/projects/${project.id}/runs`, { method:'POST', body: JSON.stringify({ bug_report: bug }) }, token)
      setRun(data)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  function logout() { localStorage.removeItem('codepilot_token'); setToken(''); setUser(null) }

  const currentStage = run?.stage || 'idle'
  const stages = ['triage','workspace','indexing','baseline_tests','retrieval','patch','verification_tests','review','git','complete']
  const completedStages = new Set((run?.events || []).filter(e=>e.status==='completed').map(e=>e.stage))

  return <div className="app-shell">
    <aside>
      <div className="sidebar-brand"><div className="brand-mark small"><Code2 size={20}/></div><div><b>CodePilot</b><span>Engineering Agent</span></div></div>
      <nav>
        <a className="active"><Activity size={18}/> Command Center</a>
        <a><FolderGit2 size={18}/> Repositories</a>
        <a><GitBranch size={18}/> Runs</a>
        <a><ShieldCheck size={18}/> Review Gates</a>
      </nav>
      <div className="sidebar-bottom">
        <div className="user-chip"><div className="avatar">{(user?.email || 'D')[0].toUpperCase()}</div><div><b>Demo Operator</b><span>{user?.email}</span></div></div>
        <button className="icon-btn" onClick={logout} title="Sign out"><LogOut size={17}/></button>
      </div>
    </aside>
    <main>
      <header><div><span className="eyebrow">COMMAND CENTER</span><h1>Autonomous Bug Resolution</h1></div><div className="header-actions"><span className="secure"><ShieldCheck size={16}/> Human-gated</span><button className="secondary" onClick={loadDemo} disabled={busy}>{busy?<Loader2 className="spin" size={16}/>:<Sparkles size={16}/>} Load Demo Project</button></div></header>

      {error && <div className="alert bad-alert">{error}</div>}

      <section className="project-bar">
        <div className="project-select">
          <label>Repository</label>
          <select value={project?.id || ''} onChange={e=>{const p=projects.find(x=>x.id===Number(e.target.value)); setProject(p||null); setRun(null)}}>
            <option value="">Select a project</option>
            {projects.map(p=><option key={p.id} value={p.id}>{p.name}{p.is_demo?' · demo':''}</option>)}
          </select>
        </div>
        <details>
          <summary><Plus size={15}/> Add repository</summary>
          <form className="repo-form" onSubmit={addRepository}>
            <input placeholder="Project name" value={repoName} onChange={e=>setRepoName(e.target.value)}/>
            <input placeholder="https://code-host.example/owner/repository.git" value={repoUrl} onChange={e=>setRepoUrl(e.target.value)}/>
            <button className="secondary" disabled={busy || !repoName || !repoUrl}>Add</button>
          </form>
        </details>
      </section>

      <section className="metrics">
        <div className="metric"><span>Active project</span><strong>{project ? project.name : 'None selected'}</strong><small>{project?.is_demo ? 'Controlled demo repository' : 'Load the included demo'}</small></div>
        <div className="metric"><span>Run status</span><strong>{run ? <StatusBadge status={run.status}/> : '—'}</strong><small>{run?.stage ? `Stage: ${run.stage.replaceAll('_',' ')}` : 'No run submitted'}</small></div>
        <div className="metric"><span>Review score</span><strong>{run?.review ? `${run.review.score}/100` : '—'}</strong><small>{run?.review?.decision?.replaceAll('_',' ') || 'Awaiting validated change'}</small></div>
        <div className="metric"><span>Changed files</span><strong>{run?.pr_preview?.changed_files?.length ?? '—'}</strong><small>Scope-limited patch</small></div>
      </section>

      <section className="workspace-grid">
        <div className="card bug-card">
          <div className="card-title-row"><div><span className="eyebrow">INPUT</span><h2>Bug report</h2></div><Bug size={24}/></div>
          <textarea value={bug} onChange={e=>setBug(e.target.value)} placeholder="Describe actual behavior, expected behavior and reproduction details…"/>
          <div className="run-row"><span>{bug.length} characters</span><button className="primary" onClick={execute} disabled={busy || !project || bug.length < 12}>{busy?<Loader2 className="spin" size={18}/>:<Play size={18}/>} Queue autonomous run</button></div>
        </div>
        <div className="card pipeline-card">
          <div className="card-title-row"><div><span className="eyebrow">LIVE TRACE</span><h2>Agent pipeline</h2></div>{run && <StatusBadge status={run.status}/>}</div>
          <div className="stage-list">
            {stages.map((stage, i) => {
              const done = completedStages.has(stage) || (stage==='complete' && run?.status==='completed')
              const active = currentStage===stage && run?.status!=='completed'
              return <div className={`stage ${done?'done':''} ${active?'active':''}`} key={stage}>
                <div className="stage-icon">{done?<CheckCircle2 size={17}/>:active?<Loader2 className="spin" size={17}/>:<span>{i+1}</span>}</div>
                <div><b>{stage.replaceAll('_',' ')}</b><small>{run?.events?.filter(e=>e.stage===stage).slice(-1)[0]?.message || 'Waiting'}</small></div>
              </div>
            })}
          </div>
        </div>
      </section>

      {run && <>
        <section className="section-head"><div><span className="eyebrow">VALIDATION</span><h2>Evidence, not assumptions</h2></div></section>
        <section className="two-col"><TestCard title="Baseline tests" data={run.baseline_test} baseline/><TestCard title="Verification tests" data={run.verification_test}/></section>

        <section className="two-col detail-grid">
          <div className="card">
            <div className="card-title-row"><div><span className="eyebrow">RAG RETRIEVAL</span><h3>Relevant code context</h3></div><FileCode2 size={22}/></div>
            <div className="context-list">{(run.retrieval || []).slice(0,6).map((x,i)=><div className="context-item" key={i}><div><b>{x.path}</b><span>{x.symbol} · lines {x.start_line}-{x.end_line}</span></div><strong>{Math.round((x.score||0)*100)}%</strong></div>)}{!run.retrieval?.length && <p className="muted">Retrieval results will appear here.</p>}</div>
          </div>
          <div className="card">
            <div className="card-title-row"><div><span className="eyebrow">AUTOMATED REVIEW</span><h3>Quality gate</h3></div><ShieldCheck size={22}/></div>
            {run.review ? <><div className="review-score"><strong>{run.review.score}</strong><span>/100<br/>review score</span></div><StatusBadge status={run.review.decision}/><div className="checks">{Object.entries(run.review.checks||{}).map(([k,v])=><div key={k}><CheckCircle2 size={15}/><span>{k.replaceAll('_',' ')}</span><b>{String(v)}</b></div>)}</div></> : <p className="muted">Review starts after verification tests complete.</p>}
          </div>
        </section>

        <section className="card diff-card">
          <div className="card-title-row"><div><span className="eyebrow">PATCH</span><h3>Validated Git diff</h3></div><Code2 size={22}/></div>
          <pre>{run.diff || 'Waiting for a patch…'}</pre>
        </section>

        {run.pr_preview && <section className="card pr-card">
          <div className="pr-icon"><GitBranch size={24}/></div><div className="pr-copy"><span className="eyebrow">PULL REQUEST PREVIEW</span><h2>{run.pr_preview.title}</h2><p>Branch <code>{run.pr_preview.branch}</code> · {run.pr_preview.changed_files.length} changed file(s)</p></div><div className="approval"><ShieldCheck size={20}/><span>Ready for<br/><b>human approval</b></span></div>
        </section>}
      </>}
    </main>
  </div>
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>)
