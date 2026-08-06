import { writeFileSync } from 'fs'

// 模拟的真实作业说明（多页，包含各种规则）
const requirements = [
  `Business Analytics BA602 — Individual Report Assignment Brief

Submission Deadline: 15th May 2026, 23:59 (GMT)

1. Assignment Overview
This individual report requires you to analyse a real-world business case using the frameworks covered in Weeks 1–10. You must submit your work as a single PDF file through the university's online submission portal.

2. Format Requirements
The report must be submitted in PDF format only. Word documents and other formats will not be accepted. The file name must follow the template: StudentID_LastName_BA602.pdf (e.g., 24019381_Morgan_BA602.pdf).

3. Word Count
The main body of the report must not exceed 2,500 words. This limit excludes the Executive Summary, References, and Appendices. Please note that the word count is strict — submissions exceeding the limit will be penalised by 5% per 100 words over.

4. Required Sections
Your report must include the following sections in order:
- Executive Summary
- Introduction
- Analysis
- Findings and Discussion
- Conclusion
- Recommendations
- References
- Appendix (optional)

5. Page Limit and File Size
The report must not exceed 15 pages. The PDF file size must be no more than 20 MB. Files exceeding either limit will be rejected by the submission system.

6. Anonymity and Blind Marking
This assignment is subject to anonymous marking. Do not include your name, student ID, or email address anywhere in the document body. The cover page should contain only your student ID number, not your full name. Any identifying information in the document metadata (Author, Title fields) must be removed before submission.

7. Referencing Style
All sources must be cited using APA 7th edition referencing style. A complete reference list must be included at the end of the document. In-text citations should follow the (Author, Year) format.

8. Submission Instructions
Upload your completed PDF to the BA602 submission portal on the university learning management system. Late submissions will incur a penalty of 10% per day. Please allow sufficient time for the upload process — technical issues will not be accepted as grounds for extension.

9. Marking Criteria
Your report will be assessed on the following criteria:
- Quality of analysis (40%)
- Use of frameworks (25%)
- Structure and clarity (20%)
- Referencing and academic integrity (15%)

For any questions, please contact the module coordinator at ba602@university.ac.uk before the submission deadline.

Good luck with your assignment!`,

  `APPENDIX A: Report Structure Checklist

Use this checklist before submitting your report:

□ PDF format (not Word, not Pages)
□ File named: StudentID_LastName_BA602.pdf
□ Body text under 2,500 words (check with word counter)
□ All required sections present
□ Executive Summary included
□ Introduction included
□ Analysis section included
□ Findings and Discussion included
□ Conclusion included
□ Recommendations included
□ References section present
□ APA 7 referencing used throughout
□ No name or email in the document body
□ PDF metadata cleared (Author, Title fields)
□ File size under 20 MB
□ Total pages: 15 or fewer
□ Submitted before 15th May 2026, 23:59 GMT

Double-check everything. Missing any one of these could cost you marks.`,
]

// 生成简单的 PDF（手动构造，不依赖外部库）
function createPdf(pages) {
  const fonts = {
    F1: { name: 'Helvetica', obj: 5 },
  }

  let objCount = 6 // 1=catalog, 2=pages, 3..n=page objects
  const objects = []
  const pageObjects = []

  // Helvetica font
  objects.push(`5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj`)

  for (let i = 0; i < pages.length; i++) {
    const pageNum = i + 3 // page objects start at 3
    const contentNum = objCount++
    const text = pages[i]
    // Escape PDF special chars
    const escaped = text
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/\r/g, '')

    // Split text into lines (max 90 chars per line for readability)
    const lines = []
    for (const paragraph of escaped.split('\n')) {
      if (paragraph.trim() === '') {
        lines.push('')
        continue
      }
      // Word wrap at ~90 chars
      let line = ''
      for (const word of paragraph.split(' ')) {
        if (line && (line + ' ' + word).length > 85) {
          lines.push(line)
          line = word
        } else {
          line = line ? line + ' ' + word : word
        }
      }
      if (line) lines.push(line)
    }

    const fontHeight = 11
    const topMargin = 720
    const lineHeight = 14
    const maxLines = Math.floor((topMargin - 50) / lineHeight)

    let stream = 'BT\n/F1 11 Tf\n'
    const displayLines = lines.slice(0, maxLines)
    for (let l = 0; l < displayLines.length; l++) {
      const y = topMargin - l * lineHeight
      stream += `1 0 0 1 50 ${y} Tm (${displayLines[l]}) Tj\nT*\n`
    }
    stream += 'ET'

    const streamBytes = Buffer.from(stream, 'latin1')
    objects.push(`${contentNum} 0 obj
<< /Length ${streamBytes.length} >>
stream
${stream}
endstream
endobj`)

    pageObjects.push(`${pageNum} 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]
   /Contents ${contentNum} 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj`)
  }

  // Build the full PDF
  const catalog = `1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj`

  const pagesObj = `2 0 obj
<< /Type /Pages /Kids [${pageObjects.map((_, i) => `${i + 3} 0 R`).join(' ')}] /Count ${pageObjects.length} >>
endobj`

  const allObjects = [catalog, pagesObj, ...pageObjects, ...objects]
  const body = allObjects.join('\n\n')

  // Calculate xref offsets
  const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
  let offset = header.length
  const offsets = []
  for (const obj of allObjects) {
    offsets.push(offset)
    offset += obj.length + 2 // +2 for \n\n
  }

  const xref = `xref
0 ${allObjects.length + 1}
0000000000 65535 f \r
${offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \r').join('')}`

  const trailer = `trailer
<< /Size ${allObjects.length + 1} /Root 1 0 R >>
startxref
${offset}
%%EOF`

  return header + '\n' + allObjects.join('\n\n') + '\n' + xref + '\n' + trailer
}

const pdf = createPdf(requirements)
writeFileSync('public/test-assignment-brief.pdf', pdf)
console.log(`✅ PDF 已生成: public/test-assignment-brief.pdf (${(pdf.length / 1024).toFixed(1)} KB)`)
console.log('   包含 2 页，内容涵盖：')
console.log('   - PDF 格式要求')
console.log('   - 文件名模板：StudentID_LastName_BA602.pdf')
console.log('   - 正文字数限制：2,500 words')
console.log('   - 必需章节：Executive Summary, Introduction, Analysis, Findings, Conclusion, Recommendations, References, Appendix')
console.log('   - 匿名评分要求')
console.log('   - 页数限制：15 页，文件大小 20 MB')
console.log('   - 引用格式：APA 7')
console.log('   - 截止日期：2026-05-15')