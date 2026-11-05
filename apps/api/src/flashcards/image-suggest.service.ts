import { BadGatewayException, Injectable } from "@nestjs/common";

export interface ImageSuggestion {
  /** Thumbnail URL on (upload|thumb).wikimedia.org (stored on the card when picked). */
  url: string;
  /** Commons file page, for attribution. */
  page: string;
  title: string;
  /** "Artist — licence" attribution line. */
  credit: string;
}

const UA = "NihongoPath/0.1 (language-learning app; image suggestions)";

interface CommonsPage {
  title?: string;
  imageinfo?: {
    thumburl?: string;
    descriptionurl?: string;
    extmetadata?: Record<string, { value?: string }>;
  }[];
}

/** Strip HTML tags from Commons' extmetadata values. */
function plain(html: string | undefined): string {
  return (html ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Suggests mnemonic pictures for a word from Wikimedia Commons (free-licence
 * files; no API key). Only raster thumbnails hosted on upload.wikimedia.org
 * are returned, with an attribution line the UI stores next to the image.
 */
@Injectable()
export class ImageSuggestService {
  async suggest(query: string): Promise<ImageSuggestion[]> {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      generator: "search",
      gsrsearch: `${query} filetype:bitmap`,
      gsrnamespace: "6",
      gsrlimit: "12",
      prop: "imageinfo",
      iiprop: "url|extmetadata",
      iiurlwidth: "320",
    });
    let res: Response;
    try {
      res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(6000),
      });
    } catch {
      throw new BadGatewayException("Image search is unavailable right now");
    }
    if (!res.ok) throw new BadGatewayException("Image search failed");

    const data = (await res.json().catch(() => null)) as {
      query?: { pages?: Record<string, CommonsPage> };
    } | null;
    const pages = Object.values(data?.query?.pages ?? {});

    const out: ImageSuggestion[] = [];
    for (const p of pages) {
      const info = p.imageinfo?.[0];
      const url = info?.thumburl;
      if (
        !url ||
        !(
          url.startsWith("https://upload.wikimedia.org/") ||
          url.startsWith("https://thumb.wikimedia.org/")
        )
      ) {
        continue;
      }
      const meta = info.extmetadata ?? {};
      const artist = plain(meta.Artist?.value) || "Wikimedia Commons";
      const licence = plain(meta.LicenseShortName?.value);
      out.push({
        url,
        page: info.descriptionurl ?? "",
        title: (p.title ?? "").replace(/^File:/, ""),
        credit: licence ? `${artist.slice(0, 120)} — ${licence}` : artist.slice(0, 160),
      });
    }
    return out.slice(0, 9);
  }
}
