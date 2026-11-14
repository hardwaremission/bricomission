// Minimal types for heic-decode 2.1.0 (ISC; wraps libheif-js, LGPL-3.0, unmodified).
declare module 'heic-decode' {
  interface DecodedImage {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }
  interface HeicImage {
    width: number;
    height: number;
    decode(): Promise<DecodedImage>;
  }
  type HeicImages = HeicImage[] & { dispose(): void };
  interface HeicDecode {
    (input: { buffer: Uint8Array | ArrayBuffer }): Promise<DecodedImage>;
    all(input: { buffer: Uint8Array | ArrayBuffer }): Promise<HeicImages>;
  }
  const decode: HeicDecode;
  export default decode;
}
