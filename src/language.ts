export const DEFAULT_LANGUAGE = "fa";

const LANGUAGE_CODES = ["en", "fa"] as const;

type SupportedLanguage = (typeof LANGUAGE_CODES)[number];

export function normalizeLanguageCode(code?: string | null): SupportedLanguage {
  const cleanCode = code?.trim().toLowerCase();
  return LANGUAGE_CODES.includes(cleanCode as SupportedLanguage)
    ? (cleanCode as SupportedLanguage)
    : DEFAULT_LANGUAGE;
}

export function buildMiniAppUrl(baseUrl: string, language?: string | null): string {
  const finalLanguage = normalizeLanguageCode(language);
  const targetUrl = new URL(baseUrl);
  targetUrl.searchParams.set("lang", finalLanguage);
  return targetUrl.toString();
}
