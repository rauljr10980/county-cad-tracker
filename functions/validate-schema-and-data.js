/**
 * Validate PostgreSQL table schema and data before insertion
 * 
 * This script:
 * 1. Checks the actual PostgreSQL table structure
 * 2. Validates data types match Prisma schema
 * 3. Identifies potential data issues
 * 4. Provides recommendations for fixes
 * 
 * Usage: node validate-schema-and-data.js
 */

require('dotenv').config();
const { Client } = require('pg');
const XLSX = require('xlsx');

async function validateSchemaAndData() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('='.repeat(80));
    console.log('POSTGRESQL SCHEMA & DATA VALIDATION');
    console.log('='.repeat(80));
    console.log('');

    // Check DATABASE_URL
    if (!process.env.DATABASE_URL) {
      console.error('❌ ERROR: DATABASE_URL is not set in .env file');
      process.exit(1);
    }

    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Database connected');
    console.log('');

    // 1. Check table exists
    console.log('📋 Checking if "properties" table exists...');
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'properties'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.error('❌ ERROR: "properties" table does not exist!');
      console.error('   Run: npx prisma migrate deploy');
      await client.end();
      process.exit(1);
    }
    console.log('✅ Table "properties" exists');
    console.log('');

    // 2. Get actual table schema
    console.log('📊 Analyzing table schema...');
    const schemaQuery = `
      SELECT 
        column_name,
        data_type,
        udt_name,
        character_maximum_length,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' 
      AND table_name = 'properties'
      ORDER BY ordinal_position;
    `;

    const schemaResult = await client.query(schemaQuery);
    const actualColumns = {};
    
    console.log(`Found ${schemaResult.rows.length} columns in properties table:`);
    console.log('');
    
    schemaResult.rows.forEach(col => {
      actualColumns[col.column_name] = {
        type: col.data_type,
        udt: col.udt_name,
        maxLength: col.character_maximum_length,
        nullable: col.is_nullable === 'YES',
        default: col.column_default
      };
      
      const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      const length = col.character_maximum_length ? `(${col.character_maximum_length})` : '';
      console.log(`  - ${col.column_name}: ${col.udt_name}${length} ${nullable}`);
    });
    console.log('');

    // 3. Expected schema from Prisma
    const expectedSchema = {
      id: { type: 'text', nullable: false },
      accountNumber: { type: 'text', nullable: false, unique: true },
      ownerName: { type: 'text', nullable: false },
      propertyAddress: { type: 'text', nullable: false },
      mailingAddress: { type: 'text', nullable: true },
      totalDue: { type: 'double precision', nullable: false },
      percentageDue: { type: 'double precision', nullable: false },
      status: { type: 'text', nullable: false },
      previousStatus: { type: 'text', nullable: true },
      taxYear: { type: 'integer', nullable: true },
      legalDescription: { type: 'text', nullable: true },
      marketValue: { type: 'double precision', nullable: true },
      landValue: { type: 'double precision', nullable: true },
      improvementValue: { type: 'double precision', nullable: true },
      cappedValue: { type: 'double precision', nullable: true },
      agriculturalValue: { type: 'double precision', nullable: true },
      exemptions: { type: 'text[]', nullable: false, isArray: true },
      jurisdictions: { type: 'text[]', nullable: false, isArray: true },
      lastPaymentDate: { type: 'text', nullable: true },
      lastPaymentAmount: { type: 'double precision', nullable: true },
      lastPayer: { type: 'text', nullable: true },
      delinquentAfter: { type: 'text', nullable: true },
      halfPaymentOptionAmount: { type: 'double precision', nullable: true },
      priorYearsAmountDue: { type: 'double precision', nullable: true },
      yearAmountDue: { type: 'double precision', nullable: true },
      yearTaxLevy: { type: 'double precision', nullable: true },
      link: { type: 'text', nullable: true },
      ownerAddress: { type: 'text', nullable: true },
      phoneNumbers: { type: 'text[]', nullable: false, isArray: true },
      ownerPhoneIndex: { type: 'integer', nullable: true },
      dealStage: { type: 'text', nullable: true },
      estimatedDealValue: { type: 'double precision', nullable: true },
      offerAmount: { type: 'double precision', nullable: true },
      expectedCloseDate: { type: 'timestamp', nullable: true },
      isNew: { type: 'boolean', nullable: false, default: false },
      isRemoved: { type: 'boolean', nullable: false, default: false },
      statusChanged: { type: 'boolean', nullable: false, default: false },
      percentageChanged: { type: 'boolean', nullable: false, default: false },
      createdAt: { type: 'timestamp', nullable: false },
      updatedAt: { type: 'timestamp', nullable: false }
    };

    // 4. Compare expected vs actual
    console.log('🔍 Comparing expected schema vs actual schema...');
    console.log('');
    
    const issues = [];
    const missingColumns = [];
    const typeMismatches = [];

    Object.keys(expectedSchema).forEach(colName => {
      const expected = expectedSchema[colName];
      const actual = actualColumns[colName];

      if (!actual) {
        missingColumns.push(colName);
        issues.push({
          column: colName,
          severity: 'ERROR',
          issue: 'Column missing from database',
          expected: expected.type,
          actual: 'MISSING'
        });
      } else {
        // Check type compatibility
        const expectedType = expected.type;
        const actualType = actual.udt;

        // Map PostgreSQL types (including internal type names)
        const typeMap = {
          'text': ['text', 'varchar', 'character varying'],
          'double precision': ['double precision', 'float8', 'numeric', 'real'],
          'integer': ['integer', 'int4', 'bigint', 'int8'],
          'boolean': ['boolean', 'bool'],
          'timestamp': ['timestamp', 'timestamptz', 'timestamp without time zone'],
          'text[]': ['text[]', '_text', 'ARRAY'] // _text is PostgreSQL's array type name
        };

        let typeMatch = false;
        for (const [expectedKey, possibleTypes] of Object.entries(typeMap)) {
          if (expectedType === expectedKey && possibleTypes.includes(actualType)) {
            typeMatch = true;
            break;
          }
        }

        // Special check for arrays (PostgreSQL uses _text for text[] arrays)
        if (expected.isArray && (actualType === 'ARRAY' || actualType === '_text' || actualType.includes('[]'))) {
          typeMatch = true;
        }
        
        // Check for enum types (Prisma creates custom types like PropertyStatus, DealStage)
        if (actualType && (actualType.includes('Status') || actualType.includes('Stage'))) {
          // These are Prisma enum types, which are compatible with text
          if (expectedType === 'text') {
            typeMatch = true;
          }
        }

        if (!typeMatch && expectedType !== actualType) {
          typeMismatches.push(colName);
          issues.push({
            column: colName,
            severity: 'WARNING',
            issue: 'Type mismatch',
            expected: expectedType,
            actual: actualType
          });
        }

        // Check nullability
        if (!expected.nullable && actual.nullable) {
          issues.push({
            column: colName,
            severity: 'WARNING',
            issue: 'Column should be NOT NULL but is nullable',
            expected: 'NOT NULL',
            actual: 'NULL'
          });
        }
      }
    });

    // 5. Check for extra columns in database
    const extraColumns = [];
    Object.keys(actualColumns).forEach(colName => {
      if (!expectedSchema[colName]) {
        extraColumns.push(colName);
      }
    });

    // 6. Report findings
    console.log('📊 VALIDATION RESULTS:');
    console.log('');

    if (issues.length === 0 && missingColumns.length === 0 && typeMismatches.length === 0) {
      console.log('✅ Schema matches Prisma schema perfectly!');
    } else {
      if (missingColumns.length > 0) {
        console.log(`❌ Missing columns (${missingColumns.length}):`);
        missingColumns.forEach(col => {
          console.log(`   - ${col} (expected: ${expectedSchema[col].type})`);
        });
        console.log('');
      }

      if (typeMismatches.length > 0) {
        console.log(`⚠️  Type mismatches (${typeMismatches.length}):`);
        typeMismatches.forEach(col => {
          const issue = issues.find(i => i.column === col);
          console.log(`   - ${col}: expected ${issue.expected}, got ${issue.actual}`);
        });
        console.log('');
      }

      if (extraColumns.length > 0) {
        console.log(`ℹ️  Extra columns in database (${extraColumns.length}):`);
        extraColumns.forEach(col => {
          console.log(`   - ${col} (${actualColumns[col].udt})`);
        });
        console.log('');
      }
    }

    // 7. Check existing data for issues
    console.log('🔍 Checking existing data for issues...');
    console.log('');

    const dataIssues = [];

    // Check for NULL in required fields
    const requiredFields = ['accountNumber', 'ownerName', 'propertyAddress', 'totalDue', 'status'];
    for (const field of requiredFields) {
      const nullCheck = await client.query(`
        SELECT COUNT(*) as count 
        FROM properties 
        WHERE "${field}" IS NULL
      `);
      const nullCount = parseInt(nullCheck.rows[0].count);
      if (nullCount > 0) {
        dataIssues.push({
          field,
          issue: `Has ${nullCount} NULL values (should be NOT NULL)`,
          severity: 'ERROR'
        });
      }
    }

    // Check for invalid status values
    const statusCheck = await client.query(`
      SELECT DISTINCT status, COUNT(*) as count
      FROM properties
      GROUP BY status
      ORDER BY count DESC
    `);
    
    const validStatuses = ['JUDGMENT', 'ACTIVE', 'PENDING', 'PAID', 'REMOVED'];
    const invalidStatuses = statusCheck.rows
      .filter(row => !validStatuses.includes(row.status))
      .map(row => ({ status: row.status, count: row.count }));

    if (invalidStatuses.length > 0) {
      dataIssues.push({
        field: 'status',
        issue: `Invalid status values: ${invalidStatuses.map(s => `${s.status} (${s.count})`).join(', ')}`,
        severity: 'WARNING'
      });
    }

    // Check array fields
    const arrayFields = ['exemptions', 'jurisdictions', 'phoneNumbers'];
    for (const field of arrayFields) {
      if (actualColumns[field]) {
        const arrayCheck = await client.query(`
          SELECT COUNT(*) as count
          FROM properties
          WHERE "${field}" IS NULL
        `);
        const nullCount = parseInt(arrayCheck.rows[0].count);
        if (nullCount > 0) {
          dataIssues.push({
            field,
            issue: `Has ${nullCount} NULL values (should be empty array [])`,
            severity: 'WARNING'
          });
        }
      }
    }

    // Report data issues
    if (dataIssues.length > 0) {
      console.log('⚠️  Data issues found:');
      dataIssues.forEach(issue => {
        const icon = issue.severity === 'ERROR' ? '❌' : '⚠️';
        console.log(`   ${icon} ${issue.field}: ${issue.issue}`);
      });
      console.log('');
    } else {
      console.log('✅ No data issues found');
      console.log('');
    }

    // 8. Recommendations
    console.log('💡 RECOMMENDATIONS:');
    console.log('');

    if (missingColumns.length > 0) {
      console.log('1. Run Prisma migrations to add missing columns:');
      console.log('   cd functions');
      console.log('   npx prisma migrate dev');
      console.log('   OR');
      console.log('   npx prisma db push');
      console.log('');
    }

    if (typeMismatches.length > 0 || dataIssues.length > 0) {
      console.log('2. Before uploading new data:');
      console.log('   - Ensure all required fields have values');
      console.log('   - Validate status values are one of: JUDGMENT, ACTIVE, PENDING, PAID, REMOVED');
      console.log('   - Ensure array fields (exemptions, jurisdictions) are valid JSON arrays');
      console.log('   - Validate numeric fields are valid numbers');
      console.log('');
    }

    console.log('3. For array fields in PostgreSQL:');
    console.log('   - Use PostgreSQL array syntax: ARRAY[\'value1\', \'value2\']');
    console.log('   - Or use JSON.stringify() and cast to text[]');
    console.log('   - Empty arrays should be: ARRAY[]::text[]');
    console.log('');

    // 9. Summary
    console.log('='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total columns in database: ${schemaResult.rows.length}`);
    console.log(`Expected columns: ${Object.keys(expectedSchema).length}`);
    console.log(`Missing columns: ${missingColumns.length}`);
    console.log(`Type mismatches: ${typeMismatches.length}`);
    console.log(`Data issues: ${dataIssues.length}`);
    console.log('='.repeat(80));

    await client.end();
    console.log('✅ Database disconnected');

    // Exit with error code if critical issues found
    if (missingColumns.length > 0 || dataIssues.some(i => i.severity === 'ERROR')) {
      console.log('');
      console.log('❌ Critical issues found. Please fix before uploading data.');
      process.exit(1);
    } else {
      console.log('');
      console.log('✅ Schema validation passed. Safe to upload data.');
      process.exit(0);
    }

  } catch (error) {
    console.error('');
    console.error('❌ ERROR:', error.message);
    console.error(error.stack);
    await client.end().catch(() => {});
    process.exit(1);
  }
}

// Run validation
validateSchemaAndData();

