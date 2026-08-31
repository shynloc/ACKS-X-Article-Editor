import { describe, it, expect } from "vitest";
import { imageHeader } from "../src/core/imageHeader";
describe("image allocation boundary", () => {
  const png = (width: number, height: number) => {
    const a = new Uint8Array(33);
    a.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const v = new DataView(a.buffer);
    v.setUint32(8, 13);
    a.set([73, 72, 68, 82], 12);
    v.setUint32(16, width);
    v.setUint32(20, height);
    return a;
  };
  it("reads dimensions before decoder allocation", () =>
    expect(imageHeader(png(1280, 720))).toEqual({
      mime: "image/png",
      width: 1280,
      height: 720,
    }));
  it("rejects compressed dimension bombs", () =>
    expect(() => imageHeader(png(100000, 100000))).toThrow("4000"));
  it("rejects unrecognized SVG and HTML payloads", () =>
    expect(() =>
      imageHeader(
        new TextEncoder().encode("<svg><script>alert(1)</script></svg>"),
      ),
    ).toThrow());
});
