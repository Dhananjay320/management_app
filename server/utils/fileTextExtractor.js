const fs = require('fs');
const path = require('path');

/**
 * Extract readable text from a file on disk.
 * Supports: PDF, DOCX, TXT, CSV, JSON, HTML, MD, JS/TS/CSS/XML etc.
 */
async function extractTextFromFile(filePath, mimeType) {
  try {
    if (!fs.existsSync(filePath)) return '';

    const ext = path.extname(filePath).toLowerCase();

    // PDF
    if (ext === '.pdf' || (mimeType && mimeType.includes('pdf'))) {
      const pdfParse = require('pdf-parse');
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      return data.text || '';
    }

    // DOCX (Word)
    if (ext === '.docx' || (mimeType && mimeType.includes('wordprocessingml'))) {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value || '';
    }

    // Plain text and code files
    const textExtensions = [
      '.txt', '.md', '.csv', '.json', '.xml', '.html', '.htm',
      '.js', '.ts', '.jsx', '.tsx', '.css', '.scss', '.less',
      '.py', '.rb', '.java', '.c', '.cpp', '.h', '.go', '.rs',
      '.yaml', '.yml', '.toml', '.ini', '.cfg', '.env', '.sh',
      '.sql', '.log', '.rtf'
    ];

    const textMimes = [
      'text/', 'application/json', 'application/xml',
      'application/javascript', 'application/x-yaml'
    ];

    const isTextExt = textExtensions.includes(ext);
    const isTextMime = mimeType && textMimes.some(m => mimeType.startsWith(m));

    if (isTextExt || isTextMime) {
      const content = fs.readFileSync(filePath, 'utf8');
      // Limit to 100KB of text to prevent memory issues
      return content.substring(0, 100 * 1024);
    }

    // DOC (old Word format) — try reading as text, won't be perfect but gets some content
    if (ext === '.doc' || (mimeType && mimeType.includes('msword'))) {
      try {
        const buffer = fs.readFileSync(filePath);
        // Extract printable ASCII from .doc binary
        const text = buffer.toString('utf8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s{3,}/g, ' ').trim();
        return text.substring(0, 50 * 1024);
      } catch { return ''; }
    }

    return '';
  } catch (err) {
    console.error(`File text extraction failed for ${filePath}:`, err.message);
    return '';
  }
}

/**
 * Check if a file type is extractable
 */
function isExtractable(mimeType, fileName) {
  if (!mimeType && !fileName) return false;
  const ext = fileName ? path.extname(fileName).toLowerCase() : '';

  const supported = [
    '.pdf', '.docx', '.doc', '.txt', '.md', '.csv', '.json', '.xml',
    '.html', '.htm', '.js', '.ts', '.jsx', '.tsx', '.css', '.py',
    '.yaml', '.yml', '.sql', '.log', '.rtf', '.sh'
  ];

  const supportedMimes = [
    'application/pdf', 'text/', 'application/json',
    'application/vnd.openxmlformats-officedocument.wordprocessingml',
    'application/msword', 'application/xml', 'application/javascript'
  ];

  return supported.includes(ext) || supportedMimes.some(m => (mimeType || '').startsWith(m));
}

module.exports = { extractTextFromFile, isExtractable };
