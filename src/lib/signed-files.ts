import type { AppContext } from './supabase';
import { getServiceClient } from './supabase';

export const createResumeSignedUrl = async (c: AppContext, storagePath: string) => {
  const { data, error } = await getServiceClient(c).storage
    .from('resume-pdfs')
    .createSignedUrl(storagePath, 300);
  if (error) throw error;
  return data.signedUrl;
};
