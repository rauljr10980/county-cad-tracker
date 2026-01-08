/**
 * Fix NULL array values in properties table
 * 
 * Sets NULL values in array fields (exemptions, jurisdictions, phoneNumbers)
 * to empty arrays [] instead of NULL
 * 
 * Usage: node fix-null-arrays.js
 */

require('dotenv').config();
const { Client } = require('pg');

async function fixNullArrays() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('='.repeat(80));
    console.log('FIXING NULL ARRAY VALUES');
    console.log('='.repeat(80));
    console.log('');

    if (!process.env.DATABASE_URL) {
      console.error('❌ ERROR: DATABASE_URL is not set in .env file');
      process.exit(1);
    }

    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Database connected');
    console.log('');

    // Check current NULL counts
    console.log('📊 Checking current NULL counts...');
    const checkQuery = `
      SELECT 
        COUNT(*) FILTER (WHERE "exemptions" IS NULL) as exemptions_null,
        COUNT(*) FILTER (WHERE "jurisdictions" IS NULL) as jurisdictions_null,
        COUNT(*) FILTER (WHERE "phoneNumbers" IS NULL) as phoneNumbers_null,
        COUNT(*) as total_rows
      FROM properties
    `;
    
    const checkResult = await client.query(checkQuery);
    const counts = checkResult.rows[0];
    
    console.log(`Total rows: ${counts.total_rows}`);
    console.log(`NULL exemptions: ${counts.exemptions_null}`);
    console.log(`NULL jurisdictions: ${counts.jurisdictions_null}`);
    console.log(`NULL phoneNumbers: ${counts.phoneNumbers_null}`);
    console.log('');

    if (counts.exemptions_null === 0 && counts.jurisdictions_null === 0 && counts.phoneNumbers_null === 0) {
      console.log('✅ No NULL array values found. Nothing to fix!');
      await client.end();
      process.exit(0);
    }

    // Fix NULL arrays
    console.log('🔧 Fixing NULL array values...');
    
    const fixQuery = `
      UPDATE properties
      SET 
        "exemptions" = CASE WHEN "exemptions" IS NULL THEN ARRAY[]::text[] ELSE "exemptions" END,
        "jurisdictions" = CASE WHEN "jurisdictions" IS NULL THEN ARRAY[]::text[] ELSE "jurisdictions" END,
        "phoneNumbers" = CASE WHEN "phoneNumbers" IS NULL THEN ARRAY[]::text[] ELSE "phoneNumbers" END,
        "updatedAt" = NOW()
      WHERE 
        "exemptions" IS NULL 
        OR "jurisdictions" IS NULL 
        OR "phoneNumbers" IS NULL
    `;

    const result = await client.query(fixQuery);
    console.log(`✅ Updated ${result.rowCount} rows`);
    console.log('');

    // Verify fix
    console.log('✅ Verifying fix...');
    const verifyResult = await client.query(checkQuery);
    const newCounts = verifyResult.rows[0];
    
    console.log(`NULL exemptions: ${newCounts.exemptions_null} (was ${counts.exemptions_null})`);
    console.log(`NULL jurisdictions: ${newCounts.jurisdictions_null} (was ${counts.jurisdictions_null})`);
    console.log(`NULL phoneNumbers: ${newCounts.phoneNumbers_null} (was ${counts.phoneNumbers_null})`);
    console.log('');

    if (newCounts.exemptions_null === 0 && newCounts.jurisdictions_null === 0 && newCounts.phoneNumbers_null === 0) {
      console.log('✅ All NULL array values fixed!');
    } else {
      console.log('⚠️  Some NULL values remain. Please check manually.');
    }

    console.log('='.repeat(80));
    await client.end();
    console.log('✅ Database disconnected');

  } catch (error) {
    console.error('');
    console.error('❌ ERROR:', error.message);
    console.error(error.stack);
    await client.end().catch(() => {});
    process.exit(1);
  }
}

// Run fix
fixNullArrays();


