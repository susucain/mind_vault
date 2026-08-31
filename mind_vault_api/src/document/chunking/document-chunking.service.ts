import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ParsedDocument } from '../parser/parsed-document';
import { DocumentChunk } from './document-chunk';

export interface ChunkingOptions {
  maxCharacters?: number;
  overlapCharacters?: number;
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
          titlePath: section.heading ? [section.heading] : [],
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
    const paragraphs = text.split(/\n{2,}/).filter(Boolean);
    const pieces: string[] = [];
    let current = '';

    for (const paragraph of paragraphs) {
      if (paragraph.length > maxCharacters) {
        if (current) {
          pieces.push(current.trim());
          current = '';
        }
        for (
          let offset = 0;
          offset < paragraph.length;
          offset += maxCharacters
        ) {
          pieces.push(paragraph.slice(offset, offset + maxCharacters).trim());
        }
        continue;
      }
      if (current && current.length + paragraph.length + 2 > maxCharacters) {
        pieces.push(current.trim());
        current = '';
      }
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
    if (current.trim()) pieces.push(current.trim());
    return pieces.filter(Boolean);
  }
}
