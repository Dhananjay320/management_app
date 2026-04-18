const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);

// Per spec Topic 4: Lossless compression — maximum compression without quality loss
// Per file type approach

async function compressFile(inputPath, mimeType) {
  const originalSize = fs.statSync(inputPath).size;
  const ext = path.extname(inputPath).toLowerCase();
  let compressedPath = inputPath;
  let compressedSize = originalSize;
  let method = 'none';

  try {
    // Images: Sharp lossless optimization — removes metadata
    if (['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(mimeType) || ['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      const outputPath = inputPath + '.compressed';
      const format = ext === '.png' ? 'png' : ext === '.webp' ? 'webp' : 'jpeg';
      await sharp(inputPath)
        .toFormat(format, format === 'png' ? { compressionLevel: 9 } : format === 'webp' ? { lossless: true } : { quality: 100, mozjpeg: true })
        .toFile(outputPath);
      fs.renameSync(outputPath, inputPath);
      compressedSize = fs.statSync(inputPath).size;
      method = 'sharp';
    }

    // PDF: pdf-lib — removes redundant data
    else if (mimeType === 'application/pdf' || ext === '.pdf') {
      const pdfBytes = fs.readFileSync(inputPath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const savedBytes = await pdfDoc.save({ useObjectStreams: true });
      fs.writeFileSync(inputPath, savedBytes);
      compressedSize = savedBytes.length;
      method = 'pdf-lib';
    }

    // Office docs: zlib max level — recompress ZIP container
    else if (['.docx', '.xlsx', '.pptx'].includes(ext) ||
      ['application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'].includes(mimeType)) {
      const data = fs.readFileSync(inputPath);
      const compressed = await gzip(data, { level: 9 });
      fs.writeFileSync(inputPath + '.gz', compressed);
      compressedSize = compressed.length;
      compressedPath = inputPath + '.gz';
      method = 'zlib-office';
    }

    // Text, JSON, CSV, XML: gzip — 60-80% reduction
    else if (['text/plain', 'text/csv', 'application/json', 'text/xml', 'application/xml', 'text/html', 'text/css', 'text/javascript'].includes(mimeType) ||
      ['.txt', '.csv', '.json', '.xml', '.html', '.css', '.js', '.md'].includes(ext)) {
      const data = fs.readFileSync(inputPath);
      const compressed = await gzip(data, { level: 9 });
      fs.writeFileSync(inputPath + '.gz', compressed);
      compressedSize = compressed.length;
      compressedPath = inputPath + '.gz';
      method = 'gzip';
    }

    // Audio/Video: store as-is (per spec: lossless audio marginal, video too CPU heavy)
    // Folders (ZIP): already compressed, store as-is

  } catch (err) {
    console.error(`Compression error for ${inputPath}:`, err.message);
    // On error, keep original file
  }

  const compressionRatio = originalSize > 0 ? Math.round((compressedSize / originalSize) * 100) / 100 : 1;

  return {
    originalSize,
    compressedSize,
    compressionRatio,
    compressionMethod: method,
    path: compressedPath
  };
}

module.exports = { compressFile };
