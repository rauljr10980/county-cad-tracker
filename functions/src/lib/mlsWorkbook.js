/**
 * connectMLS multifamily exports. All four files observed share one 30-column
 * layout, so one parser serves them. Every column is carried onto the model —
 * a field that looks useless here is the one wanted while working a lead, and
 * recovering it later means a re-import.
 */

const MLS_COLUMNS = [
  'MLS#', 'Status', 'Area', 'Address', 'LP/SP', 'DOM', 'Ttl Units', 'SqFt',
  'Yr Blt', 'Type', 'Bldr Name', 'Constrctn', 'County', 'CountAct#',
  'County Tax', 'Legal Desc', 'LglDsc-Lot', 'List Agent', 'List Agent Ph.',
  'Owner', 'LREA/LREB', 'Selling Agent', 'Selling Agent Ph.', 'State', 'Dir',
  'Street Name', 'Str #', 'TaxPropID', 'Zip', 'ZipPlus',
];

const text = (value) => String(value ?? '').trim();
// Addresses arrive with a doubled space where the directional would go.
const squash = (value) => text(value).replace(/\s+/g, ' ');
const number = (value) => {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const parseRow = (row) => {
  const mlsNumber = text(row['MLS#']);
  if (!mlsNumber) return null;
  return {
    mlsNumber,
    status: text(row.Status),
    areaCode: text(row.Area),
    address: squash(row.Address),
    streetNumber: text(row['Str #']),
    streetDir: text(row.Dir),
    streetName: squash(row['Street Name']),
    zip: text(row.Zip),
    zipPlus: text(row.ZipPlus),
    county: text(row.County),
    state: text(row.State),
    price: number(row['LP/SP']),
    daysOnMarket: number(row.DOM),
    totalUnits: number(row['Ttl Units']),
    squareFeet: number(row.SqFt),
    yearBuilt: number(row['Yr Blt']),
    propertyType: text(row.Type),
    construction: text(row.Constrctn),
    builderName: text(row['Bldr Name']),
    legalDescription: text(row['Legal Desc']),
    legalLot: text(row['LglDsc-Lot']),
    countyAccountNumber: text(row['CountAct#']),
    taxPropId: text(row.TaxPropID),
    countyTax: text(row['County Tax']),
    listAgent: text(row['List Agent']),
    listAgentPhone: text(row['List Agent Ph.']),
    sellingAgent: text(row['Selling Agent']),
    sellingAgentPhone: text(row['Selling Agent Ph.']),
    lreaLreb: text(row['LREA/LREB']),
    mlsOwnerRaw: text(row.Owner),
  };
};

const parseSheet = (rows) => rows.map(parseRow).filter(Boolean);

// The four exports overlap: 2,471 rows carry 2,321 distinct MLS numbers.
// First occurrence wins, so the earliest file in the upload is authoritative.
const dedupe = (leads) => {
  const seen = new Set();
  return leads.filter((lead) => {
    if (seen.has(lead.mlsNumber)) return false;
    seen.add(lead.mlsNumber);
    return true;
  });
};

module.exports = { MLS_COLUMNS, parseSheet, dedupe };
