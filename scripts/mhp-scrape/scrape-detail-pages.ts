#!/usr/bin/env node
/**
 * Phase 2: Scrape detail pages for all 640 mobile home parks
 *
 * Reads park IDs from la_mobile_home_parks.csv
 * For each park, fetches the detail page and extracts:
 * - lat/lon
 * - phone
 * - total_sites
 * - year_built
 * - community_type
 * - pets_allowed
 * - lot_rent
 * - source_url
 *
 * Upserts data into mobile_home_parks table via Tailscale tunnel
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ParkData {
  park_id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

interface ScrapedData extends ParkData {
  county?: string;
  lat?: number;
  lon?: number;
  phone?: string;
  total_sites?: number;
  year_built?: number;
  community_type?: string;
  pets_allowed?: boolean;
  lot_rent?: string;
  source_url?: string;
}

// Configuration
const CSV_PATH = path.join(__dirname, 'la_mobile_home_parks.csv');
const MHVILLAGE_BASE = 'https://www.mhvillage.com/parks';
const DB_HOST = 'localhost'; // SSH tunneled to Windows PC via Tailscale
const DB_NAME = 'entitlement_os';
const DB_USER = 'postgres';
// Get password from environment, fallback to common dev password
const DB_PASSWORD = process.env.DB_PASSWORD || 'postgres';
const RATE_LIMIT_MS = 500; // milliseconds between requests
const BATCH_SIZE = 10; // how many parks to upsert at once
const MAX_RETRIES = 3;

// Create database pool
const pool = new Pool({
  host: DB_HOST,
  port: 5432,
  database: DB_NAME,
  user: DB_USER,
  password: DB_PASSWORD,
});

// Rate limiter
let lastFetchTime = 0;
async function rateLimitedFetch(url: string): Promise<string> {
  const now = Date.now();
  const timeSinceLastFetch = now - lastFetchTime;
  if (timeSinceLastFetch < RATE_LIMIT_MS) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS - timeSinceLastFetch));
  }
  lastFetchTime = Date.now();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.text();
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw new Error('Fetch failed after retries');
}

/**
 * Extract data from MHVillage detail page
 */
function parseDetailPage(html: string, parkId: string): Partial<ScrapedData> {
  const data: Partial<ScrapedData> = {};

  // MHVillage is an Angular SPA with an embedded API JSON blob in the HTML.
  // Extract structured data from the embedded JSON payload.

  // Extract coordinatePoint (lat/lon)
  const coordMatch = html.match(/"coordinatePoint":\{"latitude":([0-9.-]+),"longitude":([0-9.-]+)\}/);
  if (coordMatch) {
    data.lat = parseFloat(coordMatch[1]);
    data.lon = parseFloat(coordMatch[2]);
  }

  // Extract county
  const countyMatch = html.match(/"county":"([^"]+)"/);
  if (countyMatch) {
    data.county = countyMatch[1];
  }

  // Extract phone number from embedded JSON (value can be numeric or string)
  const phoneMatch = html.match(/"phone":\{"key":\d+,"number":(\d{10,11})/);
  if (phoneMatch) {
    const digits = phoneMatch[1];
    data.phone = `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;
  }

  // Extract year built (skip 0 which means unknown)
  const yearMatch = html.match(/"yearBuilt":(\d+)/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    if (year > 1900) data.year_built = year;
  }

  // Extract pets allowed (0=unknown/no, 1=yes)
  const petsMatch = html.match(/"petsAllowed":(\d+)/);
  if (petsMatch) {
    const val = parseInt(petsMatch[1], 10);
    if (val === 1) data.pets_allowed = true;
    else if (val === 0) data.pets_allowed = false;
  }

  // Extract age restrictions (0=All Ages, 1=55+)
  const ageMatch = html.match(/"ageRestrictions":(\d+)/);
  if (ageMatch) {
    const val = parseInt(ageMatch[1], 10);
    if (val === 0) data.community_type = 'All Ages';
    else if (val === 1) data.community_type = '55+';
  }

  // Extract lot rent from text patterns (JSON may not have a direct field)
  const rentMatch = html.match(/\$[\d,]+(?:\s*[-–]\s*\$[\d,]+)?(?:\s*\/\s*mo)/);
  if (rentMatch) {
    data.lot_rent = rentMatch[0];
  }

  // Extract total sites/spaces from the embedded JSON or text
  const sitesMatch = html.match(/"vacant":(\d+)/) || html.match(/(\d+)\s*(?:sites|spaces|lots)/i);
  // vacant is just vacant count; look for total separately
  const totalMatch = html.match(/"total(?:Spaces|Sites|Units)":\s*(\d+)/i);
  if (totalMatch) {
    const total = parseInt(totalMatch[1], 10);
    if (total > 0) data.total_sites = total;
  }

  return data;
}

/**
 * Scrape detail page for a single park
 */
async function scrapePark(csvData: ParkData): Promise<ScrapedData> {
  const parkId = csvData.park_id;
  const url = `${MHVILLAGE_BASE}/${parkId}`;

  console.log(`[${parkId}] Fetching ${url}`);

  try {
    const html = await rateLimitedFetch(url);
    const parsed = parseDetailPage(html, parkId);

    return {
      ...csvData,
      ...parsed,
      source_url: url,
    };
  } catch (err) {
    console.error(`[${parkId}] Error scraping:`, err instanceof Error ? err.message : err);
    return {
      ...csvData,
      source_url: url,
    };
  }
}

/**
 * Upsert a batch of parks into the database
 */
async function upsertBatch(parks: ScrapedData[]): Promise<void> {
  if (parks.length === 0) return;

  const client = await pool.connect();
  try {
    const values: (string | number | boolean | null)[] = [];
    let valueStr = '';
    let paramIdx = 1;

    for (const park of parks) {
      if (valueStr) valueStr += ',';
      valueStr += `($${paramIdx},$${paramIdx + 1},$${paramIdx + 2},$${paramIdx + 3},$${paramIdx + 4},$${paramIdx + 5},$${paramIdx + 6},$${paramIdx + 7},$${paramIdx + 8},$${paramIdx + 9},$${paramIdx + 10},$${paramIdx + 11},$${paramIdx + 12},$${paramIdx + 13},$${paramIdx + 14},$${paramIdx + 15})`;
      paramIdx += 16;

      values.push(
        park.park_id,
        park.name,
        park.address || null,
        park.city,
        park.state,
        park.zip || null,
        park.county || null,
        park.lat || null,
        park.lon || null,
        park.phone || null,
        park.total_sites || null,
        park.year_built || null,
        park.community_type || null,
        park.pets_allowed !== undefined ? park.pets_allowed : null,
        park.lot_rent || null,
        park.source_url || null,
      );
    }

    const upsertSQL = `
      INSERT INTO mobile_home_parks (
        mhv_park_id, name, address, city, state, zip, county, lat, lon,
        phone, total_sites, year_built, community_type, pets_allowed, lot_rent, source_url
      ) VALUES ${valueStr}
      ON CONFLICT (mhv_park_id) DO UPDATE SET
        county = COALESCE(EXCLUDED.county, mobile_home_parks.county),
        phone = COALESCE(EXCLUDED.phone, mobile_home_parks.phone),
        total_sites = COALESCE(EXCLUDED.total_sites, mobile_home_parks.total_sites),
        year_built = COALESCE(EXCLUDED.year_built, mobile_home_parks.year_built),
        community_type = COALESCE(EXCLUDED.community_type, mobile_home_parks.community_type),
        pets_allowed = COALESCE(EXCLUDED.pets_allowed, mobile_home_parks.pets_allowed),
        lot_rent = COALESCE(EXCLUDED.lot_rent, mobile_home_parks.lot_rent),
        lat = EXCLUDED.lat,
        lon = EXCLUDED.lon,
        source_url = EXCLUDED.source_url,
        scraped_at = NOW()
      WHERE mobile_home_parks.mhv_park_id = EXCLUDED.mhv_park_id;
    `;

    await client.query(upsertSQL, values);
    console.log(`✓ Upserted ${parks.length} parks`);
  } catch (err) {
    console.error('Database error:', err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Update geom column based on lat/lon
 */
async function updateGeometry(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      UPDATE mobile_home_parks
      SET geom = ST_SetSRID(ST_MakePoint(lon, lat), 4326)
      WHERE lat IS NOT NULL AND lon IS NOT NULL AND geom IS NULL;
    `);
    const result = await client.query(
      `SELECT COUNT(*) as count FROM mobile_home_parks WHERE geom IS NOT NULL;`
    );
    console.log(`✓ Geometry updated. Total parks with geom: ${result.rows[0].count}`);
  } catch (err) {
    console.error('Geometry update error:', err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  console.log('📍 Phase 2: Scraping mobile home park detail pages');
  console.log(`CSV path: ${CSV_PATH}`);
  console.log(`Database: ${DB_NAME} @ ${DB_HOST}`);
  console.log('');

  try {
    // Read CSV
    const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
    }) as ParkData[];

    console.log(`Found ${records.length} parks in CSV`);

    // Scrape and upsert in batches
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const startIdx = i + 1;
      const endIdx = Math.min(i + BATCH_SIZE, records.length);

      console.log(`\n[${startIdx}-${endIdx}/${records.length}] Processing batch...`);

      const scrapedBatch: ScrapedData[] = [];
      for (const record of batch) {
        try {
          const scrapedData = await scrapePark(record);
          scrapedBatch.push(scrapedData);
          successCount++;
        } catch (err) {
          console.error(`Error scraping park ${record.park_id}:`, err);
          errorCount++;
          // Still add partial data so we don't lose name/address
          scrapedBatch.push({
            ...record,
            source_url: `${MHVILLAGE_BASE}/${record.park_id}`,
          });
        }
      }

      await upsertBatch(scrapedBatch);
    }

    console.log(`\n📊 Scraping complete: ${successCount} successful, ${errorCount} errors`);

    // Update geometry column
    console.log('\n🗺️  Updating PostGIS geometry...');
    await updateGeometry();

    console.log('\n✅ Phase 2 complete!');
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
