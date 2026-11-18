/// <reference types="vite/client" />

declare module 'mammoth' {
  interface MammothResult {
    value: string;
    messages: any[];
  }
  export function extractRawText(options: { arrayBuffer: ArrayBuffer }): Promise<MammothResult>;
}
