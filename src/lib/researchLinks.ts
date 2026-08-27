/**
 * Outbound research links for a single address.
 *
 * The previous TruePeopleSearch link was wrong twice: it searched by the
 * landlord's name, and it passed the entire street address as `citystatezip`.
 * Landlord names are also stored surname-first ("MARTINEZ, PETRA"), so a name
 * search needed flipping that never happened. Searching by address avoids both.
 */

export type ResearchAddress = { address: string; city?: string; state?: string; zip?: string };

const locality = ({ city, state, zip }: ResearchAddress): string => {
  const cityState = [city, state].filter(Boolean).join(', ');
  return [cityState, zip].filter(Boolean).join(' ').trim();
};

export const truePeopleSearchUrl = (addr: ResearchAddress): string => {
  const params = new URLSearchParams({
    streetaddress: addr.address,
    citystatezip: locality(addr),
  });
  return `https://www.truepeoplesearch.com/resultaddress?${params.toString()}`;
};

export const taxAssessorUrl = (): string =>
  'https://bexar.acttax.com/act_webdev/bexar/index.jsp';

// A hard-coded end date expires: recordings filed after it silently disappear
// from results with no indication anything was filtered. Compute a bound a
// year past today instead, so the range never needs re-pinning.
//
// Read in UTC. Local getters turn a UTC-midnight date into the previous day
// for anyone west of Greenwich, which is a silent off-by-one on the bound.
const yyyymmdd = (date: Date): string =>
  `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;

export const landRecordsUrl = (addr: ResearchAddress, today: Date = new Date()): string => {
  const end = new Date(today);
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  const params = new URLSearchParams({
    department: 'RP',
    recordedDateRange: `18000101,${yyyymmdd(end)}`,
    searchType: 'quickSearch',
    searchValue: addr.address,
  });
  return `https://bexar.tx.publicsearch.us/results?${params.toString()}`;
};
