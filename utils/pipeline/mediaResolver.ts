import { addWhiteBackground, fetchImageAsBase64 } from "@/utils/extract";
import type { ExtractResult } from "@/utils/extract";

export interface MediaResolverContext {
  timestamp: number;
  fixDarkMode: boolean;
}

export interface ResolveExtractedContentInput {
  content: string;
  result: ExtractResult;
}

export interface ResolveExtractedContentOutput {
  content: string;
  storedFiles: string[];
}

interface ExtractedImageRef {
  src: string;
  placeholder: string;
}

function toBase64FromDataUrl(dataUrl: string): string {
  return dataUrl.replace(/^data:image\/png;base64,/, "");
}

export function createMediaResolver(context: MediaResolverContext) {
  let imageCounter = 0;
  const imageCache = new Map<string, string>();
  const storedFiles: string[] = [];

  const rememberFile = (filename: string) => {
    storedFiles.push(filename);
    return filename;
  };

  const storeBase64Png = async (filename: string, base64Data: string) => {
    await browser.runtime.sendMessage({
      action: "storeMediaFile",
      filename,
      data: base64Data,
    });
    return rememberFile(filename);
  };

  const resolveImageBase64 = async (
    image: ExtractedImageRef,
  ): Promise<string> => {
    const cacheKey = `${context.fixDarkMode ? "dark" : "raw"}:${image.src}`;
    const cached = imageCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    let base64Data = await fetchImageAsBase64(image.src);
    if (context.fixDarkMode) {
      base64Data = await addWhiteBackground(base64Data);
    }

    imageCache.set(cacheKey, base64Data);
    return base64Data;
  };

  const resolveExtractedContent = async (
    input: ResolveExtractedContentInput,
  ): Promise<ResolveExtractedContentOutput> => {
    let content = input.content;
    const filenames: string[] = [];

    for (const image of input.result.images) {
      try {
        const base64Data = await resolveImageBase64(image);
        const filename = `autobot-${context.timestamp}-img${imageCounter++}.png`;
        await storeBase64Png(filename, base64Data);
        filenames.push(filename);
        content = content.replace(image.placeholder, `<img src="${filename}">`);
      } catch (error) {
        throw new Error(
          `[Autobot] Media resolve failed for ${image.src}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return {
      content,
      storedFiles: filenames,
    };
  };

  const storeCapturedDataUrl = async (
    label: string,
    dataUrl: string,
  ): Promise<string> => {
    const filename = `autobot-${context.timestamp}-${label}.png`;
    const base64 = toBase64FromDataUrl(dataUrl);
    await storeBase64Png(filename, base64);
    return filename;
  };

  const storeCapturedBase64 = async (
    label: string,
    base64Data: string,
  ): Promise<string> => {
    const filename = `autobot-${context.timestamp}-${label}.png`;
    await storeBase64Png(filename, base64Data);
    return filename;
  };

  const getStoredFiles = (): string[] => [...storedFiles];

  return {
    resolveExtractedContent,
    storeCapturedDataUrl,
    storeCapturedBase64,
    getStoredFiles,
  };
}
