/**
 * Background Geocoding Script
 * Processes all properties without coordinates using OpenStreetMap Nominatim
 *
 * Usage: node functions/scripts/geocode-all-properties.js
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Nominatim rate limits: 1 request/second, but we batch 5 with delays
const BATCH_SIZE = 5;
const DELAY_MS = 1100; // Slightly over 1 second to be safe with Nominatim

let successCount = 0;
let failCount = 0;
let processedCount = 0;

/**
 * Geocode a single address using Nominatim
 */
async function geocodeAddress(address, state = 'TX') {
  try {
    const searchQuery = `${address}, ${state}`;
    const url = `https://nominatim.openstreetmap.org/search?` + new URLSearchParams({
      q: searchQuery,
      format: 'json',
      limit: '1',
      addressdetails: '1',
    });

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'County-CAD-Tracker/1.0',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      return null;
    }

    const result = data[0];
    return {
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
    };
  } catch (error) {
    return null;
  }
}

/**
 * Extract actual street address from property address field
 * Some addresses have owner name prepended
 */
function extractAddress(propertyAddress) {
  if (!propertyAddress) return null;

  // Look for first number which likely starts the street address
  const match = propertyAddress.match(/\d+\s+[A-Za-z]/);
  if (match) {
    const startIndex = propertyAddress.indexOf(match[0]);
    return propertyAddress.substring(startIndex).trim();
  }

  return propertyAddress;
}

/**
 * Process a batch of properties
 */
async function processBatch(properties) {
  const promises = properties.map(async (property) => {
    const address = extractAddress(property.propertyAddress);

    if (!address || address.length < 5) {
      failCount++;
      return;
    }

    const result = await geocodeAddress(address);

    if (result && result.latitude && result.longitude) {
      await prisma.property.update({
        where: { id: property.id },
        data: {
          latitude: result.latitude,
          longitude: result.longitude,
        },
      });
      successCount++;
    } else {
      failCount++;
    }

    processedCount++;
  });

  await Promise.all(promises);
}

/**
 * Display progress bar
 */
function showProgress(current, total) {
  const percent = ((current / total) * 100).toFixed(1);
  const barLength = 40;
  const filled = Math.round((current / total) * barLength);
  const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);

  const elapsed = (Date.now() - startTime) / 1000;
  const rate = current / elapsed;
  const remaining = (total - current) / rate;
  const eta = remaining > 0 ? formatTime(remaining) : '0s';

  process.stdout.write(`\r[${bar}] ${percent}% | ${current}/${total} | ✓${successCount} ✗${failCount} | ETA: ${eta}   `);
}

function formatTime(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
}

let startTime;

async function main() {
  console.log('🌍 Geocoding Script for County CAD Tracker');
  console.log('==========================================\n');

  // Count properties needing geocoding
  const totalNeedingGeocode = await prisma.property.count({
    where: {
      OR: [
        { latitude: null },
        { longitude: null },
      ],
      propertyAddress: { not: '' },
    },
  });

  const totalWithCoords = await prisma.property.count({
    where: {
      latitude: { not: null },
      longitude: { not: null },
    },
  });

  const totalProperties = await prisma.property.count();

  console.log(`📊 Database Stats:`);
  console.log(`   Total properties: ${totalProperties.toLocaleString()}`);
  console.log(`   Already geocoded: ${totalWithCoords.toLocaleString()}`);
  console.log(`   Need geocoding:   ${totalNeedingGeocode.toLocaleString()}\n`);

  if (totalNeedingGeocode === 0) {
    console.log('✅ All properties already have coordinates!');
    await prisma.$disconnect();
    return;
  }

  const estimatedTime = (totalNeedingGeocode / BATCH_SIZE) * (DELAY_MS / 1000);
  console.log(`⏱️  Estimated time: ${formatTime(estimatedTime)}`);
  console.log(`   Rate: ~${BATCH_SIZE} addresses/second (Nominatim limit)\n`);
  console.log('Starting geocoding...\n');

  startTime = Date.now();

  // Process in batches
  let offset = 0;

  while (true) {
    const properties = await prisma.property.findMany({
      where: {
        OR: [
          { latitude: null },
          { longitude: null },
        ],
        propertyAddress: { not: '' },
      },
      select: {
        id: true,
        propertyAddress: true,
      },
      take: BATCH_SIZE,
      skip: 0, // Always take from beginning since we're updating records
    });

    if (properties.length === 0) break;

    await processBatch(properties);
    showProgress(processedCount, totalNeedingGeocode);

    // Rate limiting delay
    await new Promise(resolve => setTimeout(resolve, DELAY_MS));
  }

  const totalTime = (Date.now() - startTime) / 1000;

  console.log('\n\n==========================================');
  console.log('✅ Geocoding Complete!');
  console.log(`   Processed: ${processedCount.toLocaleString()}`);
  console.log(`   Success:   ${successCount.toLocaleString()}`);
  console.log(`   Failed:    ${failCount.toLocaleString()}`);
  console.log(`   Time:      ${formatTime(totalTime)}`);
  console.log(`   Rate:      ${(processedCount / totalTime).toFixed(1)} addresses/second`);
  console.log('==========================================\n');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('\n❌ Error:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
