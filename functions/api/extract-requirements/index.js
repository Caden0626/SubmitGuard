// POST /api/extract-requirements
// Body: { requirementText: string }
// Returns: { rules: RequirementRule[] }

const SYSTEM_PROMPT = `You are a requirement extraction assistant for an academic assignment submission checker. Given an assignment requirement text, extract structured rules.

Output a JSON object with a "rules" array. ONLY include rules that are explicitly stated in the text. Do not invent or guess.

Each rule object must have:
- "type": one of "格式" (format), "命名" (naming), "字数" (word count), "章节" (sections), "匿名" (anonymity), "限制" (limits), "引用" (citation), "提醒" (reminder), "自定义" (custom)
- "label": short human-readable label in Chinese (e.g. "提交格式", "文件名模板", "正文最大字数")
- "value": the specific requirement value (e.g. "PDF", "StudentID_LastName_BA602.pdf", "2,500 words")
- "source": the exact sentence from the text that supports this rule, truncated to 120 characters if longer, prefixed with "…"
- "confidence": a number 0-100 indicating how confident you are about this rule extraction

Guidelines:
- 格式: file format requirements (PDF, Word, etc.)
- 命名: filename templates or naming conventions (e.g. "StudentID_LastName_CourseCode.pdf")
- 字数: word count limits for the body text
- 章节: required sections or chapters (comma-separated if multiple, e.g. "Executive Summary, Introduction, Analysis, Conclusion, References")
- 匿名: anonymous marking requirements (remove names, emails, student IDs from the document)
- 限制: page limits, file size limits, or other constraints. Combine page and size limits into one rule if both exist.
- 引用: citation/referencing style requirements (APA, MLA, Harvard, Chicago, etc.)
- 提醒: deadlines, submission portal instructions, or other important notices
- 自定义: any other explicit requirements that don't fit the above categories

Mark confidence as:
- 95-100: very clear, explicit statement
- 85-94: reasonably clear but slightly ambiguous
- 70-84: implied or needs interpretation
- Below 70: do not include

If no rules can be extracted, return { "rules": [] }.

IMPORTANT: Return ONLY valid JSON. No markdown, no code blocks, no explanation.`

function extractJson(text) {
  // Try direct parse first
  try { return JSON.parse(text) } catch {}

  // Try to extract from ```json ... ``` code block
  const codeBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1]) } catch {}
  }

  // Try to find the first { and last }
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try { return JSON.parse(text.slice(firstBrace, lastBrace + 1)) } catch {}
  }

  return null
}

export async function onRequest(context) {
  // CORS headers for local dev
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers })
  }

  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers })
  }

  try {
    const body = await context.request.json()
    const requirementText = (body.requirementText || '').trim()

    if (requirementText.length < 10) {
      return new Response(JSON.stringify({ error: '作业要求文本太短，至少需要 10 个字符。' }), { status: 400, headers })
    }

    if (requirementText.length > 16000) {
      return new Response(JSON.stringify({ error: '文本超过 16,000 字符限制，请精简后再试。' }), { status: 400, headers })
    }

    const apiKey = context.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      return new Response(JSON.stringify({ error: '服务端未配置 API Key。' }), { status: 500, headers })
    }

    const aiResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: requirementText },
        ],
        temperature: 0.1,
        max_tokens: 2048,
      }),
    })

    if (!aiResponse.ok) {
      const errText = await aiResponse.text().catch(() => '')
      console.error(`DeepSeek API error ${aiResponse.status}: ${errText}`)
      return new Response(JSON.stringify({ error: `AI 服务暂时不可用 (${aiResponse.status})，请稍后重试。` }), { status: 502, headers })
    }

    const data = await aiResponse.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      return new Response(JSON.stringify({ error: 'AI 返回了空内容，请重试。' }), { status: 502, headers })
    }

    let parsed
    try {
      parsed = extractJson(content)
      if (!parsed) {
        console.error('Failed to parse AI response:', content.slice(0, 500))
        return new Response(JSON.stringify({ error: 'AI 返回格式异常，请重试。' }), { status: 502, headers })
      }
    } catch {
      return new Response(JSON.stringify({ error: 'AI 返回格式异常，请重试。' }), { status: 502, headers })
    }

    const rules = (parsed.rules || []).map((rule, index) => ({
      id: index + 1,
      type: rule.type || '自定义',
      label: rule.label || '未知规则',
      value: rule.value || '',
      source: rule.source || '',
      confidence: Math.min(100, Math.max(0, Number(rule.confidence) || 80)),
      confirmed: (Number(rule.confidence) || 80) >= 90,
    }))

    return new Response(JSON.stringify({ rules }), { headers })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? (error.stack || '').split('\n').slice(0, 3).join(' | ') : ''
    console.error('Extract error:', msg, stack)
    return new Response(JSON.stringify({ error: `服务器内部错误: ${msg}` }), { status: 500, headers })
  }
}