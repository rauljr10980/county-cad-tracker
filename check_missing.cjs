const XLSX = require('xlsx');

const workbook = XLSX.readFile('./finishedscraperdata.xlsx');
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
const range = XLSX.utils.decode_range(worksheet['!ref']);
range.s.r = 2;
worksheet['!ref'] = XLSX.utils.encode_range(range);
const data = XLSX.utils.sheet_to_json(worksheet);

// Check rows without LEGALSTATUS
const noStatus = data.filter(r => !r.LEGALSTATUS);
console.log('Total without LEGALSTATUS:', noStatus.length);

let noPropertyAddress = 0;
let noOwnerName = 0;
let emptyPropertyAddress = 0;

noStatus.forEach(row => {
  const propAddr = row['NEW-Property Site Address'] || row['PSTRNAME'];
  const owner = row['ADDRSTRING'];

  if (!propAddr) noPropertyAddress++;
  if (propAddr === '' || (typeof propAddr === 'string' && propAddr.trim() === '')) emptyPropertyAddress++;
  if (!owner) noOwnerName++;
});

console.log('Of those, missing property address:', noPropertyAddress);
console.log('Of those, empty property address:', emptyPropertyAddress);
console.log('Of those, missing owner:', noOwnerName);

// Check DB requirements
console.log('\n=== Prisma Schema Requirements ===');
console.log('Required fields: accountNumber, ownerName, propertyAddress, totalDue, percentageDue, status');

let missingRequired = 0;
noStatus.forEach(row => {
  const propAddr = row['NEW-Property Site Address'] || row['PSTRNAME'];
  if (!propAddr || propAddr.trim() === '') {
    missingRequired++;
  }
});

console.log('Rows with empty propertyAddress:', missingRequired);
console.log('This matches missing properties:', 33918 - 25413, '=', missingRequired === (33918 - 25413));
