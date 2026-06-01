/**
 * Open Library Loader
 *
 * Fetches book metadata from the Open Library Subjects API (no auth required).
 * Pulls books across multiple genres, fetches descriptions from the Works API,
 * and writes data/books.json in the same shape as the UCSD loader.
 *
 * Usage:
 *   npm run load:ol
 *   npm run load:ol -- --limit 2000 --min-ratings 10
 *
 * Options:
 *   --limit        Max total books to save (default: 1000)
 *   --min-editions  Minimum edition count to include a book (default: 3)
 */

import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { BookReview } from "./goodreads";

const BASE = "https://openlibrary.org";

const GENRES = [
  "mystery",
  "thriller",
  "fantasy",
  "science_fiction",
  "romance",
  "historical_fiction",
  "horror",
  "young_adult",
  "literary_fiction",
  "adventure",
];

interface OLSubjectWork {
  key: string; // "/works/OL123W"
  title: string;
  authors: Array<{ key: string; name: string }>;
  subject: string[];
  edition_count?: number;
  first_publish_year?: number;
}

interface OLSubjectResponse {
  works: OLSubjectWork[];
}

interface OLWorkDetail {
  description?: string | { value: string };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      result[args[i].slice(2)] = args[i + 1] ?? "true";
      i++;
    }
  }
  return result;
}

function extractDescription(work: OLWorkDetail): string {
  if (!work.description) return "";
  if (typeof work.description === "string") return work.description;
  return work.description.value ?? "";
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSubjectBooks(
  genre: string,
  limit: number
): Promise<OLSubjectWork[]> {
  const url = `${BASE}/subjects/${genre}.json?limit=${limit}&details=true`;
  try {
    const { data } = await axios.get<OLSubjectResponse>(url, { timeout: 15000 });
    return data.works ?? [];
  } catch (err: any) {
    console.warn(`  Failed to fetch subject "${genre}": ${err.message}`);
    return [];
  }
}

async function fetchDescription(workKey: string): Promise<string> {
  try {
    const { data } = await axios.get<OLWorkDetail>(`${BASE}${workKey}.json`, {
      timeout: 10000,
    });
    return extractDescription(data);
  } catch {
    return "";
  }
}

async function main() {
  const args = parseArgs();
  const limit = parseInt(args["limit"] ?? "1000");
  const minEditions = parseInt(args["min-editions"] ?? "3");
  const perGenre = Math.ceil(limit / GENRES.length) + 50; // overfetch to hit the limit after filtering

  console.log(`Fetching up to ${limit} books from Open Library`);
  console.log(`Genres: ${GENRES.join(", ")}\n`);

  // Deduplicate across genres by work key
  const seen = new Set<string>();
  const candidates: OLSubjectWork[] = [];

  for (const genre of GENRES) {
    console.log(`Fetching genre: ${genre}...`);
    const works = await fetchSubjectBooks(genre, perGenre);
    let added = 0;
    for (const w of works) {
      if (!seen.has(w.key) && w.title && w.authors?.length > 0) {
        seen.add(w.key);
        candidates.push(w);
        added++;
      }
    }
    console.log(`  +${added} books (${candidates.length} total)`);
    await sleep(300);
  }

  // Filter by edition count as a popularity proxy (ratings not in subjects API)
  const filtered = candidates.filter(
    (w) => (w.edition_count ?? 0) >= minEditions
  );
  console.log(
    `\nAfter filtering (min ${minEditions} editions): ${filtered.length} books`
  );

  // Fetch descriptions for top books up to the limit
  const toProcess = filtered.slice(0, limit);
  console.log(`Fetching descriptions for ${toProcess.length} books...\n`);

  const books: BookReview[] = [];
  for (let i = 0; i < toProcess.length; i++) {
    const w = toProcess[i];
    const workId = w.key.replace("/works/", "");

    process.stdout.write(`[${i + 1}/${toProcess.length}] ${w.title}...`);
    const description = await fetchDescription(w.key);

    books.push({
      bookId: workId,
      title: w.title,
      author: w.authors[0]?.name ?? "Unknown",
      genres: w.subject?.slice(0, 5) ?? [],
      avgRating: 0, // not available from subjects API; fetched separately if needed
      description,
      reviewText: "",
    });

    console.log(" ✓");
    await sleep(150); // be polite to the API
  }

  const outPath = path.join(__dirname, "../../data/books.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(books, null, 2));

  console.log(`\n✓ Saved ${books.length} books to ${outPath}`);
  console.log(`\nNext step: npm run index`);
}

main().catch(console.error);
