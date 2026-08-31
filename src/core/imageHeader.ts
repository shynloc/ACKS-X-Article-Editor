/** Read dimensions before allocating a decoder surface. Reject animation and oversized images. */
export function imageHeader(bytes: Uint8Array): {
  mime: string;
  width: number;
  height: number;
} {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (p: number, n: number) =>
    String.fromCharCode(...bytes.slice(p, p + n));
  let mime = "",
    width = 0,
    height = 0;
  if (bytes.length >= 24 && bytes[0] === 137 && ascii(1, 3) === "PNG") {
    mime = "image/png";
    width = v.getUint32(16);
    height = v.getUint32(20);
    for (let p = 8; p + 8 <= bytes.length;) {
      const type = ascii(p + 4, 4),
        size = v.getUint32(p);
      if (type === "acTL") throw new Error("暂不支持动画 PNG。");
      if (type === "IDAT") break;
      p += size + 12;
    }
  } else if (
    bytes.length >= 30 &&
    ascii(0, 4) === "RIFF" &&
    ascii(8, 4) === "WEBP"
  ) {
    mime = "image/webp";
    const type = ascii(12, 4);
    if (type === "VP8X") {
      if (bytes[20] & 2) throw new Error("暂不支持动画 WebP。");
      width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    } else if (
      type === "VP8 " &&
      bytes[23] === 0x9d &&
      bytes[24] === 1 &&
      bytes[25] === 0x2a
    ) {
      width = v.getUint16(26, true) & 0x3fff;
      height = v.getUint16(28, true) & 0x3fff;
    } else if (type === "VP8L" && bytes[20] === 0x2f) {
      const bits = v.getUint32(21, true);
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
    }
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    mime = "image/jpeg";
    for (let p = 2; p + 8 < bytes.length;) {
      if (bytes[p++] !== 255) break;
      while (bytes[p] === 255) p++;
      const marker = bytes[p++];
      if (marker === 0xd9 || marker === 0xda) break;
      const size = v.getUint16(p);
      if (size < 2) break;
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker)
      ) {
        height = v.getUint16(p + 3);
        width = v.getUint16(p + 5);
        break;
      }
      p += size;
    }
  }
  if (!mime || !width || !height)
    throw new Error("无法识别图片尺寸；仅支持完整的静态 PNG、JPEG 和 WebP。");
  if (width * height > 40_000_000 || width > 40000 || height > 40000)
    throw new Error("图片不能超过 4000 万像素。");
  return { mime, width, height };
}
