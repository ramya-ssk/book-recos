import axios from "axios";
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";

export interface BookReview {
  bookId: string;
  title: string;
  author: string;
  genres: string[];
  avgRating: number;
  reviewText: string; // concatenated top reviews
  description: string;
}

// Goodreads blocks scrapers aggressively, so we seed with a curated list
// of book IDs spanning popular genres. In production you'd pull from their
// API or a dataset like UCSD Book Graph.
const SEED_BOOK_IDS = [
  "2767052",  // The Hunger Games
  "41865",    // Twilight
  "1885",     // Pride and Prejudice
  "4671",     // The Great Gatsby
  "7613",     // The Road
  "5107",     // Brave New World
  "77566",    // The Kite Runner
  "1732458",  // The Girl with the Dragon Tattoo
  "11588",    // Flowers for Algernon
  "3636",     // The Alchemist
  "6148028",  // The Help
  "7143",     // Crime and Punishment
  "13496",    // A Brief History of Time
  "38447",    // Slaughterhouse-Five
  "4214",     // 1984
  "1420",     // To Kill a Mockingbird
  "2429135",  // The Fault in Our Stars
  "13023",    // Outlander
  "168668",   // Ender's Game
  "375802",   // Ender's Game (alt)
];

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scrapeBook(bookId: string): Promise<BookReview | null> {
  try {
    const url = `https://www.goodreads.com/book/show/${bookId}`;
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 10000 });
    const $ = cheerio.load(data);

    const title = $("h1.Text__title1").first().text().trim() ||
      $('[data-testid="bookTitle"]').text().trim();

    const author = $(".ContributorLink__name").first().text().trim() ||
      $('[class*="authorName"]').first().text().trim();

    const description = $('[data-testid="description"] .Formatted').text().trim() ||
      $("#description span").last().text().trim();

    const avgRating = parseFloat(
      $('[data-testid="ratingsCount"]').prev().text().trim() ||
      $(".RatingStatistics__rating").text().trim() || "0"
    );

    const genres: string[] = [];
    $('[data-testid="genresList"] .BookPageMetadataSection__genreButton').each((_, el) => {
      genres.push($(el).text().trim());
    });

    // Pull top 5 community reviews
    const reviews: string[] = [];
    $(".ReviewText__content").each((i, el) => {
      if (i < 5) reviews.push($(el).text().trim());
    });

    if (!title) {
      console.warn(`  Could not parse title for book ${bookId}`);
      return null;
    }

    return {
      bookId,
      title,
      author,
      genres,
      avgRating,
      description,
      reviewText: reviews.join(" | "),
    };
  } catch (err: any) {
    console.warn(`  Failed to scrape book ${bookId}: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log("Starting Goodreads scraper...");
  const results: BookReview[] = [];

  for (const bookId of SEED_BOOK_IDS) {
    console.log(`Scraping book ${bookId}...`);
    const book = await scrapeBook(bookId);
    if (book) {
      results.push(book);
      console.log(`  ✓ ${book.title} by ${book.author}`);
    }
    // Be polite — don't hammer the server
    await sleep(2000 + Math.random() * 1000);
  }

  const outPath = path.join(__dirname, "../../data/books.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nSaved ${results.length} books to ${outPath}`);
}

main().catch(console.error);
