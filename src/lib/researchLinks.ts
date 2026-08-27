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

export const landRecordsUrl = (addr: ResearchAddress): string => {
  const params = new URLSearchParams({
    department: 'RP',
    recordedDateRange: '18000101,20261231',
    searchType: 'quickSearch',
    searchValue: addr.address,
  });
  return `https://bexar.tx.publicsearch.us/results?${params.toString()}`;
};
