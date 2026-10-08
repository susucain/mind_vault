import JSZip from 'jszip';
import { parsePptx } from './pptx.parser';

/** A6：PPTX 讲者备注经 notesSlide 关系抽取为独立备注，供上层挂到幻灯片之后 */
describe('parsePptx', () => {
  async function buildPptx(): Promise<Buffer> {
    const zip = new JSZip();
    zip.file(
      'ppt/slides/slide1.xml',
      [
        '<p:sld><p:cSld><p:spTree>',
        '<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>',
        '<p:txBody><a:p><a:r><a:t>架构总览</a:t></a:r></a:p></p:txBody></p:sp>',
        '<p:sp><p:nvSpPr><p:nvPr/></p:nvSpPr>',
        '<p:txBody><a:p><a:r><a:t>正文要点</a:t></a:r></a:p></p:txBody></p:sp>',
        '</p:spTree></p:cSld></p:sld>',
      ].join(''),
    );
    zip.file(
      'ppt/slides/slide2.xml',
      [
        '<p:sld><p:cSld><p:spTree>',
        '<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>',
        '<p:txBody><a:p><a:r><a:t>容量估算</a:t></a:r></a:p></p:txBody></p:sp>',
        '</p:spTree></p:cSld></p:sld>',
      ].join(''),
    );
    zip.file(
      'ppt/slides/_rels/slide1.xml.rels',
      [
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/>',
        '</Relationships>',
      ].join(''),
    );
    zip.file(
      'ppt/notesSlides/notesSlide1.xml',
      [
        '<p:notes><p:cSld><p:spTree>',
        '<p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>',
        '<p:txBody><a:p><a:r><a:t>记得补充容量估算</a:t></a:r></a:p></p:txBody></p:sp>',
        '</p:spTree></p:cSld></p:notes>',
      ].join(''),
    );
    return zip.generateAsync({ type: 'nodebuffer' });
  }

  it('returns body text and speaker notes separately', async () => {
    const result = await parsePptx(await buildPptx());

    expect(result.body).toContain('## 幻灯片 1');
    expect(result.body).toContain('### 架构总览');
    expect(result.body).toContain('正文要点');
    // 备注不进正文，避免与备注 section 重复
    expect(result.body).not.toContain('记得补充容量估算');
    expect(result.notes).toEqual([{ slide: 1, text: '记得补充容量估算' }]);
    expect(result.warnings).toEqual([]);
  });

  it('leaves notes empty when the slide has no notes relationship', async () => {
    const result = await parsePptx(await buildPptx());

    expect(result.notes.map((note) => note.slide)).toEqual([1]);
  });
});
