import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

let pdfJsPromise: Promise<typeof import('pdfjs-dist')> | null = null

async function loadPdfJs() {
  pdfJsPromise ||= import('pdfjs-dist').then((pdfJs) => {
    pdfJs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
    return pdfJs
  })
  return pdfJsPromise
}

export type Severity = 'must_fix' | 'review' | 'passed'

export type RequirementRule = {
  id: number
  type: string
  label: string
  value: string
  source: string
  confidence: number
  confirmed: boolean
}

export type CheckItem = {
  id: string
  severity: Severity
  title: string
  detail: string
  requirement: string
  current: string
  action: string
  location: string
  page?: number
  fixable?: boolean
  resolved?: boolean
}

export type PdfMetadata = {
  author?: string
  creator?: string
  title?: string
  subject?: string
  keywords?: string
  producer?: string
}

export type UploadedPdf = {
  file: File | null
  isDemo: boolean
  name: string
  size: string
  sizeBytes: number
  pages: number
  metadata: PdfMetadata
  sampleCharacters: number
}

export type PdfInspectionResult = {
  checks: CheckItem[]
  pageTexts: string[]
  totalWords: number
  bodyWords: number
  metadata: PdfMetadata
}

const MAX_FILE_SIZE = 30 * 1024 * 1024
const SECTION_NAMES = [
  'Executive Summary',
  'Introduction',
  'Analysis',
  'Findings',
  'Discussion',
  'Conclusion',
  'Recommendations',
  'References',
  'Bibliography',
  'Appendix',
  '摘要',
  '引言',
  '分析',
  '结论',
  '参考文献',
  '附录',
]

const SECTION_ALIASES: Record<string, string[]> = {
  'executive summary': ['abstract', 'management summary', 'summary'],
  introduction: ['background', 'overview'],
  analysis: ['findings', 'results', 'discussion'],
  conclusion: ['final remarks', 'concluding remarks', 'summary and conclusion'],
  references: ['bibliography', 'reference list', 'works cited'],
  '参考文献': ['文献目录'],
  '结论': ['总结', '总结与展望'],
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function compactSource(value: string) {
  return `“${value.replace(/\s+/g, ' ').trim().slice(0, 120)}${value.length > 120 ? '…' : ''}”`
}

function parseNumber(value: string) {
  const match = value.match(/[\d,.]+/)
  return match ? Number(match[0].replace(/,/g, '')) : null
}

function formatMegabytes(bytes: number) {
  return `${Math.max(0.1, bytes / 1024 / 1024).toFixed(1)} MB`
}

function metadataFromInfo(info: Object): PdfMetadata {
  const values = info as Record<string, unknown>
  const read = (key: string) => typeof values[key] === 'string' && values[key].trim() ? values[key].trim() : undefined
  return {
    author: read('Author'),
    creator: read('Creator'),
    title: read('Title'),
    subject: read('Subject'),
    keywords: read('Keywords'),
    producer: read('Producer'),
  }
}

function textFromItems(items: Array<unknown>) {
  let text = ''
  for (const item of items) {
    if (!item || typeof item !== 'object' || !('str' in item)) continue
    const value = item as { str: string; hasEOL?: boolean }
    text += `${value.str}${value.hasEOL ? '\n' : ' '}`
  }
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

function friendlyPdfError(error: unknown) {
  const name = error instanceof Error ? error.name : ''
  const message = error instanceof Error ? error.message : String(error)
  if (/password/i.test(name) || /password|encrypted/i.test(message)) return '该 PDF 已加密或需要密码，请导出未加密版本后重试。'
  if (/invalid|missing pdf/i.test(name) || /invalid|corrupt|header/i.test(message)) return '文件不是有效 PDF，或文件已经损坏。'
  return 'PDF 无法读取，请确认文件未损坏、未加密且为文字型 PDF。'
}

async function assertPdfHeader(file: File) {
  const header = new Uint8Array(await file.slice(0, 1024).arrayBuffer())
  const signature = new TextDecoder('latin1').decode(header)
  if (!signature.includes('%PDF-')) throw new Error('Invalid PDF header')
}

export async function readPdfSummary(file: File): Promise<UploadedPdf> {
  if (!file.name.toLowerCase().endsWith('.pdf')) throw new Error('请选择扩展名为 .pdf 的文件。')
  if (file.type && file.type !== 'application/pdf') throw new Error('文件的 MIME 类型不是 application/pdf。')
  if (file.size > MAX_FILE_SIZE) throw new Error('文件超过 30 MB，请压缩后重新上传。')
  await assertPdfHeader(file)

  const { getDocument } = await loadPdfJs()
  let pdf: PDFDocumentProxy | undefined
  let loadingTask: PDFDocumentLoadingTask | undefined
  try {
    loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
    pdf = await loadingTask.promise
    const metadataResult = await pdf.getMetadata().catch(() => ({ info: {}, metadata: null }))
    const metadata = metadataFromInfo(metadataResult.info)
    const samplePages = Array.from(new Set([1, 2, 3, Math.min(5, pdf.numPages), pdf.numPages]))
      .filter((pageNumber) => pageNumber >= 1 && pageNumber <= pdf!.numPages)
    let sampleCharacters = 0

    for (const pageNumber of samplePages) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      sampleCharacters += textFromItems(content.items).replace(/\s/g, '').length
    }

    if (sampleCharacters < 20) throw new Error('No extractable text')
    return {
      file,
      isDemo: false,
      name: file.name,
      size: formatMegabytes(file.size),
      sizeBytes: file.size,
      pages: pdf.numPages,
      metadata,
      sampleCharacters,
    }
  } catch (error) {
    if (error instanceof Error && /30 MB|扩展名|MIME|No extractable text/.test(error.message)) {
      if (error.message === 'No extractable text') throw new Error('未检测到可提取文字；扫描件和纯图片 PDF 暂不支持。')
      throw error
    }
    throw new Error(friendlyPdfError(error))
  } finally {
    await loadingTask?.destroy()
  }
}

export function extractRequirementRules(requirement: string): RequirementRule[] {
  const normalized = requirement.replace(/\s+/g, ' ').trim()
  const rules: RequirementRule[] = []
  const add = (type: string, label: string, value: string, source: string, confidence: number, confirmed = confidence >= 90) => {
    if (rules.some((rule) => rule.type === type && rule.value.toLowerCase() === value.toLowerCase())) return
    rules.push({ id: rules.length + 1, type, label, value, source: compactSource(source), confidence, confirmed })
  }

  const pdfMatch = normalized.match(/(?:submit|upload|提交|上传)?[^。.!?\n]{0,55}\bPDF\b/i)
  if (pdfMatch) add('格式', '提交格式', 'PDF', pdfMatch[0], 99)

  const filenameMatch = normalized.match(/(?:file\s*name|filename|named|文件名)[^。.!?\n]{0,80}?([A-Za-z0-9][A-Za-z0-9_.-]*\.pdf)/i)
  if (filenameMatch) add('命名', '文件名模板', filenameMatch[1], filenameMatch[0], 97)

  const wordMatch = normalized.match(/(?:not exceed|no more than|maximum|max\.?|不超过|最多)[^。.!?\n]{0,24}?(\d[\d,]*)\s*(?:words?|字)/i)
    || normalized.match(/(\d[\d,]*)\s*[- ]?(?:words?|字)[^。.!?\n]{0,24}?(?:limit|maximum|最多|上限)/i)
  if (wordMatch) add('字数', '正文最大字数', `${wordMatch[1]} words`, wordMatch[0], 95)

  const pageMatch = normalized.match(/(?:maximum|max\.?|not exceed|no more than|不超过|最多)[^。.!?\n]{0,20}?(\d+)\s*(?:pages?|页)/i)
  const sizeMatch = normalized.match(/(?:maximum|max\.?|not exceed|no more than|不超过|最多)[^。.!?\n]{0,28}?(\d+(?:\.\d+)?)\s*MB/i)
  if (pageMatch || sizeMatch) {
    const values = [pageMatch ? `≤ ${pageMatch[1]} pages` : '', sizeMatch ? `≤ ${sizeMatch[1]} MB` : ''].filter(Boolean)
    add('限制', '页数与文件大小', values.join(' · '), [pageMatch?.[0], sizeMatch?.[0]].filter(Boolean).join('；'), 98)
  }

  const mentionedSections = SECTION_NAMES
    .map((section) => ({ section, index: normalized.toLowerCase().indexOf(section.toLowerCase()) }))
    .filter(({ index }) => index >= 0)
    .sort((a, b) => a.index - b.index)
    .map(({ section }) => section)
    .filter((section, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === section.toLowerCase()) === index)
  if (mentionedSections.length >= 2 && /must include|required sections?|必须包含|包括|包含/i.test(normalized)) {
    const sectionSource = normalized.match(/(?:must include|required sections?|必须包含|包括|包含)[^。.!?\n]{0,220}/i)?.[0] || mentionedSections.join(', ')
    add('章节', '必需章节', mentionedSections.join(', '), sectionSource, 93)
  }

  const anonymousMatch = normalized.match(/[^。.!?\n]{0,45}(?:anonymous|blind marking|do not include[^。.!?\n]*(?:name|email)|匿名|不得出现[^。.!?\n]*(?:姓名|邮箱))[^。.!?\n]{0,55}/i)
  if (anonymousMatch) add('匿名', '匿名评分', '不得出现姓名或邮箱', anonymousMatch[0], 96)

  const citationMatch = normalized.match(/\b(APA|MLA|Chicago|Harvard)\s*(\d{1,2})?\b/i)
  if (citationMatch) add('引用', '引用格式', citationMatch[0].toUpperCase(), citationMatch[0], 84, false)

  const deadlineMatch = normalized.match(/(?:deadline|due|截止)[^。.!?\n]{0,30}?(\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:\s+\d{1,2}:\d{2})?)/i)
  if (deadlineMatch) add('提醒', '截止时间', deadlineMatch[1], deadlineMatch[0], 91)

  if (rules.length === 0) {
    add('自定义', '提交要求', normalized.slice(0, 160), normalized, 70, false)
  }
  return rules
}

function countWords(text: string) {
  return text.match(/[A-Za-z0-9]+(?:['’_-][A-Za-z0-9]+)*|[\u3400-\u9fff]/g)?.length || 0
}

function firstReferenceLocation(pageTexts: string[]) {
  const pattern = /(?:^|\n)\s*(?:\d+(?:\.\d+)*\s*)?(references|bibliography|reference list|works cited|参考文献)\s*(?:\n|$)/i
  for (let index = 0; index < pageTexts.length; index += 1) {
    const match = pattern.exec(pageTexts[index])
    if (match) return { pageIndex: index, characterIndex: match.index, heading: match[1] }
  }
  return null
}

function findSection(pageTexts: string[], section: string) {
  const normalizedSection = section.trim().toLowerCase()
  const exact = new RegExp(`(?:^|\\n)\\s*(?:\\d+(?:\\.\\d+)*[ .-]*)?${escapeRegExp(section)}\\s*(?:\\n|$)`, 'i')
  for (let pageIndex = 0; pageIndex < pageTexts.length; pageIndex += 1) {
    if (exact.test(pageTexts[pageIndex])) return { status: 'exact' as const, page: pageIndex + 1, match: section }
  }
  const aliases = SECTION_ALIASES[normalizedSection] || []
  for (const alias of aliases) {
    const fuzzy = new RegExp(`(?:^|\\n)\\s*(?:\\d+(?:\\.\\d+)*[ .-]*)?${escapeRegExp(alias)}\\s*(?:\\n|$)`, 'i')
    for (let pageIndex = 0; pageIndex < pageTexts.length; pageIndex += 1) {
      if (fuzzy.test(pageTexts[pageIndex])) return { status: 'possible' as const, page: pageIndex + 1, match: alias }
    }
  }
  return null
}

function matchesFilenameTemplate(filename: string, template: string) {
  const replacements: Array<[RegExp, string]> = [
    [/StudentID/gi, '[A-Za-z0-9]+'],
    [/LastName/gi, "[A-Za-z][A-Za-z'-]+"],
    [/FirstName/gi, "[A-Za-z][A-Za-z'-]+"],
    [/CourseCode/gi, '[A-Za-z]{2,}[0-9A-Za-z-]*'],
  ]
  let pattern = escapeRegExp(template.trim())
  for (const [token, replacement] of replacements) pattern = pattern.replace(token, replacement)
  return new RegExp(`^${pattern}$`, 'i').test(filename)
}

function maskEmail(email: string) {
  const [local, domain] = email.split('@')
  return `${local.slice(0, 1)}***@${domain}`
}

function severityOrder(severity: Severity) {
  return severity === 'must_fix' ? 0 : severity === 'review' ? 1 : 2
}

export async function extractPdfFullText(file: File): Promise<string> {
  await assertPdfHeader(file)
  const { getDocument } = await loadPdfJs()
  let loadingTask: PDFDocumentLoadingTask | undefined
  try {
    loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
    const pdf = await loadingTask.promise
    const pageTexts: string[] = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      pageTexts.push(textFromItems(content.items))
    }
    return pageTexts.join('\n').trim()
  } finally {
    await loadingTask?.destroy()
  }
}

export async function extractRequirementsWithAI(requirementText: string): Promise<RequirementRule[]> {
  const trimmed = requirementText.trim()
  if (trimmed.length < 10) return []

  const response = await fetch('/api/extract-requirements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requirementText: trimmed.slice(0, 16000) }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: '网络请求失败' }))
    throw new Error(errorData.error || `请求失败 (${response.status})`)
  }

  const data = await response.json()
  return data.rules || []
}

export async function inspectPdf(
  uploaded: UploadedPdf,
  rules: RequirementRule[],
  onProgress?: (step: number) => void,
): Promise<PdfInspectionResult> {
  const sourceFile = uploaded.file
  if (!sourceFile) throw new Error('演示文件不参与真实 PDF 解析。')
  onProgress?.(0)
  const { getDocument } = await loadPdfJs()
  let pdf: PDFDocumentProxy | undefined
  let loadingTask: PDFDocumentLoadingTask | undefined
  try {
    loadingTask = getDocument({ data: new Uint8Array(await sourceFile.arrayBuffer()) })
    pdf = await loadingTask.promise
    const metadataResult = await pdf.getMetadata().catch(() => ({ info: {}, metadata: null }))
    const metadata = metadataFromInfo(metadataResult.info)

    onProgress?.(1)
    const pageTexts: string[] = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      pageTexts.push(textFromItems(content.items))
    }
    const fullText = pageTexts.join('\n')
    const totalWords = countWords(fullText)
    const referenceLocation = firstReferenceLocation(pageTexts)
    const bodyText = referenceLocation
      ? [...pageTexts.slice(0, referenceLocation.pageIndex), pageTexts[referenceLocation.pageIndex].slice(0, referenceLocation.characterIndex)].join('\n')
      : fullText
    const bodyWords = countWords(bodyText)
    const confirmedRules = rules.filter((rule) => rule.confirmed)
    const checks: CheckItem[] = []

    checks.push({
      id: 'pdf-format',
      severity: 'passed',
      title: '文件格式与结构有效',
      detail: '文件具有有效的 PDF 结构，并已成功解析。',
      requirement: confirmedRules.find((rule) => rule.type === '格式')?.value || '可解析的文字型 PDF',
      current: 'application/pdf · 结构有效',
      action: '无需处理。',
      location: '文件属性',
    })
    checks.push({
      id: 'text-extraction',
      severity: totalWords > 20 ? 'passed' : 'review',
      title: totalWords > 20 ? '文字提取完成' : '可提取文字较少',
      detail: totalWords > 20 ? `已从 ${pdf.numPages} 页中提取文本。` : '文档中的可提取文字很少，部分检查结论可能不完整。',
      requirement: '文字型 PDF',
      current: `全文约 ${totalWords.toLocaleString()} words`,
      action: totalWords > 20 ? '无需处理。' : '请确认文件不是扫描件，并人工复核结果。',
      location: '全文',
    })

    const limitRule = confirmedRules.find((rule) => rule.type === '限制')
    const sizeLimit = limitRule?.value.match(/([\d.]+)\s*MB/i)?.[1]
    if (sizeLimit) {
      const limitBytes = Number(sizeLimit) * 1024 * 1024
      const passed = uploaded.sizeBytes <= limitBytes
      checks.push({
        id: 'file-size',
        severity: passed ? 'passed' : 'must_fix',
        title: passed ? '文件大小符合限制' : '文件大小超过限制',
        detail: passed ? `文件低于 ${sizeLimit} MB 限制。` : '提交平台可能拒绝接收该文件。',
        requirement: `≤ ${sizeLimit} MB`,
        current: uploaded.size,
        action: passed ? '无需处理。' : '请压缩 PDF 后重新运行检查。',
        location: '文件属性',
      })
    }
    const pageLimit = limitRule?.value.match(/(\d+)\s*pages?/i)?.[1]
    if (pageLimit) {
      const passed = pdf.numPages <= Number(pageLimit)
      checks.push({
        id: 'page-count',
        severity: passed ? 'passed' : 'must_fix',
        title: passed ? '页数符合限制' : '页数超过限制',
        detail: passed ? `文档共 ${pdf.numPages} 页。` : `当前文档比上限多 ${pdf.numPages - Number(pageLimit)} 页。`,
        requirement: `≤ ${pageLimit} pages`,
        current: `${pdf.numPages} pages`,
        action: passed ? '无需处理。' : '请在原始文档中调整内容后重新导出 PDF。',
        location: '文件属性',
      })
    }

    const filenameRule = confirmedRules.find((rule) => rule.type === '命名')
    if (filenameRule) {
      const passed = matchesFilenameTemplate(uploaded.name, filenameRule.value)
      checks.push({
        id: 'filename',
        severity: passed ? 'passed' : 'must_fix',
        title: passed ? '文件名符合模板' : '文件名不符合要求',
        detail: passed ? '当前文件名与已确认模板匹配。' : '文件名与已确认模板不匹配，提交前需要重命名。',
        requirement: filenameRule.value,
        current: uploaded.name,
        action: passed ? '无需处理。' : `将文件重命名为符合“${filenameRule.value}”结构的名称。`,
        location: '文件属性',
      })
    }

    const wordRule = confirmedRules.find((rule) => rule.type === '字数')
    const wordLimit = wordRule ? parseNumber(wordRule.value) : null
    if (wordLimit) {
      const ratio = bodyWords / wordLimit
      const severity: Severity = ratio > 1 ? 'must_fix' : ratio >= 0.9 ? 'review' : 'passed'
      checks.push({
        id: 'word-count',
        severity,
        title: severity === 'must_fix' ? '正文字数估算超过上限' : severity === 'review' ? '正文字数接近上限' : '正文字数估算符合限制',
        detail: referenceLocation ? `已尝试从第 ${referenceLocation.pageIndex + 1} 页的“${referenceLocation.heading}”开始排除参考文献。` : '未可靠识别参考文献起点，正文数字为全文估算。',
        requirement: `正文不超过 ${wordLimit.toLocaleString()} words`,
        current: `正文约 ${bodyWords.toLocaleString()} words · 全文约 ${totalWords.toLocaleString()} words`,
        action: severity === 'passed' ? '仍建议以原始编辑器的字数统计为准。' : '请在原始文档中核对字数；PDF 统计属于估算值。',
        location: referenceLocation ? `第 1–${referenceLocation.pageIndex + 1} 页` : '全文',
        page: 1,
      })
    }

    onProgress?.(2)
    const sectionRule = confirmedRules.find((rule) => rule.type === '章节')
    if (sectionRule) {
      const requiredSections = sectionRule.value.split(/[,，、;；]/).map((value) => value.trim()).filter(Boolean)
      for (const section of requiredSections) {
        const result = findSection(pageTexts, section)
        const id = `section-${section.toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, '-')}`
        if (result?.status === 'exact') {
          checks.push({
            id,
            severity: 'passed',
            title: `已找到 ${section}`,
            detail: '章节标题与已确认要求明确匹配。',
            requirement: `必须包含 ${section}`,
            current: `${result.match} · 第 ${result.page} 页`,
            action: '无需处理。',
            location: `第 ${result.page} 页`,
            page: result.page,
          })
        } else if (result?.status === 'possible') {
          checks.push({
            id,
            severity: 'review',
            title: `找到可能对应 ${section} 的章节`,
            detail: `“${result.match}”可能是语义相近标题，需要人工确认。`,
            requirement: `必须包含 ${section}`,
            current: `${result.match} · 第 ${result.page} 页`,
            action: `确认“${result.match}”是否满足老师对 ${section} 的要求。`,
            location: `第 ${result.page} 页`,
            page: result.page,
          })
        } else {
          checks.push({
            id,
            severity: 'must_fix',
            title: `未找到 ${section}`,
            detail: '未检测到可靠的章节标题匹配。',
            requirement: `必须包含 ${section}`,
            current: '未找到可靠匹配',
            action: '返回原始文档确认是否缺少该章节，或是否使用了不同标题。',
            location: '全文',
          })
        }
      }
    }

    onProgress?.(3)
    const anonymityRule = confirmedRules.find((rule) => rule.type === '匿名')
    if (anonymityRule) {
      const emails = pageTexts.flatMap((text, pageIndex) => Array.from(text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi), (match) => ({ value: match[0], page: pageIndex + 1 })))
      if (emails.length) {
        checks.push({
          id: 'email-privacy',
          severity: 'must_fix',
          title: '正文中发现邮箱地址',
          detail: '匿名评分要求可能因此失效，结果中已对邮箱进行掩码。',
          requirement: anonymityRule.value,
          current: `${maskEmail(emails[0].value)}${emails.length > 1 ? ` 等 ${emails.length} 处` : ''}`,
          action: '请在原始文档中删除邮箱地址后重新导出。',
          location: `第 ${emails[0].page} 页`,
          page: emails[0].page,
        })
      }

      const metadataValues = [
        ['Author', metadata.author],
        ['Title', metadata.title],
        ['Subject', metadata.subject],
        ['Keywords', metadata.keywords],
      ].filter((entry): entry is [string, string] => Boolean(entry[1]))
      const hasAuthor = Boolean(metadata.author)
      checks.push({
        id: 'metadata-privacy',
        severity: metadataValues.length ? (hasAuthor ? 'must_fix' : 'review') : 'passed',
        title: metadataValues.length ? 'PDF 包含可识别元数据' : '未发现需要清理的身份元数据',
        detail: metadataValues.length ? '匿名提交前应人工确认这些字段是否包含身份信息。' : '作者、标题、主题和关键词字段为空。',
        requirement: anonymityRule.value,
        current: metadataValues.length ? metadataValues.map(([key, value]) => `${key}: ${value}`).join(' · ') : '未发现相关字段',
        action: metadataValues.length ? '在原始文档属性中清除敏感字段后重新导出 PDF。' : '无需处理。',
        location: '文档元数据',
        fixable: false,
      })
      if (!emails.length && !metadataValues.length) {
        checks.push({
          id: 'anonymous-text-note',
          severity: 'review',
          title: '姓名仍需人工复核',
          detail: '系统不会在用户未提供姓名时猜测真实身份。',
          requirement: anonymityRule.value,
          current: '未检测邮箱；未执行姓名猜测',
          action: '提交前请人工检查封面、页眉和致谢等位置。',
          location: '全文',
        })
      }
    }

    onProgress?.(4)
    checks.sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity))
    return { checks, pageTexts, totalWords, bodyWords, metadata }
  } catch (error) {
    throw new Error(friendlyPdfError(error))
  } finally {
    await loadingTask?.destroy()
  }
}
