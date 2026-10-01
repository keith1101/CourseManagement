import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import PDFDocument from 'pdfkit';
import ipaddr from 'ipaddr.js';
import sharp from 'sharp';
import { QuestionType } from '../../generated/client/enums';
import { PrismaService } from '../prisma/prisma.service';
import { R2StorageService } from '../storage/r2-storage.service';

type PdfOption = {
  contentText: string;
  imageUrl: string | null;
  isCorrect: boolean;
};

type PdfQuestion = {
  questionType: QuestionType;
  contentText: string;
  imageUrl: string | null;
  instruction: string | null;
  position: number;
  questionOptions: PdfOption[];
  questionParts: Array<{
    contentText: string;
    correctAnswer: string;
    position: number;
  }>;
  correctTextAnswer: string | null;
  questionAcceptedAnswers: Array<{
    rawValue: string;
    content: string | null;
    position: number;
    isPrimary: boolean;
  }>;
};

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;
const MAX_IMAGE_SIZE = { width: CONTENT_WIDTH - 28, height: 230 };
const LABELS = ['A', 'B', 'C', 'D'];
const MAX_REMOTE_IMAGE_BYTES = 8 * 1024 * 1024;

@Injectable()
export class ExamPdfService {
  private readonly regularFont = require.resolve(
    '@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff',
  );
  private readonly vietnameseFont = require.resolve(
    '@fontsource/noto-sans/files/noto-sans-vietnamese-400-normal.woff',
  );
  private readonly boldFont = require.resolve(
    '@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff',
  );
  private readonly vietnameseBoldFont = require.resolve(
    '@fontsource/noto-sans/files/noto-sans-vietnamese-700-normal.woff',
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: R2StorageService,
  ) {}

  async generate(examId: string): Promise<{ filename: string; buffer: Buffer }> {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, deletedAt: null },
      select: {
        title: true,
        questions: {
          where: { deletedAt: null },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          select: {
            questionType: true,
            contentText: true,
            imageUrl: true,
            instruction: true,
            position: true,
            correctTextAnswer: true,
            questionOptions: {
              orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
              select: { contentText: true, imageUrl: true, isCorrect: true },
            },
            questionParts: {
              orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
              select: { contentText: true, correctAnswer: true, position: true },
            },
            questionAcceptedAnswers: {
              where: { isCorrect: true },
              orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }],
              select: { rawValue: true, content: true, position: true, isPrimary: true },
            },
          },
        },
      },
    });

    if (!exam) throw new NotFoundException('Exam not found');

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      info: { Title: exam.title, Subject: 'Exam questions and answer key' },
    });
    const chunks: Buffer[] = [];
    const pdfBuffer = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.once('end', () => resolve(Buffer.concat(chunks)));
      doc.once('error', reject);
    });

    doc.font(this.regularFont);
    this.drawTitle(doc, exam.title);

    const questions = exam.questions as PdfQuestion[];
    const answerRows: Array<{ number: number; answer: string }> = [];

    for (const [index, question] of questions.entries()) {
      const number = index + 1;
      this.ensureSpace(doc, 74);
      doc.moveDown(0.8);
      doc.font(this.boldFont).fontSize(12).fillColor('#173b63');
      this.writeText(doc, `Câu ${number}`, { width: CONTENT_WIDTH }, true);
      doc.moveDown(0.25);

      doc.font(this.regularFont).fontSize(10.5).fillColor('#202833');
      const prompt = question.instruction
        ? `${question.instruction}\n${question.contentText}`
        : question.contentText;
      this.writeText(doc, prompt, { width: CONTENT_WIDTH });
      doc.moveDown(0.35);

      await this.drawImage(doc, question.imageUrl);

      let answer = 'Tự luận';
      if (question.questionType === QuestionType.MULTIPLE_CHOICE) {
        for (const [optionIndex, option] of question.questionOptions.entries()) {
          this.ensureSpace(doc, 30);
          const label = LABELS[optionIndex] ?? String.fromCharCode(65 + optionIndex);
          doc.font(this.boldFont).fontSize(10.5).fillColor('#283a4e');
          const optionY = doc.y;
          this.writeText(doc, `${label}.`, {
            x: MARGIN,
            y: optionY,
            width: 25,
          }, true);
          doc.font(this.regularFont).fillColor('#202833');
          this.writeText(doc, option.contentText, {
            x: MARGIN + 25,
            y: optionY,
            width: CONTENT_WIDTH - 25,
          });
          doc.y = Math.max(doc.y, optionY + doc.currentLineHeight(true));
          doc.moveDown(0.1);
          await this.drawImage(doc, option.imageUrl, 26);
          if (option.isCorrect && answer === 'Tự luận') answer = label;
        }
        if (answer === 'Tự luận') answer = 'Chưa thiết lập đáp án';
      } else if (question.questionType === QuestionType.MULTI_PART_SHORT_ANSWER) {
        question.questionParts.forEach((part, partIndex) => {
          this.ensureSpace(doc, 34);
          doc.font(this.regularFont).fontSize(10).fillColor('#202833');
          this.writeText(doc, `${String.fromCharCode(97 + partIndex)}) ${part.contentText}`, {
            width: CONTENT_WIDTH - 12,
            indent: 12,
          });
          doc.moveDown(0.2);
        });
        answer = question.questionParts.length
          ? question.questionParts
              .map((part, partIndex) => `${String.fromCharCode(97 + partIndex)}) ${part.correctAnswer}`)
              .join('; ')
          : 'Chưa thiết lập đáp án';
      } else {
        question.questionParts.forEach((part, partIndex) => {
          this.ensureSpace(doc, 34);
          doc.font(this.regularFont).fontSize(10).fillColor('#202833');
          this.writeText(doc, `${String.fromCharCode(97 + partIndex)}) ${part.contentText}`, {
            width: CONTENT_WIDTH - 12,
            indent: 12,
          });
          doc.moveDown(0.2);
        });
        const accepted = question.questionAcceptedAnswers[0];
        if (accepted) answer = accepted.content || accepted.rawValue;
        else if (question.correctTextAnswer) answer = question.correctTextAnswer;
      }
      answerRows.push({ number, answer });
    }

    doc.addPage();
    this.drawTitle(doc, exam.title, 'BẢNG ĐÁP ÁN');
    this.drawAnswerTable(doc, answerRows);

    doc.end();
    return {
      filename: `${this.safeFilename(exam.title)}.pdf`,
      buffer: await pdfBuffer,
    };
  }

  private drawTitle(doc: PDFKit.PDFDocument, title: string, subtitle?: string) {
    doc.font(this.boldFont).fontSize(19).fillColor('#123c67');
    this.writeText(doc, title, { width: CONTENT_WIDTH, align: 'center' }, true);
    doc.moveDown(0.35);
    if (subtitle) {
      doc.font(this.boldFont).fontSize(14).fillColor('#283a4e');
      this.writeText(doc, subtitle, { width: CONTENT_WIDTH, align: 'center' }, true);
    }
    doc.moveDown(0.8);
    doc.strokeColor('#d9e1ea').lineWidth(1);
    doc.moveTo(MARGIN, doc.y).lineTo(PAGE.width - MARGIN, doc.y).stroke();
    doc.moveDown(0.2);
  }

  private drawAnswerTable(
    doc: PDFKit.PDFDocument,
    rows: Array<{ number: number; answer: string }>,
  ) {
    const columns = 2;
    const cellWidth = CONTENT_WIDTH / columns;
    for (let index = 0; index < rows.length; index += columns) {
      const pair = rows.slice(index, index + columns);
      doc.font(this.regularFont).fontSize(9.5);
      const rowHeight = Math.max(
        34,
        ...pair.map((row) =>
          doc.heightOfString(row.answer, { width: cellWidth - 58 }) + 16,
        ),
      );
      this.ensureSpace(doc, rowHeight + 8);
      const y = doc.y;
      pair.forEach((row, column) => {
        const x = MARGIN + column * cellWidth;
        doc.roundedRect(x, y, cellWidth - 8, rowHeight, 4)
          .lineWidth(0.6)
          .strokeColor('#d9e1ea')
          .stroke();
        doc.font(this.boldFont).fontSize(9.5).fillColor('#173b63');
        this.writeText(
          doc,
          `${row.number}.`,
          { x: x + 10, y: y + 8, width: 28 },
          true,
        );
        doc.font(this.regularFont).fontSize(9.5).fillColor('#202833');
        this.writeText(doc, row.answer, {
          x: x + 38,
          y: y + 8,
          width: cellWidth - 58,
          height: rowHeight - 12,
        });
      });
      doc.y = y + rowHeight + 8;
    }
    if (!rows.length) {
      doc.font(this.regularFont).fontSize(10).fillColor('#566273');
      this.writeText(doc, 'Đề thi chưa có câu hỏi.', { width: CONTENT_WIDTH, align: 'center' });
    }
  }

  private async drawImage(
    doc: PDFKit.PDFDocument,
    imageReference: string | null | undefined,
    indent = 0,
  ) {
    if (!imageReference) return;
    let image: Buffer;
    try {
      image = this.storage.isManagedObjectKey(imageReference)
        ? await this.storage.download(imageReference)
        : await this.downloadPublicImage(imageReference);
      image = await sharp(image, { limitInputPixels: 20_000_000 })
        .rotate()
        .png()
        .toBuffer();
    } catch {
      throw new ServiceUnavailableException(
        'Không thể tải hoặc xử lý ảnh để xuất PDF. Vui lòng kiểm tra ảnh và thử lại.',
      );
    }

    try {
      const opened = (doc as PDFKit.PDFDocument & {
        openImage: (source: Buffer) => { width: number; height: number };
      }).openImage(image);
      const scale = Math.min(
        (MAX_IMAGE_SIZE.width - indent) / opened.width,
        MAX_IMAGE_SIZE.height / opened.height,
        1,
      );
      const width = opened.width * scale;
      const height = opened.height * scale;
      this.ensureSpace(doc, height + 12);
      const y = doc.y;
      doc.image(image, MARGIN + indent, y, { width, height });
      doc.y = y + height + 10;
    } catch {
      this.drawImageNotice(doc, indent);
    }
  }

  private async downloadPublicImage(reference: string): Promise<Buffer> {
    const url = new URL(reference);
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) {
      throw new Error('Unsupported image URL');
    }
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    const publicAddress = addresses.find(({ address }) => {
      try {
        return ipaddr.parse(address).range() === 'unicast';
      } catch {
        return false;
      }
    });
    if (!publicAddress || addresses.some(({ address }) => ipaddr.parse(address).range() !== 'unicast')) {
      throw new Error('Image host resolves to a non-public address');
    }

    return new Promise<Buffer>((resolve, reject) => {
      const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;
      const req = transport(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || undefined,
          path: `${url.pathname}${url.search}`,
          method: 'GET',
          headers: { Accept: 'image/*' },
          lookup: (_hostname, _options, callback) =>
            callback(null, publicAddress.address, publicAddress.family),
          timeout: 8_000,
        },
        (response) => {
          const contentType = response.headers['content-type']?.split(';')[0].trim();
          if (
            response.statusCode !== 200 ||
            !contentType?.startsWith('image/') ||
            Number(response.headers['content-length'] ?? 0) > MAX_REMOTE_IMAGE_BYTES
          ) {
            response.destroy();
            reject(new Error('Image URL did not return a supported image'));
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          response.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_REMOTE_IMAGE_BYTES) {
              response.destroy(new Error('Remote image is too large'));
              return;
            }
            chunks.push(chunk);
          });
          response.once('end', () => resolve(Buffer.concat(chunks)));
          response.once('error', reject);
        },
      );
      req.once('timeout', () => req.destroy(new Error('Image request timed out')));
      req.once('error', reject);
      req.end();
    });
  }

  private drawImageNotice(doc: PDFKit.PDFDocument, indent: number) {
    this.ensureSpace(doc, 28);
    doc.font(this.regularFont).fontSize(8).fillColor('#7b8490');
    this.writeText(doc, '[Ảnh không thể nhúng vào PDF]', {
      width: CONTENT_WIDTH - indent,
      indent,
    });
    doc.moveDown(0.3);
  }

  private ensureSpace(doc: PDFKit.PDFDocument, height: number) {
    if (doc.y + height > PAGE.height - MARGIN - 20) doc.addPage();
  }

  private writeText(
    doc: PDFKit.PDFDocument,
    text: string,
    options: PDFKit.Mixins.TextOptions & { x?: number; y?: number },
    bold = false,
  ) {
    const normalFont = bold ? this.boldFont : this.regularFont;
    const vietnameseFont = bold ? this.vietnameseBoldFont : this.vietnameseFont;
    const normalized = (text || '').normalize('NFC');
    const { x, y, width, align, indent = 0 } = options;
    const left = x ?? MARGIN;
    const availableWidth = width ?? CONTENT_WIDTH;
    const fontSize = (doc as any)._fontSize ?? 10;
    const lineHeight = doc.currentLineHeight(true) + 2;
    let cursorY = y ?? doc.y;
    let maxY = cursorY;
    const flowsInDocument = x === undefined && y === undefined;

    const getFont = (char: string) =>
      /[\u0100-\u024f\u1e00-\u1eff]/u.test(char)
        ? vietnameseFont
        : normalFont;
    const measure = (value: string) => {
      let measured = 0;
      for (const [font, content] of this.fontRuns(value, getFont)) {
        doc.font(font).fontSize(fontSize);
        measured += doc.widthOfString(content);
      }
      return measured;
    };
    const drawLine = (value: string, firstLine: boolean) => {
      if (flowsInDocument) {
        doc.y = cursorY;
        this.ensureSpace(doc, lineHeight);
        cursorY = doc.y;
      }
      const lineIndent = firstLine ? indent : 0;
      const lineWidth = measure(value);
      let cursorX = left + lineIndent;
      if (align === 'center') cursorX += Math.max(0, (availableWidth - lineIndent - lineWidth) / 2);
      else if (align === 'right') cursorX += Math.max(0, availableWidth - lineIndent - lineWidth);
      for (const [font, content] of this.fontRuns(value, getFont)) {
        doc.font(font).fontSize(fontSize).text(content, cursorX, cursorY, {
          lineBreak: false,
        });
        cursorX += doc.widthOfString(content);
      }
      maxY = Math.max(maxY, cursorY + lineHeight);
      cursorY += lineHeight;
      if (flowsInDocument) doc.y = cursorY;
    };

    let firstLine = true;
    const paragraphs = normalized.split(/\r?\n/);
    for (const [paragraphIndex, paragraph] of paragraphs.entries()) {
      let line = '';
      let lineWidth = 0;
      const words = paragraph.match(/\S+/gu) ?? [];
      for (const word of words) {
        const space = line ? ' ' : '';
        const wordWidth = measure(word);
        const spaceWidth = space ? measure(space) : 0;
        const lineAvailable = availableWidth - (firstLine ? indent : 0);
        if (line && lineWidth + spaceWidth + wordWidth > lineAvailable) {
          drawLine(line, firstLine);
          firstLine = false;
          line = '';
          lineWidth = 0;
        }
        if (wordWidth > availableWidth - (firstLine ? indent : 0)) {
          for (const char of Array.from(word)) {
            const charWidth = measure(char);
            if (line && lineWidth + charWidth > availableWidth - (firstLine ? indent : 0)) {
              drawLine(line, firstLine);
              firstLine = false;
              line = '';
              lineWidth = 0;
            }
            line += char;
            lineWidth += charWidth;
          }
        } else {
          if (line) {
            line += space;
            lineWidth += spaceWidth;
          }
          line += word;
          lineWidth += wordWidth;
        }
      }
      if (line) drawLine(line, firstLine);
      else if (!words.length && !firstLine) drawLine('', false);
      firstLine = false;
      if (paragraphIndex < paragraphs.length - 1) cursorY += 3;
    }

    doc.y = Math.max(doc.y, maxY);
  }

  private fontRuns(
    text: string,
    getFont: (char: string) => string,
  ): Array<[string, string]> {
    const runs: Array<[string, string]> = [];
    for (const char of Array.from(text)) {
      const font = getFont(char);
      const previous = runs[runs.length - 1];
      if (previous?.[0] === font) previous[1] += char;
      else runs.push([font, char]);
    }
    return runs;
  }

  private safeFilename(title: string) {
    const normalized = title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9-_ ]/g, '')
      .trim()
      .replace(/\s+/g, '-');
    return normalized.slice(0, 80) || 'exam';
  }
}
