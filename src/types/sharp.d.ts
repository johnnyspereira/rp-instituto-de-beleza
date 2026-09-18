declare module 'sharp' {
  type ResizeOptions = {
    fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
    position?: string;
  };

  type WebpOptions = { quality?: number };

  interface SharpInstance {
    rotate(): SharpInstance;
    resize(
      width: number,
      height: number,
      options?: ResizeOptions
    ): SharpInstance;
    webp(options?: WebpOptions): SharpInstance;
    toBuffer(): Promise<Buffer>;
  }

  function sharp(
    input: Buffer,
    options?: { animated?: boolean }
  ): SharpInstance;

  export default sharp;
}
