import { describe, expect, it } from "vitest";
import { assembleSlides, kindOf } from "./index";
import { partText, relTargets, slideOrder, slidePage } from "./pptx";

describe("pptx parsing", () => {
  it("reads one line per paragraph, joining runs and decoding entities", () => {
    const xml = `<p:sld><p:txBody>
      <a:p><a:pPr lvl="0"/><a:r><a:t>Cell </a:t></a:r><a:r><a:rPr b="1"/><a:t>respiration</a:t></a:r></a:p>
      <a:p/>
      <a:p><a:r><a:t>ATP &amp; NADH &lt;3 &#233;</a:t></a:r></a:p>
    </p:txBody></p:sld>`;
    expect(partText(xml)).toBe("Cell respiration\nATP & NADH <3 é");
  });

  it("drops fields like the slide number, keeps line breaks", () => {
    const xml = `<a:p><a:r><a:t>Remember this</a:t></a:r><a:br/><a:r><a:t>for the test</a:t></a:r></a:p>
      <a:p><a:fld id="{x}" type="slidenum"><a:t>3</a:t></a:fld></a:p>`;
    expect(partText(xml)).toBe("Remember this\nfor the test");
  });

  it("orders slides by the presentation's slide list, not file names", () => {
    const pres = `<p:presentation><p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>`;
    const rels = `<Relationships>
      <Relationship Id="rId2" Type=".../slide" Target="slides/slide1.xml"/>
      <Relationship Id="rId3" Type=".../slide" Target="slides/slide2.xml"/>
      <Relationship Id="rId1" Type=".../slideMaster" Target="slideMasters/slideMaster1.xml"/>
    </Relationships>`;
    expect(slideOrder(pres, rels)).toEqual(["ppt/slides/slide2.xml", "ppt/slides/slide1.xml"]);
  });

  it("resolves relative targets like ../notesSlides/notesSlide1.xml", () => {
    const rels = `<Relationships><Relationship Id="rId2" Target="../notesSlides/notesSlide4.xml"/></Relationships>`;
    expect(relTargets(rels, "ppt/slides").get("rId2")).toBe("ppt/notesSlides/notesSlide4.xml");
  });

  it("puts speaker notes after the slide text, only when there are any", () => {
    expect(slidePage("Mitosis", "Go slow here")).toBe("Mitosis\n\nSpeaker notes:\nGo slow here");
    expect(slidePage("Mitosis", "  ")).toBe("Mitosis");
    expect(slidePage("", "Only notes")).toBe("Speaker notes:\nOnly notes");
  });
});


describe("slides as pages", () => {
  it("keeps real slide numbers and skips empty slides", () => {
    const r = assembleSlides(["Title slide", "", "Mitosis has four phases"]);
    expect(r.kind).toBe("pptx");
    expect(r.pages.map((p) => p.page)).toEqual([1, 3]);
    expect(r.totalPages).toBe(3);
    expect(r.skippedPages).toBe(1);
  });
  it("tells .pptx from an older .ppt", () => {
    expect(kindOf({ name: "Unit 4.pptx", type: "" })).toBe("pptx");
    expect(kindOf({ name: "old deck.ppt", type: "" })).toBe("legacy_ppt");
  });
});
