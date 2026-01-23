/**
 * Batch Geocode All Properties Script
 * This script will geocode all properties without coordinates in the database
 * It processes in batches with proper rate limiting to respect Nominatim's API limits
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const BATCH_SIZE = 100; // Process 100 properties per batch
const GEOCODE_BATCH_SIZE = 5; // Geocode 5 addresses at a time
const DELAY_MS = 1200; // 1.2 seconds between geocode batches (respects 1 req/sec limit)

/**
 * Geocode a single address using Nominatim
 */
async function geocodeAddress(address) {
  try {
    const searchQuery = `${address}, San Antonio, TX`;
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
      return { error: `API returned ${response.status}` };
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      return { error: 'Address not found' };
    }

    const result = data[0];
    return {
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
      displayName: result.display_name,
    };
  } catch (error) {
    return { error: error.message || 'Unknown error' };
  }
}

/**
 * Process a batch of properties
 */
async function processBatch(properties, batchNumber, totalBatches) {
  console.log(`\n[Batch ${batchNumber}/${totalBatches}] Processing ${properties.length} properties...`);
  
  const results = {
    successful: 0,
    errors: 0,
    skipped: 0,
  };

  // Process in smaller geocode batches
  for (let i = 0; i < properties.length; i += GEOCODE_BATCH_SIZE) {
    const geocodeBatch = properties.slice(i, i + GEOCODE_BATCH_SIZE);
    
    const geocodePromises = geocodeBatch.map(async (property) => {
      // Skip if already has coordinates
      if (property.latitude && property.longitude) {
        results.skipped++;
        return {
          id: property.id,
          accountNumber: property.accountNumber,
          success: true,
          skipped: true,
        };
      }

      if (!property.propertyAddress || property.propertyAddress.trim() === '') {
        results.errors++;
        return {
          id: property.id,
          accountNumber: property.accountNumber,
          success: false,
          error: 'No address provided',
        };
      }

      const geocodeResult = await geocodeAddress(property.propertyAddress);

      if (geocodeResult.error) {
        results.errors++;
        console.log(`  ❌ ${property.accountNumber}: ${geocodeResult.error}`);
        return {
          id: property.id,
          accountNumber: property.accountNumber,
          success: false,
          error: geocodeResult.error,
        };
      }

      // Update property with coordinates
      try {
        await prisma.property.update({
          where: { id: property.id },
          data: {
            latitude: geocodeResult.latitude,
            longitude: geocodeResult.longitude,
          },
        });

        results.successful++;
        console.log(`  ✅ ${property.accountNumber}: ${geocodeResult.latitude.toFixed(6)}, ${geocodeResult.longitude.toFixed(6)}`);
        return {
          id: property.id,
          accountNumber: property.accountNumber,
          success: true,
          latitude: geocodeResult.latitude,
          longitude: geocodeResult.longitude,
        };
      } catch (updateError) {
        results.errors++;
        console.log(`  ❌ ${property.accountNumber}: Failed to update - ${updateError.message}`);
        return {
          id: property.id,
          accountNumber: property.accountNumber,
          success: false,
          error: `Update failed: ${updateError.message}`,
        };
      }
    });

    // Wait for geocode batch to complete
    await Promise.all(geocodePromises);

    // Rate limiting: wait between geocode batches (except for last batch)
    if (i + GEOCODE_BATCH_SIZE < properties.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }

  return results;
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('🚀 Starting batch geocoding of all properties...\n');

    // Get total count
    const [totalProperties, propertiesWithoutCoords] = await Promise.all([
      prisma.property.count(),
      prisma.property.count({
        where: {
          AND: [
            {
              OR: [
                { latitude: null },
                { longitude: null }
              ]
            },
            {
              propertyAddress: { not: '' },
              propertyAddress: { not: null }
            }
          ]
        }
      })
    ]);

    console.log(`📊 Statistics:`);
    console.log(`   Total properties: ${totalProperties.toLocaleString()}`);
    console.log(`   Properties without coordinates: ${propertiesWithoutCoords.toLocaleString()}`);
    console.log(`   Properties with coordinates: ${(totalProperties - propertiesWithoutCoords).toLocaleString()}`);
    console.log(`   Completion: ${((totalProperties - propertiesWithoutCoords) / totalProperties * 100).toFixed(2)}%\n`);

    if (propertiesWithoutCoords === 0) {
      console.log('✅ All properties already have coordinates!');
      return;
    }

    const totalBatches = Math.ceil(propertiesWithoutCoords / BATCH_SIZE);
    console.log(`📦 Will process in ${totalBatches} batches of ${BATCH_SIZE} properties each\n`);
    console.log(`⏱️  Estimated time: ~${Math.ceil(propertiesWithoutCoords / GEOCODE_BATCH_SIZE * DELAY_MS / 1000 / 60)} minutes\n`);

    let offset = 0;
    let totalSuccessful = 0;
    let totalErrors = 0;
    let totalSkipped = 0;
    const startTime = Date.now();

    while (offset < propertiesWithoutCoords) {
      // Fetch batch
      const properties = await prisma.property.findMany({
        where: {
          AND: [
            {
              OR: [
                { latitude: null },
                { longitude: null }
              ]
            },
            {
              propertyAddress: { not: '' },
              propertyAddress: { not: null }
            }
          ]
        },
        select: {
          id: true,
          propertyAddress: true,
          accountNumber: true,
          latitude: true,
          longitude: true,
        },
        take: BATCH_SIZE,
        skip: offset,
        orderBy: { createdAt: 'asc' }
      });

      if (properties.length === 0) {
        console.log('No more properties to geocode.');
        break;
      }

      const batchNumber = Math.floor(offset / BATCH_SIZE) + 1;
      const batchResults = await processBatch(properties, batchNumber, totalBatches);

      totalSuccessful += batchResults.successful;
      totalErrors += batchResults.errors;
      totalSkipped += batchResults.skipped;

      const elapsed = (Date.now() - startTime) / 1000 / 60;
      const rate = totalSuccessful / elapsed;
      const remaining = (propertiesWithoutCoords - offset - properties.length) / rate;

      console.log(`\n📈 Progress: ${(offset + properties.length).toLocaleString()} / ${propertiesWithoutCoords.toLocaleString()}`);
      console.log(`   ✅ Successful: ${totalSuccessful.toLocaleString()}`);
      console.log(`   ❌ Errors: ${totalErrors.toLocaleString()}`);
      console.log(`   ⏭️  Skipped: ${totalSkipped.toLocaleString()}`);
      console.log(`   ⏱️  Elapsed: ${elapsed.toFixed(1)} minutes`);
      console.log(`   📊 Rate: ${rate.toFixed(1)} properties/minute`);
      console.log(`   ⏳ Estimated remaining: ${remaining.toFixed(1)} minutes`);

      offset += BATCH_SIZE;

      // Small delay between batches
      if (offset < propertiesWithoutCoords) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const totalTime = (Date.now() - startTime) / 1000 / 60;
    console.log('\n' + '='.repeat(60));
    console.log('✅ BATCH GEOCODING COMPLETE!');
    console.log('='.repeat(60));
    console.log(`📊 Final Statistics:`);
    console.log(`   ✅ Successful: ${totalSuccessful.toLocaleString()}`);
    console.log(`   ❌ Errors: ${totalErrors.toLocaleString()}`);
    console.log(`   ⏭️  Skipped: ${totalSkipped.toLocaleString()}`);
    console.log(`   ⏱️  Total time: ${totalTime.toFixed(1)} minutes`);
    console.log(`   📊 Average rate: ${(totalSuccessful / totalTime).toFixed(1)} properties/minute`);
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
main()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
