import { describe, it, expect } from 'vitest';
import { extractContacts, extractForewarnContacts } from './contactParser';

const FOREWARN_PASTE = `FOREWARN logo
Recent Searches
Search
Full Name: Lisa Martinez
Zip: 78244
LISA MARIE MARTINEZ
Age 40
4311 LAKEWAY DR
SAN ANTONIO, TX 78244
Phone Records
15 found
Phone numbers are sorted using a proprietary confidence algorithm that considers source, frequency and last seen date.
Phone Number	Type	Last Seen
830-344-0060	Mobile	08/05/2026
210-204-0441	Mobile	06/05/2025
830-344-8400	Mobile	09/07/2023
346-276-0366	Mobile	10/10/2023
346-276-0367	Mobile	10/20/2021
830-344-8303	Mobile	06/01/2022
281-839-4016	Mobile	09/18/2015
210-254-2490	Mobile	08/10/2015
210-248-9115	OtherPhone	04/27/2024
713-649-6869	Residential	07/01/2015
210-635-9509	Residential	01/28/2006
713-391-0930	Mobile	06/23/2025
210-257-0626	OtherPhone	06/15/2022
830-899-5633	Residential	08/01/2026
512-262-0619	OtherPhone	08/01/2026

Download on the App Store
Get it on Google Play
© 2026 FOREWARN, LLC. All rights reserved (Version - 1.8.5)

FOREWARN, LLC ("FOREWARN") is not a "consumer reporting agency" and its services do not constitute "consumer reports", as these terms are defined by the Fair Credit Reporting Act, 15 U.S.C. § 1681 et seq. ("FCRA") or similar state statutes. Accordingly, FOREWARN services may not be used in whole or in part as a factor in establishing an individual's eligibility for credit, insurance, employment, or any other eligibility purpose permitted by the FCRA.`;

describe('extractForewarnContacts', () => {
  it('extracts the matched record name, not the search query or page chrome', () => {
    const result = extractForewarnContacts(FOREWARN_PASTE);
    expect(result.name).toBe('LISA MARIE MARTINEZ');
  });

  it('extracts all 15 phone numbers from the Phone Records table, in order, with no noise', () => {
    const result = extractForewarnContacts(FOREWARN_PASTE);
    expect(result.phones).toEqual([
      '(830) 344-0060',
      '(210) 204-0441',
      '(830) 344-8400',
      '(346) 276-0366',
      '(346) 276-0367',
      '(830) 344-8303',
      '(281) 839-4016',
      '(210) 254-2490',
      '(210) 248-9115',
      '(713) 649-6869',
      '(210) 635-9509',
      '(713) 391-0930',
      '(210) 257-0626',
      '(830) 899-5633',
      '(512) 262-0619',
    ]);
  });

  it('never returns emails (Forewarn is a phone-lookup service)', () => {
    const result = extractForewarnContacts(FOREWARN_PASTE);
    expect(result.emails).toEqual([]);
  });

  it('pairs each phone with its own "Last Seen" date from the same table row', () => {
    const result = extractForewarnContacts(FOREWARN_PASTE);
    expect(result.phoneLastSeen).toEqual({
      '(830) 344-0060': '08/05/2026',
      '(210) 204-0441': '06/05/2025',
      '(830) 344-8400': '09/07/2023',
      '(346) 276-0366': '10/10/2023',
      '(346) 276-0367': '10/20/2021',
      '(830) 344-8303': '06/01/2022',
      '(281) 839-4016': '09/18/2015',
      '(210) 254-2490': '08/10/2015',
      '(210) 248-9115': '04/27/2024',
      '(713) 649-6869': '07/01/2015',
      '(210) 635-9509': '01/28/2006',
      '(713) 391-0930': '06/23/2025',
      '(210) 257-0626': '06/15/2022',
      '(830) 899-5633': '08/01/2026',
      '(512) 262-0619': '08/01/2026',
    });
  });

  it('falls back to the "Full Name:" line when no ALL-CAPS record name is present', () => {
    const result = extractForewarnContacts('Full Name: Lisa Martinez\nZip: 78244\nNo matches found');
    expect(result.name).toBe('Lisa Martinez');
  });
});

describe('extractContacts (regression check alongside the new Forewarn parser)', () => {
  it('still extracts a name and phone from a simple TruePeopleSearch-style paste', () => {
    const result = extractContacts('Lisa Bowlin\nAge 45\n(830) 899-5633\nlisa@example.com');
    expect(result.name).toBe('Lisa Bowlin');
    expect(result.phones).toEqual(['(830) 899-5633']);
    expect(result.emails).toEqual(['lisa@example.com']);
  });
});
