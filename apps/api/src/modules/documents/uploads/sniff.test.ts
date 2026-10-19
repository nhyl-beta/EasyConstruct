import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { assertContentMatches, checkContent, detectKind } from "./sniff.js";
import { AppError } from "../../../core/utils/errors.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n");
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0]);
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
const HTML = Buffer.from("<!DOCTYPE html><html><body><script>alert(1)</script></body></html>");
const DWG = Buffer.from("AC1027\0\0\0\0\0\0\0\0");

describe("detectKind", () => {
  test("recognises the common signatures", () => {
    assert.equal(detectKind(PNG), "png");
    assert.equal(detectKind(JPEG), "jpeg");
    assert.equal(detectKind(PDF), "pdf");
    assert.equal(detectKind(ZIP), "zip");
    assert.equal(detectKind(OLE), "ole2");
    assert.equal(detectKind(DWG), "dwg");
    assert.equal(detectKind(Buffer.from("GIF89a....")), "gif");
    assert.equal(detectKind(Buffer.from("name,qty\nbolt,4\n")), "text");
    assert.equal(detectKind(HTML), "html");
    assert.equal(detectKind(Buffer.from([0, 1, 2, 3, 0, 0, 0, 9])), "unknown");
  });
});

describe("checkContent", () => {
  test("a genuine file of each allowed type passes", () => {
    assert.ok(checkContent("a.png", "image/png", PNG).ok);
    assert.ok(checkContent("a.jpg", "image/jpeg", JPEG).ok);
    assert.ok(checkContent("a.pdf", "application/pdf", PDF).ok);
    assert.ok(checkContent("a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ZIP).ok);
    assert.ok(checkContent("a.xls", "application/vnd.ms-excel", OLE).ok);
    assert.ok(checkContent("plan.dwg", "application/octet-stream", DWG).ok);
    assert.ok(checkContent("plan.dwg", "", DWG).ok);
    assert.ok(checkContent("a.csv", "text/csv", Buffer.from("a,b\n1,2\n")).ok);
  });
  test("HTML bytes labelled image/png are refused (the reported case)", () => {
    const r = checkContent("evil.png", "image/png", HTML);
    assert.equal(r.ok, false);
    assert.match(r.reason!, /HTML|script/i);
  });
  test("a wrong extension for the real content is refused", () => {
    assert.equal(checkContent("a.pdf", "application/pdf", PNG).ok, false);
    assert.equal(checkContent("a.png", "", PDF).ok, false);
  });
  test("a photo named .jpg whose bytes are PNG, WebP or HEIC is still an image and is accepted (the attendance selfie case)", () => {
    const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);
    const HEIC = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(8)]);
    assert.ok(checkContent("attendance-1.jpg", "image/png", PNG).ok);
    assert.ok(checkContent("attendance-1.jpg", "image/webp", WEBP).ok);
    assert.ok(checkContent("attendance-1.jpg", "image/heic", HEIC).ok);
    assert.equal(detectKind(HEIC), "heic");
  });
  test("an image name or image type on something that is not an image is refused", () => {
    assert.equal(checkContent("a.jpg", "image/jpeg", PDF).ok, false);
    assert.equal(checkContent("a.jpg", "image/jpeg", HTML).ok, false);
    assert.equal(checkContent("data.bin.pdf", "image/png", PDF).ok, false);
  });
  test("HTML in a text-looking CAD or text file is refused too", () => {
    for (const name of ["a.txt", "a.csv", "a.dxf", "a.ifc"]) assert.equal(checkContent(name, "", HTML).ok, false, name);
  });
  test("an empty file with a text extension is not refused here (size rules live elsewhere)", () => {
    assert.ok(checkContent("a.txt", "text/plain", Buffer.alloc(0)).ok);
  });
});

describe("assertContentMatches", () => {
  test("throws the 400 UNSUPPORTED_FILE_TYPE error the upload routes use", () => {
    assert.throws(
      () => assertContentMatches("evil.png", "image/png", HTML),
      (e: unknown) => e instanceof AppError && e.statusCode === 400 && e.code === "UNSUPPORTED_FILE_TYPE",
    );
    assert.doesNotThrow(() => assertContentMatches("ok.png", "image/png", PNG));
  });
});
