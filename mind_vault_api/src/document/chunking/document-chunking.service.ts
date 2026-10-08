import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ParsedDocument } from '../parser/parsed-document';
import { DocumentChunk } from './document-chunk';

export interface ChunkingOptions {
  maxCharacters?: number;
  overlapCharacters?: number;
}

/** 围栏代码块起始/结束标记 */
const FENCE_LINE = /^\s*(```|~~~)/;
/** Markdown 表格行（至少两个 `|`） */
const TABLE_ROW = /^\s*\|.*\|\s*$/;
/** 一级句末标点：优先在此断句 */
const SENTENCE_BOUNDARY = /(?<=[。！？；!?;])/;
/** 二级断句标点：一级标点找不到时的退化选择 */
const CLAUSE_BOUNDARY = /(?<=[，、,])/;

/** 切分单元：`atomic` 为真表示表格/代码块，整体保留、绝不从中间切断 */
interface SplitUnit {
  text: string;
  atomic: boolean;
}

@Injectable()
export class DocumentChunkingService {
  chunk(
    ownerId: string,
    documentId: string,
    documentVersion: number,
    parsed: ParsedDocument,
    options: ChunkingOptions = {},
  ): DocumentChunk[] {
    const maxCharacters = options.maxCharacters ?? 1600;
    const overlapCharacters = Math.min(
      options.overlapCharacters ?? 160,
      Math.floor(maxCharacters / 2),
    );
    const chunks: DocumentChunk[] = [];

    for (const section of parsed.sections) {
      const parentContext = section.text.trim();
      if (!parentContext) continue;
      const titlePath =
        section.titlePath?.length > 0
          ? section.titlePath
          : section.heading
            ? [section.heading]
            : [];
      const pieces = this.splitText(parentContext, maxCharacters);
      pieces.forEach((text, index) => {
        const chunkOrder = chunks.length;
        const chunkId = createHash('sha256')
          .update(
            [
              ownerId,
              documentId,
              documentVersion,
              section.sectionId,
              chunkOrder,
              text,
            ].join(':'),
          )
          .digest('hex');
        chunks.push({
          chunkId,
          parentId: section.sectionId,
          ownerId,
          documentId,
          documentVersion,
          sectionId: section.sectionId,
          chunkOrder,
          titlePath,
          text,
          parentContext,
          locator: section.locator,
        });
        if (index < pieces.length - 1 && overlapCharacters > 0) {
          pieces[index + 1] =
            `${text.slice(-overlapCharacters)}\n${pieces[index + 1]}`;
        }
      });
    }
    return chunks;
  }

  private splitText(text: string, maxCharacters: number): string[] {
    if (text.length <= maxCharacters) return [text];
    const units = this.toUnits(text);
    const pieces: string[] = [];
    let current = '';

    const flush = () => {
      if (current.trim()) pieces.push(current.trim());
      current = '';
    };

    for (const unit of units) {
      if (unit.text.length > maxCharacters) {
        flush();
        // 表格/代码块整体超出上限时仍整块保留，避免引用片段只呈现半张表
        if (unit.atomic) {
          pieces.push(unit.text.trim());
        } else {
          pieces.push(...this.splitLongParagraph(unit.text, maxCharacters));
        }
        continue;
      }
      if (current && current.length + unit.text.length + 2 > maxCharacters) {
        flush();
      }
      current = current ? `${current}\n\n${unit.text}` : unit.text;
    }
    flush();
    return pieces.filter(Boolean);
  }

  /**
   * 把正文切成「段落 / 表格 / 代码块」单元（I3）：
   * 空白行分隔段落；连续表格行合成一个 table 单元；成对围栏合成一个 code 单元。
   */
  private toUnits(text: string): SplitUnit[] {
    const lines = text.split('\n');
    const units: SplitUnit[] = [];
    let buffer: string[] = [];
    let mode: 'plain' | 'fence' | 'table' = 'plain';

    const flushPlain = () => {
      const block = buffer.join('\n').trim();
      if (block) units.push({ text: block, atomic: false });
      buffer = [];
    };

    for (const line of lines) {
      if (mode === 'fence') {
        buffer.push(line);
        // 结束围栏：整块作为一个原子单元，不做二次切分
        if (FENCE_LINE.test(line) && buffer.length > 1) {
          units.push({ text: buffer.join('\n').trim(), atomic: true });
          buffer = [];
          mode = 'plain';
        }
        continue;
      }
      if (FENCE_LINE.test(line)) {
        flushPlain();
        buffer = [line];
        mode = 'fence';
        continue;
      }
      if (TABLE_ROW.test(line)) {
        if (mode !== 'table') {
          flushPlain();
          mode = 'table';
        }
        buffer.push(line);
        continue;
      }
      if (mode === 'table') {
        units.push({ text: buffer.join('\n').trim(), atomic: true });
        buffer = [];
        mode = 'plain';
      }
      if (line.trim() === '') {
        flushPlain();
        continue;
      }
      buffer.push(line);
    }

    if (mode === 'plain') {
      flushPlain();
    } else {
      // 未闭合的围栏/表格：按原子单元保留，宁可不切也不破坏结构
      const block = buffer.join('\n').trim();
      if (block) units.push({ text: block, atomic: true });
    }
    return units;
  }

  /** 超长段落：优先在一级句末标点断句，退化到二级标点，最后才硬切 */
  private splitLongParagraph(text: string, maxCharacters: number): string[] {
    const pieces: string[] = [];
    let current = '';
    const flush = () => {
      if (current.trim()) pieces.push(current.trim());
      current = '';
    };

    for (const sentence of text.split(SENTENCE_BOUNDARY).filter(Boolean)) {
      if (sentence.length > maxCharacters) {
        flush();
        pieces.push(...this.splitClauses(sentence, maxCharacters));
        continue;
      }
      if (current && current.length + sentence.length > maxCharacters) flush();
      current += sentence;
    }
    flush();
    return pieces;
  }

  /** 单句仍超长：按二级标点再断，仍超长才按定长硬切 */
  private splitClauses(text: string, maxCharacters: number): string[] {
    const pieces: string[] = [];
    let current = '';
    const flush = () => {
      if (current.trim()) pieces.push(current.trim());
      current = '';
    };

    for (const clause of text.split(CLAUSE_BOUNDARY).filter(Boolean)) {
      if (clause.length > maxCharacters) {
        flush();
        for (let offset = 0; offset < clause.length; offset += maxCharacters) {
          pieces.push(clause.slice(offset, offset + maxCharacters).trim());
        }
        continue;
      }
      if (current && current.length + clause.length > maxCharacters) flush();
      current += clause;
    }
    flush();
    return pieces.filter(Boolean);
  }
}
