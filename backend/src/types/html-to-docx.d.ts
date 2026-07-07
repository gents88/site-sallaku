declare module 'html-to-docx' {
  interface HtmlToDocxOptions {
    orientation?: 'portrait' | 'landscape';
    title?: string;
    margins?: Record<string, number>;
    pageSize?: { width?: number; height?: number };
    font?: string;
    fontSize?: number;
  }

  function htmlToDocx(
    html: string,
    headerHtml?: string,
    options?: HtmlToDocxOptions,
    footerHtml?: string,
  ): Promise<Buffer | ArrayBuffer>;

  export default htmlToDocx;
}
