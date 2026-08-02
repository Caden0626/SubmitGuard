import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Fingerprint,
  Info,
  LoaderCircle,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react'
import {
  extractRequirementRules,
  inspectPdf,
  readPdfSummary,
  type CheckItem,
  type PdfInspectionResult,
  type RequirementRule,
  type Severity,
  type UploadedPdf,
} from './pdfInspection'
import Hero3D from './Hero3D'
import './styles.css'

type Stage = 'intake' | 'rules' | 'upload' | 'processing' | 'results'

const sampleRequirement = `Submit a 2,500-word individual report as a PDF. Use the file name StudentID_LastName_BA602.pdf. The report must include an Executive Summary, Introduction, Analysis, Conclusion and References. The main body must not exceed 2,500 words; references and appendices are excluded. For anonymous marking, do not include your name or email anywhere in the document. Maximum 15 pages and 20 MB. Use APA 7 referencing.`

const initialRules: RequirementRule[] = [
  { id: 1, type: '格式', label: '提交格式', value: 'PDF', source: '“Submit ... as a PDF”', confidence: 99, confirmed: true },
  { id: 2, type: '命名', label: '文件名模板', value: 'StudentID_LastName_BA602.pdf', source: '“Use the file name ...”', confidence: 98, confirmed: true },
  { id: 3, type: '字数', label: '正文最大字数', value: '2,500 words', source: '“main body must not exceed ...”', confidence: 96, confirmed: true },
  { id: 4, type: '章节', label: '必需章节', value: 'Executive Summary, Introduction, Analysis, Conclusion, References', source: '“must include ...”', confidence: 94, confirmed: true },
  { id: 5, type: '匿名', label: '匿名评分', value: '不得出现姓名或邮箱', source: '“do not include your name or email”', confidence: 97, confirmed: true },
  { id: 6, type: '限制', label: '页数与文件大小', value: '≤ 15 pages · ≤ 20 MB', source: '“Maximum 15 pages and 20 MB”', confidence: 99, confirmed: true },
  { id: 7, type: '引用', label: '引用格式', value: 'APA 7', source: '“Use APA 7 referencing”', confidence: 84, confirmed: false },
]

const initialChecks: CheckItem[] = [
  {
    id: 'filename', severity: 'must_fix', title: '文件名不符合要求', detail: '当前文件名缺少学号与课程代码。',
    requirement: 'StudentID_LastName_BA602.pdf', current: 'final-report-v7.pdf',
    action: '按老师要求重命名文件，避免提交系统拒绝接收。', location: '文件属性', fixable: true,
  },
  {
    id: 'metadata', severity: 'must_fix', title: 'PDF 作者元数据包含姓名', detail: '匿名评分要求可能因此失效。',
    requirement: '不得出现姓名或邮箱', current: 'Author: Alex Morgan',
    action: '清除 PDF 的作者、标题、主题与关键词元数据。', location: '文档元数据', fixable: true,
  },
  {
    id: 'summary', severity: 'must_fix', title: '未找到 Executive Summary', detail: '未检测到可靠的章节标题匹配。',
    requirement: '必须包含 Executive Summary', current: '未找到可靠匹配',
    action: '返回原文确认是否缺少该章节，或是否使用了不同标题。', location: '全文', page: 1,
  },
  {
    id: 'wordcount', severity: 'review', title: '正文字数接近上限', detail: 'PDF 结构导致正文字数只能估算。',
    requirement: '正文不超过 2,500 words', current: '约 2,468 words（估算）',
    action: '建议在原始文档中核对最终字数，参考文献已尝试排除。', location: '第 2–12 页', page: 2,
  },
  {
    id: 'conclusion', severity: 'review', title: '找到可能匹配的结论章节', detail: '“Final Remarks” 可能对应 Conclusion。',
    requirement: '必须包含 Conclusion', current: 'Final Remarks',
    action: '确认该章节是否为老师要求的 Conclusion。', location: '第 11 页', page: 11,
  },
  {
    id: 'pdf', severity: 'passed', title: '文件格式正确', detail: '文件为可解析的文字型 PDF。',
    requirement: 'PDF', current: 'application/pdf', action: '无需处理。', location: '文件属性',
  },
  {
    id: 'size', severity: 'passed', title: '文件大小符合限制', detail: '文件大小低于 20 MB。',
    requirement: '≤ 20 MB', current: '3.8 MB', action: '无需处理。', location: '文件属性',
  },
  {
    id: 'pages', severity: 'passed', title: '页数符合限制', detail: '当前文档共 13 页。',
    requirement: '≤ 15 pages', current: '13 pages', action: '无需处理。', location: '文件属性',
  },
  {
    id: 'references', severity: 'passed', title: '已找到 References', detail: '章节标题与要求明确匹配。',
    requirement: '必须包含 References', current: 'References · 第 12 页', action: '无需处理。', location: '第 12 页', page: 12,
  },
]

const processSteps = [
  { label: '验证文件', detail: '格式、MIME 类型与加密状态' },
  { label: '提取文字', detail: '读取页面文本与文档结构' },
  { label: '检查章节', detail: '匹配标题与必需章节' },
  { label: '检查匿名信息', detail: '扫描正文与 PDF 元数据' },
  { label: '生成报告', detail: '汇总风险与修复建议' },
]

const stageLabels = ['要求', '规则', '文件', '结果']

function LogoMark() {
  return (
    <div className="logo-mark" aria-hidden="true">
      <span className="logo-mark__sheet" />
      <span className="logo-mark__check"><Check size={13} strokeWidth={3} /></span>
    </div>
  )
}

function TopNav({ stage, onReset }: { stage: Stage; onReset: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const goToStart = () => {
    onReset()
    setMobileOpen(false)
    window.setTimeout(() => document.querySelector('#workspace')?.scrollIntoView({ behavior: 'smooth' }), 80)
  }
  return (
    <header className={`top-nav ${stage !== 'intake' ? 'top-nav--light' : ''}`}>
      <button className="brand" onClick={onReset} aria-label="回到首页">
        <LogoMark />
        <span>SubmitGuard</span>
      </button>
      <div className="nav-center">
        <span className="signal"><i /> SYSTEM READY</span>
        <span className="nav-divider" />
        <span>PRIVATE BETA · 01</span>
      </div>
      <nav className={mobileOpen ? 'nav-links nav-links--open' : 'nav-links'}>
        <a href="/#how" onClick={() => setMobileOpen(false)}>工作方式</a>
        <a href="/#privacy" onClick={() => setMobileOpen(false)}>隐私</a>
        <button className="nav-pill" onClick={goToStart}>开始检查 <ArrowRight size={15} /></button>
      </nav>
      <button className="menu-button" onClick={() => setMobileOpen(!mobileOpen)} aria-label="打开菜单">
        {mobileOpen ? <X /> : <Menu />}
      </button>
    </header>
  )
}

function ProgressRail({ stage }: { stage: Stage }) {
  const index = stage === 'intake' ? 0 : stage === 'rules' ? 1 : stage === 'upload' || stage === 'processing' ? 2 : 3
  return (
    <div className="progress-rail" aria-label="检查进度">
      {stageLabels.map((label, i) => (
        <div className={`progress-node ${i < index ? 'is-done' : ''} ${i === index ? 'is-active' : ''}`} key={label}>
          <span>{i < index ? <Check size={12} /> : i + 1}</span>
          <em>{label}</em>
        </div>
      ))}
      <div className="progress-line"><i style={{ width: `${index * 33.333}%` }} /></div>
    </div>
  )
}

function OrbitalGraphic() {
  return (
    <div className="orbital" aria-hidden="true">
      <svg viewBox="0 0 720 720" role="presentation">
        <g className="orbit orbit--one">
          <g transform="rotate(-18 360 360)">
            <ellipse cx="360" cy="360" rx="282" ry="126" />
            <circle className="orbit-node orbit-node--one" cx="78" cy="360" r="9" />
          </g>
        </g>
        <g className="orbit orbit--two">
          <g transform="rotate(44 360 360)">
            <ellipse cx="360" cy="360" rx="235" ry="305" />
            <circle className="orbit-node orbit-node--two" cx="360" cy="55" r="8" />
          </g>
        </g>
        <g className="orbit orbit--three">
          <ellipse cx="360" cy="360" rx="318" ry="205" transform="rotate(52 360 360)" />
        </g>
        <path className="orbit-wave" d="M150 421C205 326 258 507 350 360C430 250 495 418 560 270" />
      </svg>
      <div className="orbital-core">
        <ShieldCheck size={54} strokeWidth={1.4} />
        <span>READY</span>
      </div>
      <span className="orbit-label orbit-label--a">RULE MATCHING</span>
      <span className="orbit-label orbit-label--b">DOCUMENT SIGNALS</span>
    </div>
  )
}

function Intake({ requirement, setRequirement, onAnalyze, showToast }: {
  requirement: string
  setRequirement: (value: string) => void
  onAnalyze: () => void
  showToast: (message: string) => void
}) {
  const intakeRef = useRef<HTMLElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [inputMode, setInputMode] = useState<'text' | 'file'>('text')
  const [heroReady, setHeroReady] = useState(false)

  useEffect(() => {
    let active = true
    let activated = false
    const activate = () => {
      if (!active || activated) return
      activated = true
      requestAnimationFrame(() => active && setHeroReady(true))
    }
    const fallback = window.setTimeout(activate, 650)
    document.fonts?.ready.then(activate).catch(activate)
    return () => {
      active = false
      window.clearTimeout(fallback)
    }
  }, [])

  useEffect(() => {
    const root = intakeRef.current
    if (!root) return
    const elements = Array.from(root.querySelectorAll<HTMLElement>('[data-scroll-reveal]'))
    if (!('IntersectionObserver' in window)) {
      elements.forEach((element) => element.classList.add('is-visible'))
      return
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      })
    }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' })
    elements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [])

  const loadSample = () => {
    setRequirement(sampleRequirement)
    setInputMode('text')
    requestAnimationFrame(() => textareaRef.current?.focus())
  }
  return (
    <main className="intake-page" ref={intakeRef}>
      <section className={`hero ${heroReady ? 'hero--ready' : ''}`}>
        <div className="hero-noise" />
        <Hero3D />
        <div className="hero-copy">
          <div className="eyebrow reveal reveal--1"><Sparkles size={15} /> 作业提交前智能检查</div>
          <h1 className="hero-title">
            <span className="reveal reveal--2">提交前，</span>
            <span className="hero-title__accent reveal reveal--3">先过一遍。</span>
          </h1>
          <p className="hero-sub reveal reveal--4">
            上传作业要求和 PDF 文件。我们替你检查格式、字数、章节、匿名信息与那些最容易错过的提交细节。
          </p>
          <div className="hero-meta reveal reveal--5">
            <span><CheckCircle2 size={15} /> 不评价内容质量</span>
            <span><LockKeyhole size={15} /> 文件仅在浏览器本地处理</span>
            <span><Zap size={15} /> 确定性检查优先</span>
          </div>
        </div>
        <OrbitalGraphic />
        <a className="scroll-cue" href="#workspace" aria-label="前往检查区域">
          <span>START CHECK</span><ArrowDown size={17} />
        </a>
      </section>

      <section className="workspace-section" id="workspace">
        <div className="section-index scroll-reveal" data-scroll-reveal>01 — ASSIGNMENT BRIEF</div>
        <div className="workspace-heading">
          <h2 className="scroll-reveal" data-scroll-reveal>先告诉我们，<br />老师要求了什么。</h2>
          <p className="scroll-reveal" data-scroll-reveal style={{ '--reveal-delay': '90ms' } as React.CSSProperties}>粘贴课程平台、邮件或评分标准中的要求。系统只生成候选规则，最终由你确认。</p>
        </div>
        <div className="intake-card scroll-reveal" data-scroll-reveal>
          <div className="input-tabs" role="tablist">
            <button className={inputMode === 'text' ? 'is-active' : ''} onClick={() => setInputMode('text')} role="tab">
              <FileText size={17} /> 粘贴要求
            </button>
            <button className={inputMode === 'file' ? 'is-active' : ''} onClick={() => setInputMode('file')} role="tab">
              <Upload size={17} /> 上传要求 PDF <span>BETA</span>
            </button>
          </div>
          {inputMode === 'text' ? (
            <div className="textarea-wrap">
              <textarea
                ref={textareaRef}
                value={requirement}
                onChange={(e) => setRequirement(e.target.value)}
                placeholder="例如：报告必须为 PDF，不超过 2,500 字，文件名格式为 StudentID_Assignment2.pdf……"
                aria-label="作业要求"
              />
              <div className="textarea-footer">
                <span>{requirement.length} / 8,000</span>
                <button onClick={loadSample}><WandSparkles size={15} /> 使用示例要求</button>
              </div>
            </div>
          ) : (
            <button className="requirement-drop" onClick={() => showToast('基础版中，请先使用文字粘贴；要求 PDF 解析将在下一版开放。')}>
              <span className="drop-icon"><Upload size={24} /></span>
              <strong>拖入作业说明 PDF</strong>
              <small>仅支持文字型 PDF · 最大 10 MB</small>
              <em>选择文件</em>
            </button>
          )}
          <div className="intake-action-row">
            <div className="privacy-inline"><Fingerprint size={19} /><span>内容仅用于本次检查<br /><small>不会用于训练模型</small></span></div>
            <button className="primary-action" onClick={onAnalyze}>
              <span>提取检查规则</span><ArrowRight size={19} />
            </button>
          </div>
        </div>
      </section>

      <section className="how-section" id="how">
        <div className="section-index scroll-reveal" data-scroll-reveal>02 — HOW IT WORKS</div>
        <div className="how-title"><h2 className="scroll-reveal" data-scroll-reveal>三步，把遗漏挡在提交之前。</h2><span className="scroll-reveal" data-scroll-reveal style={{ '--reveal-delay': '90ms' } as React.CSSProperties}>不是内容评分。<br />是提交合规检查。</span></div>
        <div className="how-grid">
          {[
            ['01', '确认规则', '系统从要求中识别文件名、字数、章节与匿名规则；模糊项由你决定。'],
            ['02', '检查文件', '上传文字型 PDF，逐项核对文件属性、正文结构与元数据。'],
            ['03', '处理风险', '查看真实页码与提取文本，按明确建议回到原始文档完成处理。'],
          ].map(([number, title, copy], i) => (
            <article className={`how-card how-card--${i + 1} scroll-reveal`} data-scroll-reveal key={number} style={{ '--reveal-delay': `${i * 90}ms` } as React.CSSProperties}>
              <span>{number}</span><div className="how-card__icon">{i === 0 ? <ScanLine /> : i === 1 ? <FileCheck2 /> : <ShieldCheck />}</div>
              <h3>{title}</h3><p>{copy}</p><ArrowRight className="how-card__arrow" />
            </article>
          ))}
        </div>
      </section>

      <section className="privacy-section" id="privacy">
        <div className="privacy-orb scroll-reveal" data-scroll-reveal><LockKeyhole size={42} /></div>
        <div className="scroll-reveal" data-scroll-reveal>
          <span className="section-index">03 — PRIVACY BY DEFAULT</span>
          <h2>你的作业，<br />不该成为永久数据。</h2>
        </div>
        <div className="privacy-copy scroll-reveal" data-scroll-reveal style={{ '--reveal-delay': '100ms' } as React.CSSProperties}>
          <p>真实 PDF 直接在当前浏览器中解析，不上传到 SubmitGuard 服务器；刷新或关闭页面后，文件对象会从当前会话释放。</p>
          <div><span>本地</span><small>浏览器内解析</small></div>
          <div><span>0</span><small>训练用途</small></div>
        </div>
      </section>
    </main>
  )
}

function AppShell({ stage, children }: { stage: Stage; children: React.ReactNode }) {
  return (
    <main className="app-page">
      <div className="app-backdrop"><span /><span /><span /></div>
      <section className="app-shell">
        <ProgressRail stage={stage} />
        {children}
      </section>
    </main>
  )
}

function RulesScreen({ rules, setRules, requirement, onBack, onContinue }: {
  rules: RequirementRule[]
  setRules: React.Dispatch<React.SetStateAction<RequirementRule[]>>
  requirement: string
  onBack: () => void
  onContinue: () => void
}) {
  const confirmed = rules.filter((rule) => rule.confirmed).length
  const [sourceOpen, setSourceOpen] = useState(false)
  const updateRule = (id: number, patch: Partial<RequirementRule>) => setRules((all) => all.map((rule) => rule.id === id ? { ...rule, ...patch } : rule))
  const deleteRule = (id: number) => setRules((all) => all.filter((rule) => rule.id !== id))
  const addRule = () => setRules((all) => [...all, {
    id: Math.max(0, ...all.map((rule) => rule.id)) + 1,
    type: '自定义', label: '新规则', value: '点击编辑规则内容', source: '用户手动添加', confidence: 100, confirmed: false,
  }])
  return (
    <AppShell stage="rules">
      <div className="screen-heading">
        <button className="back-link" onClick={onBack}><ArrowLeft size={16} /> 返回修改要求</button>
        <div className="screen-title-row">
          <div><span className="screen-kicker">RULE CONFIRMATION</span><h1>确认检查规则</h1><p>只会使用你确认的规则检查作业。低置信度内容需要你特别留意。</p></div>
          <div className="rule-score"><strong>{confirmed}</strong><span>/ {rules.length}<br />已确认</span></div>
        </div>
      </div>
      <div className="source-strip">
        <div><FileText size={19} /><span><strong>作业要求已解析</strong><small>共识别 {rules.length} 条候选规则</small></span></div>
        <button onClick={() => setSourceOpen((open) => !open)} aria-expanded={sourceOpen}><Eye size={16} /> {sourceOpen ? '收起原始要求' : '查看原始要求'}</button>
      </div>
      {sourceOpen && <div className="source-detail"><span className="screen-kicker">ORIGINAL REQUIREMENT</span><p>{requirement}</p></div>}
      <div className="rules-toolbar">
        <span>{rules.length} 条规则</span>
        <button onClick={() => setRules((all) => all.map((rule) => ({ ...rule, confirmed: true })))}><CheckCircle2 size={16} /> 全部确认</button>
      </div>
      <div className="rules-list">
        {rules.map((rule, index) => (
          <article className={`rule-card ${!rule.confirmed ? 'rule-card--needs-review' : ''}`} key={rule.id} style={{ '--i': index } as React.CSSProperties}>
            <button className={`rule-check ${rule.confirmed ? 'is-checked' : ''}`} onClick={() => updateRule(rule.id, { confirmed: !rule.confirmed })} aria-label={rule.confirmed ? '取消确认' : '确认规则'}>
              {rule.confirmed && <Check size={14} />}
            </button>
            <span className="rule-type">{rule.type}</span>
            <div className="rule-content">
              <input value={rule.label} onChange={(e) => updateRule(rule.id, { label: e.target.value })} aria-label="规则名称" />
              <input className="rule-value" value={rule.value} onChange={(e) => updateRule(rule.id, { value: e.target.value })} aria-label="规则内容" />
              <small>来源：{rule.source}</small>
            </div>
            <div className={`confidence ${rule.confidence < 90 ? 'is-low' : ''}`}>
              <span>{rule.confidence}%</span><small>{rule.confidence < 90 ? '需要确认' : '高置信度'}</small>
            </div>
            <div className="rule-actions"><button aria-label="编辑规则"><Pencil size={16} /></button><button onClick={() => deleteRule(rule.id)} aria-label="删除规则"><Trash2 size={16} /></button></div>
          </article>
        ))}
      </div>
      <button className="add-rule" onClick={addRule}><Plus size={17} /> 手动添加规则</button>
      <div className="sticky-actions">
        <div><Info size={17} /><span>未确认的规则不会参与检查</span></div>
        <button className="primary-action" onClick={onContinue} disabled={confirmed === 0}><span>确认并上传作业</span><ArrowRight size={18} /></button>
      </div>
    </AppShell>
  )
}

function UploadScreen({ onBack, onCheck, file, setFile, showToast }: {
  onBack: () => void
  onCheck: () => void
  file: UploadedPdf | null
  setFile: (file: UploadedPdf | null) => void
  showToast: (message: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isValidating, setIsValidating] = useState(false)
  const useDemo = () => setFile({
    file: null,
    isDemo: true,
    name: 'final-report-v7.pdf',
    size: '3.8 MB',
    sizeBytes: 3.8 * 1024 * 1024,
    pages: 13,
    metadata: { author: 'Alex Morgan', creator: 'Microsoft Word' },
    sampleCharacters: 13840,
  })
  const handleFile = async (chosen?: File) => {
    if (!chosen) return
    setIsValidating(true)
    try {
      const summary = await readPdfSummary(chosen)
      setFile(summary)
      showToast(`已验证 ${summary.pages} 页文字型 PDF，文件仅在当前浏览器中处理。`)
    } catch (error) {
      setFile(null)
      showToast(error instanceof Error ? error.message : 'PDF 验证失败，请更换文件后重试。')
    } finally {
      setIsValidating(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }
  return (
    <AppShell stage="upload">
      <div className="screen-heading screen-heading--compact">
        <button className="back-link" onClick={onBack}><ArrowLeft size={16} /> 返回检查规则</button>
        <div className="screen-title-row"><div><span className="screen-kicker">DOCUMENT CHECK</span><h1>上传你的作业</h1><p>目前仅支持单个、未加密且可提取文字的 PDF，最大 30 MB。</p></div></div>
      </div>
      {!file ? (
        <div className={`upload-zone ${isValidating ? 'is-validating' : ''}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void handleFile(e.dataTransfer.files[0]) }}>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={(e) => handleFile(e.target.files?.[0])} />
          <div className="upload-rings"><span /><span /><span /><div>{isValidating ? <LoaderCircle className="spin" size={27} /> : <Upload size={27} />}</div></div>
          <span className="screen-kicker">{isValidating ? 'LOCAL VALIDATION' : 'DROP ZONE · PDF ONLY'}</span>
          <h2>{isValidating ? '正在验证 PDF' : '把最终版 PDF 放在这里'}</h2>
          <p>{isValidating ? '检查文件签名、加密状态与可提取文字' : '拖放文件，或从电脑中选择'}</p>
          <button onClick={() => inputRef.current?.click()} disabled={isValidating}>选择 PDF 文件 <ArrowRight size={17} /></button>
          <button className="demo-link" onClick={useDemo} disabled={isValidating}><Sparkles size={15} /> 使用演示文件体验完整流程</button>
          <div className="upload-specs"><span>PDF</span><i /><span>≤ 30 MB</span><i /><span>文字型文件</span></div>
        </div>
      ) : (
        <div className="file-ready">
          <div className="file-visual"><FileText size={40} /><span>PDF</span><i><Check size={14} /></i></div>
          <div className="file-details"><span className="screen-kicker">{file.isDemo ? 'DEMO DOCUMENT' : 'READY TO CHECK'}</span><h2>{file.name}</h2><p>{file.size} · {file.pages} 页 · PDF 文件</p></div>
          <div className="file-health"><span><CheckCircle2 size={17} /> 文件结构有效</span><span><CheckCircle2 size={17} /> 未加密</span><span><CheckCircle2 size={17} /> {file.isDemo ? '演示数据已就绪' : `已验证可提取文字`}</span></div>
          <button className="file-remove" onClick={() => setFile(null)}><Trash2 size={16} /> 移除</button>
        </div>
      )}
      <div className="upload-privacy">
        <ShieldCheck size={25} />
        <div><strong>本地隐私模式已开启</strong><p>真实 PDF 只在当前浏览器中解析，不会上传到 SubmitGuard 服务器。</p></div>
        <span>LOCAL<br /><b>ONLY</b></span>
      </div>
      <div className="sticky-actions sticky-actions--simple">
        <div><Info size={17} /><span>检查不会修改你的原始文件</span></div>
        <button className="primary-action" onClick={onCheck} disabled={!file}><span>开始检查文件</span><ScanLine size={18} /></button>
      </div>
    </AppShell>
  )
}

function ProcessingScreen({ progress }: { progress: number }) {
  const percent = Math.min(100, Math.round(((progress + 0.42) / processSteps.length) * 100))
  return (
    <AppShell stage="processing">
      <div className="processing-wrap">
        <div className="scanner-visual">
          <div className="scanner-sheet">
            <span className="scanner-line" />
            <div className="paper-line paper-line--title" /><div className="paper-line" /><div className="paper-line" /><div className="paper-line short" /><div className="paper-box" /><div className="paper-line" />
          </div>
          <div className="scanner-orbit"><span>SG</span></div>
        </div>
        <span className="screen-kicker">DOCUMENT ANALYSIS IN PROGRESS</span>
        <h1>正在检查你的文件</h1>
        <p>我们会逐项对照已确认规则，不会评价作业内容质量。</p>
        <div className="progress-number"><strong>{percent.toString().padStart(2, '0')}</strong><span>%</span></div>
        <div className="process-list">
          {processSteps.map((step, index) => (
            <div className={`${index < progress ? 'is-done' : ''} ${index === progress ? 'is-active' : ''}`} key={step.label}>
              <span>{index < progress ? <Check size={14} /> : index === progress ? <LoaderCircle className="spin" size={15} /> : index + 1}</span>
              <strong>{step.label}</strong><small>{step.detail}</small>
            </div>
          ))}
        </div>
        <div className="processing-foot"><LockKeyhole size={14} /> 文件通过加密连接处理 · 本次检查完成后仍可立即删除</div>
      </div>
    </AppShell>
  )
}

const severityMeta: Record<Severity, { label: string; icon: React.ReactNode }> = {
  must_fix: { label: '必须修复', icon: <X size={14} /> },
  review: { label: '建议检查', icon: <AlertTriangle size={14} /> },
  passed: { label: '已通过', icon: <Check size={14} /> },
}

function PdfPreview({ active, filename, pageTexts }: { active: CheckItem; filename: string; pageTexts: string[] }) {
  const targetPage = active.page || 1
  const pageText = pageTexts[targetPage - 1] || ''
  const previewLines = pageText.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 16)
  return (
    <aside className="preview-panel">
      <div className="preview-topbar">
        <div><FileText size={16} /><span>{filename}</span></div>
        <div><span>文本定位预览</span><button aria-label="更多预览选项"><MoreHorizontal size={16} /></button></div>
      </div>
      <div className="preview-canvas">
        <div className="pdf-sheet">
          <div className="pdf-sheet__eyebrow">EXTRACTED TEXT · PAGE {targetPage}</div>
          <h3>{previewLines[0] || '页面文本预览'}</h3>
          <div className="pdf-rule" />
          {previewLines.length ? (
            <div className="pdf-copy">
              {previewLines.slice(1).map((line, index) => <p className={index === 2 ? 'is-highlighted' : ''} key={`${line}-${index}`}>{line}</p>)}
            </div>
          ) : (
            <div className="pdf-copy pdf-copy--empty"><ScanLine size={24} /><p>该检查项属于文件属性，或此页没有可提取文本。</p></div>
          )}
          <span className="page-number">{targetPage}</span>
        </div>
      </div>
      <div className="preview-location"><ScanLine size={16} /><span>已定位到：<strong>{active.location}</strong></span></div>
    </aside>
  )
}

function ResultsScreen({ checks, setChecks, file, inspection, onRestart, showToast }: {
  checks: CheckItem[]
  setChecks: React.Dispatch<React.SetStateAction<CheckItem[]>>
  file: UploadedPdf
  inspection: PdfInspectionResult | null
  onRestart: () => void
  showToast: (message: string) => void
}) {
  const [filter, setFilter] = useState<Severity | 'all'>('all')
  const [activeId, setActiveId] = useState(checks.find((item) => item.severity === 'must_fix')?.id || checks[0].id)
  const [detailOpen, setDetailOpen] = useState(true)
  const active = checks.find((item) => item.id === activeId) || checks[0]
  const counts = useMemo(() => ({
    must_fix: checks.filter((item) => item.severity === 'must_fix').length,
    review: checks.filter((item) => item.severity === 'review').length,
    passed: checks.filter((item) => item.severity === 'passed').length,
  }), [checks])
  const score = Math.max(0, Math.min(100, 100 - counts.must_fix * 7 - counts.review * 3))
  const visible = filter === 'all' ? checks : checks.filter((item) => item.severity === filter)
  const resolve = (item: CheckItem) => {
    setChecks((all) => all.map((entry) => entry.id === item.id ? { ...entry, severity: 'passed', resolved: true, detail: item.fixable ? '已在处理后的副本中完成修复。' : '已由你确认。', action: '无需进一步处理。' } : entry))
    showToast(item.fixable ? '已安全处理。原始 PDF 未被覆盖。' : '已标记为确认，准备度已更新。')
  }
  return (
    <AppShell stage="results">
      <div className="results-hero">
        <div className="results-title"><span className="screen-kicker">CHECK COMPLETED · {file.pages} PAGES · {file.size}</span><h1>检查完成</h1><p>准备度只反映文件与已确认规则的匹配情况，不代表作业质量或最终成绩。</p></div>
        <div className={`readiness readiness--${score >= 80 ? 'good' : 'warn'}`}>
          <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="51" /><circle className="readiness-progress" cx="60" cy="60" r="51" style={{ strokeDashoffset: 320 - (320 * score / 100) }} /></svg>
          <div><strong>{score}</strong><span>/ 100</span><small>提交准备度</small></div>
        </div>
        <div className="summary-cards">
          {(['must_fix', 'review', 'passed'] as Severity[]).map((severity) => (
            <button key={severity} onClick={() => setFilter(severity)} className={`summary-card summary-card--${severity}`}>
              <span>{severityMeta[severity].icon}</span><strong>{counts[severity]}</strong><small>{severityMeta[severity].label}</small><ArrowRight size={16} />
            </button>
          ))}
        </div>
      </div>

      <div className="results-toolbar">
        <div className="result-filters">
          <button className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}>全部 <span>{checks.length}</span></button>
          {(['must_fix', 'review', 'passed'] as Severity[]).map((severity) => <button className={filter === severity ? 'is-active' : ''} onClick={() => setFilter(severity)} key={severity}>{severityMeta[severity].label} <span>{counts[severity]}</span></button>)}
        </div>
        <button className="download-report" onClick={() => { showToast('检查报告已准备好；打印窗口即将打开。'); setTimeout(() => window.print(), 350) }}><Download size={16} /> 导出报告</button>
      </div>

      <div className="results-workspace">
        <section className="issues-panel">
          <div className="issues-list">
            {visible.map((item) => (
              <article className={`issue-card issue-card--${item.severity} ${active.id === item.id ? 'is-active' : ''}`} key={item.id}>
                <button className="issue-main" onClick={() => { setActiveId(item.id); setDetailOpen(true) }}>
                  <span className="severity-icon">{severityMeta[item.severity].icon}</span>
                  <div><small>{severityMeta[item.severity].label} · {item.location}</small><h3>{item.title}</h3><p>{item.detail}</p></div>
                  <ChevronDown size={17} className={active.id === item.id && detailOpen ? 'chevron-open' : ''} />
                </button>
                {active.id === item.id && detailOpen && (
                  <div className="issue-detail">
                    <div><span>老师要求</span><p>{item.requirement}</p></div>
                    <div><span>当前情况</span><p>{item.current}</p></div>
                    <div className="issue-suggestion"><Sparkles size={16} /><span><b>建议</b>{item.action}</span></div>
                    {(item.severity === 'review' || item.fixable) && (
                      <button className={item.fixable ? 'fix-button' : 'confirm-button'} onClick={() => resolve(item)}>
                        {item.fixable ? <><WandSparkles size={16} /> 安全修复</> : <><Check size={16} /> 我已确认</>}
                      </button>
                    )}
                  </div>
                )}
              </article>
            ))}
            {visible.length === 0 && <div className="empty-state"><CheckCircle2 size={30} /><h3>这个分类里没有问题</h3><p>你可以切换到其他筛选条件继续查看。</p></div>}
          </div>
        </section>
        <PdfPreview active={active} filename={file.name} pageTexts={inspection?.pageTexts || []} />
      </div>

      <div className="completion-bar">
        <div><span className={`completion-dot ${counts.must_fix === 0 ? 'is-ready' : ''}`} /><span><strong>{counts.must_fix === 0 ? '文件已适合进入提交前人工复核' : `还有 ${counts.must_fix} 项必须修复`}</strong><small>{counts.review} 项建议检查 · 原始文件保持不变</small></span></div>
        <div><button onClick={onRestart}><RotateCcw size={16} /> 重新检查</button><button className="primary-action" onClick={() => { showToast('检查报告已准备好；打印窗口即将打开。'); setTimeout(() => window.print(), 350) }}><span>下载检查报告</span><Download size={17} /></button></div>
      </div>
    </AppShell>
  )
}

function Toast({ message }: { message: string }) {
  return <div className={`toast ${message ? 'toast--visible' : ''}`}><CheckCircle2 size={18} /><span>{message}</span></div>
}

function App() {
  const [stage, setStage] = useState<Stage>('intake')
  const [requirement, setRequirement] = useState('')
  const [rules, setRules] = useState(initialRules)
  const [file, setFile] = useState<UploadedPdf | null>(null)
  const [progress, setProgress] = useState(0)
  const [checks, setChecks] = useState(initialChecks)
  const [inspection, setInspection] = useState<PdfInspectionResult | null>(null)
  const [toast, setToast] = useState('')

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3100)
  }

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [stage])

  const reset = () => {
    setStage('intake')
    setFile(null)
    setChecks(initialChecks)
    setInspection(null)
  }

  const analyze = () => {
    if (!requirement.trim()) {
      showToast('请先粘贴作业要求，或点击“使用示例要求”。')
      document.querySelector('#workspace')?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    setRules(extractRequirementRules(requirement))
    setStage('rules')
  }

  const beginCheck = async () => {
    if (!file) return
    setStage('processing')
    setProgress(0)
    setInspection(null)
    const startedAt = Date.now()
    try {
      if (file.isDemo) {
        for (let step = 0; step < processSteps.length; step += 1) {
          setProgress(step)
          await new Promise((resolve) => window.setTimeout(resolve, 420))
        }
        setChecks(initialChecks)
        setInspection({
          checks: initialChecks,
          pageTexts: [
            'BUSINESS ANALYTICS · BA602\nIndividual Report\nStudent ID: 24019381\nAlex Morgan\nExecutive overview and market context',
            'Market Analysis\nThis report evaluates the available data and summarizes the main findings.',
            ...Array.from({ length: 8 }, (_, index) => `Analysis section · Page ${index + 3}\nExtracted demonstration text for the SubmitGuard workflow.`),
            'Final Remarks\nThe analysis indicates several operational opportunities.',
            'References\nSample reference list and source notes.',
            'Appendix\nSupporting figures and tables.',
          ],
          totalWords: 2712,
          bodyWords: 2468,
          metadata: file.metadata,
        })
      } else {
        const result = await inspectPdf(file, rules, setProgress)
        const remainingDelay = Math.max(0, 1400 - (Date.now() - startedAt))
        if (remainingDelay) await new Promise((resolve) => window.setTimeout(resolve, remainingDelay))
        setChecks(result.checks)
        setInspection(result)
      }
      setProgress(processSteps.length)
      window.setTimeout(() => setStage('results'), 360)
    } catch (error) {
      showToast(error instanceof Error ? error.message : '检查失败，请重新上传 PDF 后再试。')
      setStage('upload')
    }
  }

  return (
    <div className={`site site--${stage}`}>
      <TopNav stage={stage} onReset={reset} />
      {stage === 'intake' && <Intake requirement={requirement} setRequirement={setRequirement} onAnalyze={analyze} showToast={showToast} />}
      {stage === 'rules' && <RulesScreen rules={rules} setRules={setRules} requirement={requirement} onBack={() => setStage('intake')} onContinue={() => setStage('upload')} />}
      {stage === 'upload' && <UploadScreen onBack={() => setStage('rules')} onCheck={() => void beginCheck()} file={file} setFile={setFile} showToast={showToast} />}
      {stage === 'processing' && <ProcessingScreen progress={progress} />}
      {stage === 'results' && file && <ResultsScreen checks={checks} setChecks={setChecks} file={file} inspection={inspection} onRestart={() => setStage('upload')} showToast={showToast} />}
      <Toast message={toast} />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
)
