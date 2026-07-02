import { apiClient, extractData } from './client';

export type CustomDomainVerificationStatus = 'pending' | 'verifying' | 'verified' | 'failed';
export type CustomDomainSslStatus = 'pending' | 'provisioning' | 'active' | 'failed';

export interface CustomDomainResponse {
  id: string;
  user_id: number;
  domain: string;
  verification_status: CustomDomainVerificationStatus;
  ssl_status: CustomDomainSslStatus;
  verification_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomDomainVerificationResponse {
  domain: string;
  is_verified: boolean;
  verification_instructions?: string | null;
  txt_record_name: string;
  txt_record_value: string;
}

export const customDomainsApi = {
  async createDomain(domain: string): Promise<CustomDomainResponse> {
    const response = await apiClient.post<CustomDomainResponse>('/custom-domains', { domain });
    return extractData(response);
  },

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
