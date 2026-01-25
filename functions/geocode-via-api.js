/**
 * Geocode All Properties via API Endpoint
 * This script calls the batch geocoding API endpoint repeatedly
 * until all properties are geocoded. This avoids Prisma client issues.
 */

const API_BASE_URL = process.env.API_BASE_URL || 'https://county-cad-tracker-production.up.railway.app';
const BATCH_SIZE = 100;
const DELAY_MS = 2000; // 2 seconds between API calls

async function getGeocodeStatus() {
  const response = await fetch(`${API_BASE_URL}/api/properties/geocode/status`);
  if (!response.ok) {
    throw new Error(`Failed to get status: ${response.status}`);
  }
  return response.json();
}

async function batchGeocode(limit, offset) {
  const response = await fetch(`${API_BASE_URL}/api/properties/geocode/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ limit, offset }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Failed to geocode: ${response.status}`);
  }
  
  return response.json();
}

async function main() {
  try {
    console.log('🚀 Starting batch geocoding via API...\n');
    
    // Get initial status
    let status = await getGeocodeStatus();
    console.log('📊 Initial Status:');
    console.log(`   Total Properties: ${status.total.toLocaleString()}`);
    console.log(`   With Coordinates: ${status.withCoordinates.toLocaleString()}`);
    console.log(`   Without Coordinates: ${status.withoutCoordinates.toLocaleString()}`);
    console.log(`   Completion: ${status.completion.toFixed(2)}%\n`);
    
    if (status.withoutCoordinates === 0) {
      console.log('✅ All properties already have coordinates!');
      return;
    }
    
    let offset = 0;
    let totalSuccessful = 0;
    let totalErrors = 0;
    let totalSkipped = 0;
    const startTime = Date.now();
    
    while (offset < status.withoutCoordinates) {
      console.log(`\n📦 Processing batch: ${offset} - ${offset + BATCH_SIZE} / ${status.withoutCoordinates}`);
      
      try {
        const result = await batchGeocode(BATCH_SIZE, offset);
        
        totalSuccessful += result.successful;
        totalErrors += result.errors;
        totalSkipped += result.skipped;
        
        console.log(`   ✅ Successful: ${result.successful}`);
        console.log(`   ❌ Errors: ${result.errors}`);
        console.log(`   ⏭️  Skipped: ${result.skipped}`);
        
        // Update status
        status = await getGeocodeStatus();
        console.log(`   📊 Progress: ${status.withCoordinates} / ${status.total} (${status.completion.toFixed(2)}%)`);
        
        // If no more properties need geocoding, break
        if (status.withoutCoordinates === 0 || result.processed === 0) {
          break;
        }
        
        offset += BATCH_SIZE;
        
        // Delay between batches
        if (offset < status.withoutCoordinates) {
          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
      } catch (error) {
        console.error(`❌ Error processing batch: ${error.message}`);
        console.log('   Retrying in 5 seconds...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        // Don't increment offset on error, retry same batch
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
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
