const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

/**
 * Извлекает текст из буфера файла в зависимости от расширения.
 */
async function extractText(buffer, fileName) {
  const lower = fileName.toLowerCase();

  if (lower.endsWith('.pdf')) {
    const result = await pdfParse(buffer);
    return result.text.trim();
  }

  if (lower.endsWith('.docx')) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }

  if (lower.endsWith('.txt')) {
    return buffer.toString('utf-8').trim();
  }

  throw new Error('Поддерживаются только файлы .pdf, .docx и .txt');
}

module.exports = { extractText };
