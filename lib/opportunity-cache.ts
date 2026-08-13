import { unstable_cache } from 'next/cache'
import { getOpportunityDetail, getOpportunityOverview } from './opportunities'

export const getCachedOpportunityOverview = unstable_cache(
  async () => getOpportunityOverview(),
  ['opportunity-overview-v1'],
  { revalidate: 60 },
)

export const getCachedOpportunityDetail = unstable_cache(
  async (themeCode: string) => getOpportunityDetail(themeCode),
  ['opportunity-detail-v1'],
  { revalidate: 60 },
)
