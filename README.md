# BookRec

A book recommendation engine that uses natural language input to find books you'll love.

**Stack:** TypeScript · OpenAI Embeddings · Claude (Anthropic) · Vectra (local vector DB) · Express

---

## How it works

```
User input
    ↓
Parse + fix typos (Claude)
    ↓
Extract intent → themes, mood, pace, settings
    ↓
Embed intent → vector (OpenAI text-embedding-3-small)
    ↓
Vector similarity search against pre-indexed Goodreads reviews (Vectra)
    ↓
Top 10 candidates
    ↓
Claude re-ranks + generates natural language explanation
    ↓
Results
```

Two pipelines:
- **Offline (run once):** scrape → embed → index
- **Online (per request):** parse → embed → search → re-rank

---

## Setup

```bash
npm install
```

Set environment variables:
```bash
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
```

---

## Usage

### 1. Scrape books
```bash
npm run scrape
```
Scrapes ~20 books from Goodreads and saves to `data/books.json`.

### 2. Index books
```bash
npm run index
```
Embeds each book and stores vectors in `data/index/`.

### 3. Start the API
```bash
npm start
```

### 4. Get recommendations
```bash
curl -X POST http://localhost:3000/recommend \
  -H "Content-Type: application/json" \
  -d '{"query": "I want a dark psychological thriller with an unreliable narrator"}'
```

---

## API

### `POST /recommend`

**Request:**
```json
{ "query": "a cozy mystery set in a small English village" }
```

**Response:**
```json
{
  "query": "a cozy mystery set in a small English village",
  "intent": {
    "themes": ["mystery", "community"],
    "mood": "cozy and lighthearted",
    "pace": "moderate",
    "settings": ["small English village"]
  },
  "summary": "Here are some mysteries with the cozy, village atmosphere you're looking for.",
  "recommendations": [
    {
      "title": "...",
      "author": "...",
      "genres": "Mystery, Fiction",
      "avgRating": 4.1,
      "reason": "Set in a quiet English village with an amateur sleuth protagonist..."
    }
  ]
}
```

---

## Extending

- **More books:** Add IDs to `SEED_BOOK_IDS` in `src/scraper/goodreads.ts`, or swap in a dataset like [UCSD Book Graph](https://sites.google.com/eng.ucsd.edu/ucsdbookgraph/home)
- **Better scraping:** Replace Goodreads scraper with Google Books API or Open Library API for more reliable data
- **UI:** Add a frontend — the API is designed to be consumed by any client
