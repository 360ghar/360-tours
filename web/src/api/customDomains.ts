import { apiClient, extractData } from './client';
import type { components } from '@/lib/api/schema.gen';

type Schemas = components['schemas'];

export type CustomDomainVerificationStatus = Schemas['CustomDomainVerificationStatus'];
export type CustomDomainSslStatus = Schemas['CustomDomainSSLStatus'];
export type CustomDomainResponse = Schemas['CustomDomainResponse'];
export type CustomDomainVerificationResponse = Schemas['CustomDomainVerification'];

export const customDomainsApi = {
  /** The caller's domains, newest first (first page: an account holds few). */
  async listDomains(): Promise<CustomDomainResponse[]> {
    const response = await apiClient.get<{ items: CustomDomainResponse[] }>('/custom-domains', {
      params: { limit: 100 },
    });
    return extractData(response).items;
  },

  async createDomain(domain: string): Promise<CustomDomainResponse> {
    const response = await apiClient.post<CustomDomainResponse>('/custom-domains', { domain });
    return extractData(response);
  },

  /** Sets `ssl_status` to `pending` and returns the DNS record to publish. */
  async verifyDomain(domainId: string): Promise<CustomDomainVerificationResponse> {
    const response = await apiClient.post<CustomDomainVerificationResponse>(
      `/custom-domains/${domainId}/verify`
    );
    return extractData(response);
  },

  async deleteDomain(domainId: string): Promise<void> {
    await apiClient.delete(`/custom-domains/${domainId}`);
  },
};
