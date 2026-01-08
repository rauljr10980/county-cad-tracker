/**
 * Test the upload endpoint to verify it's working
 */

require('dotenv').config();
const fetch = require('node-fetch');

const API_URL = process.env.API_URL || 'http://localhost:8080';

async function testUploadEndpoint() {
  console.log('='.repeat(80));
  console.log('TESTING UPLOAD ENDPOINT');
  console.log('='.repeat(80));
  console.log(`API URL: ${API_URL}`);
  console.log('');

  // Test 1: Health check
  console.log('1. Testing health endpoint...');
  try {
    const healthResponse = await fetch(`${API_URL}/health`);
    if (healthResponse.ok) {
      const healthData = await healthResponse.json();
      console.log('✅ Health check passed:', healthData);
    } else {
      console.log('❌ Health check failed:', healthResponse.status, healthResponse.statusText);
    }
  } catch (error) {
    console.log('❌ Health check error:', error.message);
    console.log('   Server might not be running or URL is incorrect');
  }
  console.log('');

  // Test 2: CORS preflight
  console.log('2. Testing CORS preflight...');
  try {
    const corsResponse = await fetch(`${API_URL}/api/upload`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });
    console.log('✅ CORS preflight status:', corsResponse.status);
    console.log('   CORS headers:', {
      'access-control-allow-origin': corsResponse.headers.get('access-control-allow-origin'),
      'access-control-allow-methods': corsResponse.headers.get('access-control-allow-methods'),
      'access-control-allow-headers': corsResponse.headers.get('access-control-allow-headers')
    });
  } catch (error) {
    console.log('❌ CORS preflight error:', error.message);
  }
  console.log('');

  // Test 3: Upload endpoint (with minimal data)
  console.log('3. Testing upload endpoint...');
  try {
    // Create a minimal Excel file (just headers)
    const testData = {
      filename: 'test.xlsx',
      fileData: 'UEsDBBQAAAAIAA===' // Minimal base64 that won't work but tests the endpoint
    };

    const uploadResponse = await fetch(`${API_URL}/api/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:5173'
      },
      body: JSON.stringify(testData)
    });

    const uploadResult = await uploadResponse.json();
    console.log('✅ Upload endpoint responded:', uploadResponse.status);
    console.log('   Response:', uploadResult);
    
    if (uploadResponse.status === 400) {
      console.log('   (Expected 400 - test file is invalid, but endpoint is working)');
    }
  } catch (error) {
    console.log('❌ Upload endpoint error:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('   Server is not running or URL is incorrect');
      console.log(`   Make sure the server is running at: ${API_URL}`);
    } else if (error.code === 'ENOTFOUND') {
      console.log('   Could not resolve hostname');
    }
  }
  console.log('');

  // Test 4: Check DATABASE_URL
  console.log('4. Checking environment...');
  if (process.env.DATABASE_URL) {
    console.log('✅ DATABASE_URL is set');
  } else {
    console.log('⚠️  DATABASE_URL is not set');
  }
  console.log('');

  console.log('='.repeat(80));
  console.log('TEST COMPLETE');
  console.log('='.repeat(80));
}

testUploadEndpoint().catch(console.error);


