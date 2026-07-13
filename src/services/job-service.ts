import { z } from 'zod';
import type { AppContext } from '../lib/supabase';
import { getServiceClient } from '../lib/supabase';

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(max).optional(),
  );

const searchSchema = z.object({
  q: optionalText(100),
  country: z.enum(['US', 'CA']).optional(),
  stateProvince: optionalText(100),
  city: optionalText(100),
  employmentType: optionalText(50),
  workplaceType: optionalText(50),
  page: z.coerce.number().int().catch(1).transform((value) => Math.max(1, value)),
  pageSize: z.coerce.number().int().catch(20).transform((value) => Math.min(50, Math.max(1, value))),
});

export type JobSearchInput = z.infer<typeof searchSchema>;

export const parseJobSearch = (input: Record<string, unknown>): JobSearchInput =>
  searchSchema.parse(input);

const escapePostgrestPattern = (value: string) => value.replaceAll(/[,%()]/g, ' ');

export const searchPublicJobs = async (c: AppContext, input: JobSearchInput) => {
  const client = getServiceClient(c);
  const from = (input.page - 1) * input.pageSize;
  let query = client
    .from('jobs')
    .select(
      'id,slug,title,city,state_province,country,employment_type,workplace_type,published_at,expires_at',
      { count: 'exact' },
    )
    .eq('status', 'published')
    .gt('expires_at', new Date().toISOString())
    .order('published_at', { ascending: false })
    .range(from, from + input.pageSize - 1);

  if (input.country) query = query.eq('country', input.country);
  if (input.stateProvince) query = query.ilike('state_province', input.stateProvince);
  if (input.city) query = query.ilike('city', input.city);
  if (input.employmentType) query = query.eq('employment_type', input.employmentType);
  if (input.workplaceType) query = query.eq('workplace_type', input.workplaceType);
  if (input.q) {
    const term = escapePostgrestPattern(input.q);
    query = query.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
  }
  return query;
};
