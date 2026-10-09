import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import {
  BadRequestException,
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

type PdfImage = {
  buffer: Buffer;
  width: number;
  height: number;
};

type PreparedPdfOption = PdfOption & {
  image: PdfImage | null;
};

type PreparedPdfQuestion = PdfQuestion & {
  image: PdfImage | null;
  questionOptions: PreparedPdfOption[];
};

type TextLine = {
  text: string;
  indent: number;
};

type ImagePlacement = {
  image: PdfImage;
  width: number;
  height: number;
};

type OptionLayout = {
  label: string;
  lines: TextLine[];
  height: number;
  sourceImage: PdfImage | null;
  image: ImagePlacement | null;
};

type QuestionLayout = {
  height: number;
  promptLines: TextLine[];
  questionImage: ImagePlacement | null;
  options: OptionLayout[];
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
const QUESTION_BLOCK_GAP = 16;
const QUESTION_BLOCK_PADDING = 12;
const QUESTION_LABEL_HEIGHT = 18;
const QUESTION_TEXT_SIZE = 10.5;
const OPTION_TEXT_SIZE = 10;
const QUESTION_LINE_HEIGHT = 15;
const OPTION_LINE_HEIGHT = 14;
const QUESTION_IMAGE_MAX_HEIGHT = 220;
const OPTION_IMAGE_MAX_HEIGHT = 96;
const MIN_IMAGE_HEIGHT = 42;
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

    const questions = exam.questions as PdfQuestion[];
    const preparedQuestions: PreparedPdfQuestion[] = [];
    for (const question of questions) {
      preparedQuestions.push(await this.prepareQuestion(doc, question));
    }
    const answerRows: Array<{ number: number; answer: string }> = [];

    for (const [index, question] of questions.entries()) {
      answerRows.push({ number: index + 1, answer: this.answerFor(question) });
    }

    await this.drawQuestionPages(doc, exam.title, preparedQuestions);

    doc.addPage();
    this.drawTitle(doc, exam.title, 'BẢNG ĐÁP ÁN');
    this.drawAnswerTable(doc, answerRows);

    doc.end();
    return {
      filename: `${this.safeFilename(exam.title)}.pdf`,
      buffer: await pdfBuffer,
    };
  }

  private async prepareQuestion(
    doc: PDFKit.PDFDocument,
    question: PdfQuestion,
  ): Promise<PreparedPdfQuestion> {
    return {
      ...question,
      image: await this.prepareImage(doc, question.imageUrl),
      questionOptions: await Promise.all(
        question.questionOptions.map(async (option) => ({
          ...option,
          image: await this.prepareImage(doc, option.imageUrl),
        })),
      ),
    };
  }

  private async prepareImage(
    doc: PDFKit.PDFDocument,
    imageReference: string | null | undefined,
  ): Promise<PdfImage | null> {
    if (!imageReference) return null;

    let source: Buffer;
    try {
      source = this.storage.isManagedObjectKey(imageReference)
        ? await this.storage.download(imageReference)
        : await this.downloadPublicImage(imageReference);
      const buffer = await sharp(source, { limitInputPixels: 20_000_000 })
        .rotate()
        .png()
        .toBuffer();
      const opened = (doc as PDFKit.PDFDocument & {
        openImage: (value: Buffer) => { width: number; height: number };
      }).openImage(buffer);
      return { buffer, width: opened.width, height: opened.height };
    } catch {
      throw new ServiceUnavailableException(
        'Không thể tải hoặc xử lý ảnh để xuất PDF. Vui lòng kiểm tra ảnh và thử lại.',
      );
    }
  }

  private drawQuestionPages(
    doc: PDFKit.PDFDocument,
    title: string,
    questions: PreparedPdfQuestion[],
  ) {
    if (!questions.length) {
      const top = this.beginQuestionPage(doc, title, true);
      doc.font(this.regularFont).fontSize(10).fillColor('#566273');
      this.drawTextLines(
        doc,
        this.getTextLines(doc, 'Đề thi chưa có câu hỏi.', CONTENT_WIDTH, 10),
        MARGIN,
        top + 16,
        14,
        10,
      );
      return;
    }

    let questionIndex = 0;
    let firstPage = true;

    while (questionIndex < questions.length) {
      const top = this.beginQuestionPage(doc, title, firstPage);
      firstPage = false;
      const availableHeight = PAGE.height - MARGIN - top;
      const halfHeight = (availableHeight - QUESTION_BLOCK_GAP) / 2;
      const firstQuestion = questions[questionIndex];
      const secondQuestion = questions[questionIndex + 1];

      if (!secondQuestion) {
        const fullLayout = this.layoutQuestion(doc, firstQuestion, availableHeight);
        if (!fullLayout) {
          throw new BadRequestException(
            `Câu ${questionIndex + 1} quá dài để xuất gọn trong một trang PDF`,
          );
        }
        this.drawQuestionBlock(
          doc,
          fullLayout,
          questionIndex + 1,
          top,
          availableHeight,
        );
        questionIndex += 1;
        continue;
      }

      const firstLayout = this.layoutQuestion(doc, firstQuestion, halfHeight);

      if (!firstLayout) {
        const fullLayout = this.layoutQuestion(doc, firstQuestion, availableHeight);
        if (!fullLayout) {
          throw new BadRequestException(
            `Câu ${questionIndex + 1} quá dài để xuất gọn trong một trang PDF`,
          );
        }
        this.drawQuestionBlock(doc, fullLayout, questionIndex + 1, top, availableHeight);
        questionIndex += 1;
        continue;
      }

      const secondLayout = this.layoutQuestion(doc, secondQuestion, halfHeight);

      if (!secondLayout) {
        const firstFullLayout = this.layoutQuestion(doc, firstQuestion, availableHeight);
        if (!firstFullLayout) {
          throw new BadRequestException(
            `Câu ${questionIndex + 1} quá dài để xuất gọn trong một trang PDF`,
          );
        }
        this.drawQuestionBlock(
          doc,
          firstFullLayout,
          questionIndex + 1,
          top,
          availableHeight,
        );
        questionIndex += 1;
        continue;
      }

      this.drawQuestionBlock(doc, firstLayout, questionIndex + 1, top, halfHeight);
      this.drawQuestionBlock(
        doc,
        secondLayout,
        questionIndex + 2,
        top + halfHeight + QUESTION_BLOCK_GAP,
        halfHeight,
      );
      questionIndex += 2;
    }
  }

  private beginQuestionPage(
    doc: PDFKit.PDFDocument,
    title: string,
    firstPage: boolean,
  ) {
    if (!firstPage) doc.addPage();
    this.drawTitle(doc, title);
    return doc.y;
  }

  private layoutQuestion(
    doc: PDFKit.PDFDocument,
    question: PreparedPdfQuestion,
    maxHeight: number,
  ): QuestionLayout | null {
    const prompt = [
      question.instruction?.trim(),
      question.contentText.trim(),
      ...question.questionParts.map(
        (part, index) => `${String.fromCharCode(97 + index)}) ${part.contentText}`,
      ),
    ]
      .filter(Boolean)
      .join('\n');
    const textWidth = CONTENT_WIDTH - QUESTION_BLOCK_PADDING * 2;
    const promptLines = this.getTextLines(doc, prompt, textWidth, QUESTION_TEXT_SIZE);
    const options: OptionLayout[] = question.questionType === QuestionType.MULTIPLE_CHOICE
      ? (question.questionOptions as PreparedPdfOption[]).map((option, index) => {
          const lines = this.getTextLines(
            doc,
            option.contentText,
            textWidth - 28,
            OPTION_TEXT_SIZE,
          );
          return {
            label: LABELS[index] ?? String.fromCharCode(65 + index),
            lines,
            height: Math.max(OPTION_LINE_HEIGHT, lines.length * OPTION_LINE_HEIGHT),
            sourceImage: option.image,
            image: null,
          };
        })
      : [];

    let fixedHeight =
      QUESTION_BLOCK_PADDING * 2 +
      QUESTION_LABEL_HEIGHT +
      5 +
      promptLines.length * QUESTION_LINE_HEIGHT;
    if (question.image) fixedHeight += 8;
    for (const option of options) {
      fixedHeight += 5 + option.height;
      if (option.sourceImage) fixedHeight += 5;
    }

    const images: Array<{
      assign: (placement: ImagePlacement) => void;
      desired: ImagePlacement;
    }> = [];
    let questionImage: ImagePlacement | null = null;
    if (question.image) {
      const desired = this.fitImage(question.image, textWidth, QUESTION_IMAGE_MAX_HEIGHT);
      images.push({
        desired,
        assign: (placement) => { questionImage = placement; },
      });
    }
    options.forEach((option) => {
      if (!option.sourceImage) return;
      const desired = this.fitImage(
        option.sourceImage,
        textWidth - 28,
        OPTION_IMAGE_MAX_HEIGHT,
      );
      images.push({
        desired,
        assign: (placement) => { option.image = placement; },
      });
    });

    const remainingForImages = maxHeight - fixedHeight;
    if (remainingForImages < 0) return null;
    const desiredImageHeight = images.reduce((sum, image) => sum + image.desired.height, 0);
    const scale = desiredImageHeight > 0
      ? Math.min(1, remainingForImages / desiredImageHeight)
      : 1;
    if (
      images.some(
        ({ desired }) =>
          desired.height >= MIN_IMAGE_HEIGHT && desired.height * scale < MIN_IMAGE_HEIGHT,
      )
    ) {
      return null;
    }

    images.forEach(({ desired, assign }) => {
      assign({
        image: desired.image,
        width: desired.width * scale,
        height: desired.height * scale,
      });
    });

    const imageHeight = images.reduce(
      (sum, image) => sum + image.desired.height * scale,
      0,
    );
    return { height: fixedHeight + imageHeight, promptLines, questionImage, options };
  }

  private fitImage(image: PdfImage, maxWidth: number, maxHeight: number): ImagePlacement {
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    return { image, width: image.width * scale, height: image.height * scale };
  }

  private drawQuestionBlock(
    doc: PDFKit.PDFDocument,
    layout: QuestionLayout,
    number: number,
    top: number,
    blockHeight: number,
  ) {
    const contentWidth = CONTENT_WIDTH - QUESTION_BLOCK_PADDING * 2;
    const verticalOffset = Math.max(0, (blockHeight - layout.height) / 2);
    let y = top + verticalOffset + QUESTION_BLOCK_PADDING;

    doc.font(this.boldFont).fontSize(12).fillColor('#173b63');
    this.drawTextLines(
      doc,
      [{ text: `Câu ${number}`, indent: 0 }],
      MARGIN + QUESTION_BLOCK_PADDING,
      y,
      QUESTION_LABEL_HEIGHT,
      12,
      true,
    );
    y += QUESTION_LABEL_HEIGHT + 5;

    doc.font(this.regularFont).fontSize(QUESTION_TEXT_SIZE).fillColor('#202833');
    y = this.drawTextLines(
      doc,
      layout.promptLines,
      MARGIN + QUESTION_BLOCK_PADDING,
      y,
      QUESTION_LINE_HEIGHT,
      QUESTION_TEXT_SIZE,
    );

    if (layout.questionImage) {
      y += 8;
      doc.image(
        layout.questionImage.image.buffer,
        MARGIN + QUESTION_BLOCK_PADDING + (contentWidth - layout.questionImage.width) / 2,
        y,
        { width: layout.questionImage.width, height: layout.questionImage.height },
      );
      y += layout.questionImage.height;
    }

    layout.options.forEach((option) => {
      y += 5;
      doc.font(this.boldFont).fontSize(OPTION_TEXT_SIZE).fillColor('#283a4e');
      this.drawTextLines(
        doc,
        [{ text: `${option.label}.`, indent: 0 }],
        MARGIN + QUESTION_BLOCK_PADDING,
        y,
        OPTION_LINE_HEIGHT,
        OPTION_TEXT_SIZE,
        true,
      );
      doc.font(this.regularFont).fontSize(OPTION_TEXT_SIZE).fillColor('#202833');
      y = this.drawTextLines(
        doc,
        option.lines,
        MARGIN + QUESTION_BLOCK_PADDING + 28,
        y,
        OPTION_LINE_HEIGHT,
        OPTION_TEXT_SIZE,
      );
      if (option.image) {
        y += 5;
        doc.image(option.image.image.buffer, MARGIN + QUESTION_BLOCK_PADDING + 28, y, {
          width: option.image.width,
          height: option.image.height,
        });
        y += option.image.height;
      }
    });
  }

  private answerFor(question: PdfQuestion) {
    if (question.questionType === QuestionType.MULTIPLE_CHOICE) {
      const index = question.questionOptions.findIndex((option) => option.isCorrect);
      return index < 0 ? 'Chưa thiết lập đáp án' : LABELS[index] ?? String.fromCharCode(65 + index);
    }
    if (question.questionType === QuestionType.MULTI_PART_SHORT_ANSWER) {
      return question.questionParts.length
        ? question.questionParts
            .map((part, index) => `${String.fromCharCode(97 + index)}) ${part.correctAnswer}`)
            .join('; ')
        : 'Chưa thiết lập đáp án';
    }
    const accepted = question.questionAcceptedAnswers[0];
    return accepted?.content || accepted?.rawValue || question.correctTextAnswer || 'Tự luận';
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

  private ensureSpace(doc: PDFKit.PDFDocument, height: number) {
    if (doc.y + height > PAGE.height - MARGIN - 20) doc.addPage();
  }

  private getTextLines(
    doc: PDFKit.PDFDocument,
    text: string,
    width: number,
    fontSize: number,
    bold = false,
  ): TextLine[] {
    const normalized = (text || '').normalize('NFC');
    if (!normalized) return [];

    const normalFont = bold ? this.boldFont : this.regularFont;
    const vietnameseFont = bold ? this.vietnameseBoldFont : this.vietnameseFont;
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

    const lines: TextLine[] = [];
    for (const paragraph of normalized.split(/\r?\n/)) {
      const words = paragraph.match(/\S+/gu) ?? [];
      if (!words.length) {
        lines.push({ text: '', indent: 0 });
        continue;
      }

      let line = '';
      let lineWidth = 0;
      for (const word of words) {
        const wordWidth = measure(word);
        const separator = line ? ' ' : '';
        const separatorWidth = separator ? measure(separator) : 0;
        if (line && lineWidth + separatorWidth + wordWidth > width) {
          lines.push({ text: line, indent: 0 });
          line = '';
          lineWidth = 0;
        }

        if (wordWidth > width) {
          for (const char of Array.from(word)) {
            const charWidth = measure(char);
            if (line && lineWidth + charWidth > width) {
              lines.push({ text: line, indent: 0 });
              line = '';
              lineWidth = 0;
            }
            line += char;
            lineWidth += charWidth;
          }
          continue;
        }

        if (line) {
          line += separator;
          lineWidth += separatorWidth;
        }
        line += word;
        lineWidth += wordWidth;
      }
      if (line) lines.push({ text: line, indent: 0 });
    }
    return lines;
  }

  private drawTextLines(
    doc: PDFKit.PDFDocument,
    lines: TextLine[],
    x: number,
    y: number,
    lineHeight: number,
    fontSize: number,
    bold = false,
  ) {
    const normalFont = bold ? this.boldFont : this.regularFont;
    const vietnameseFont = bold ? this.vietnameseBoldFont : this.vietnameseFont;
    const getFont = (char: string) =>
      /[\u0100-\u024f\u1e00-\u1eff]/u.test(char)
        ? vietnameseFont
        : normalFont;
    let cursorY = y;
    for (const line of lines) {
      let cursorX = x + line.indent;
      for (const [font, content] of this.fontRuns(line.text, getFont)) {
        doc.font(font).fontSize(fontSize).text(content, cursorX, cursorY, {
          lineBreak: false,
        });
        cursorX += doc.widthOfString(content);
      }
      cursorY += lineHeight;
    }
    return cursorY;
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
