import { useEffect, useState } from 'react';
import {
  Globe,
  Check,
  AlertCircle,
  Copy,
  RefreshCw,
  ExternalLink,
  Shield,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  Label,
  Badge,
  Alert,
  AlertDescription,
} from '@/components/ui';
import { copyToClipboard } from '@/utils/copyToClipboard';
import { useToast } from '@/hooks/useToast';
import { confirm } from '@/stores';
import {
  customDomainsApi,
  type CustomDomainResponse,
  type CustomDomainSslStatus,
  type CustomDomainVerificationResponse,
  type CustomDomainVerificationStatus,
} from '@/api/customDomains';

interface CustomDomainSetupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentDomainId?: string;
  currentDomain?: string;
  verificationStatus?: CustomDomainVerificationStatus;
  sslStatus?: CustomDomainSslStatus;
  verificationToken?: string | null;
  verificationTxtRecordName?: string | null;
  verificationTxtRecordValue?: string | null;
  onAddDomain?: (domain: string) => Promise<CustomDomainResponse | void>;
  onVerifyDomain?: () => Promise<CustomDomainVerificationResponse | void>;
  onRemoveDomain?: () => Promise<void>;
  isLoading?: boolean;
}

// DNS record info for verification
const DNS_RECORDS = {
  cname: {
    type: 'CNAME',
    name: 'tours',
    value: 'custom.360viewer.app',
  },
  verification: {
    type: 'TXT',
    name: 'Server-issued TXT host',
    value: 'Server-issued TXT value',
  },
};

function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}

function isValidDomain(value: string): boolean {
  const labels = value.split('.');
  if (labels.length < 2) return false;

  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,63}$/.test(tld)) return false;

  return labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}

export function CustomDomainSetup({
  open,
  onOpenChange,
  currentDomainId,
  currentDomain,
  verificationStatus = 'pending',
  sslStatus = 'pending',
  verificationToken,
  verificationTxtRecordName,
  verificationTxtRecordValue,
  onAddDomain,
  onVerifyDomain,
  onRemoveDomain,
  isLoading = false,
}: CustomDomainSetupProps) {
  const { toast } = useToast();
  const [domain, setDomain] = useState(currentDomain || '');
  const [localDomain, setLocalDomain] = useState(currentDomain || '');
  const [localDomainId, setLocalDomainId] = useState(currentDomainId || '');
  const [localTxtRecordName, setLocalTxtRecordName] = useState(verificationTxtRecordName || '');
  const [localTxtRecordValue, setLocalTxtRecordValue] = useState(
    verificationTxtRecordValue || verificationToken || ''
  );
  const [localVerificationStatus, setLocalVerificationStatus] =
    useState<CustomDomainVerificationStatus | null>(null);
  const [localSslStatus, setLocalSslStatus] = useState<CustomDomainSslStatus | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isBusy = isLoading || isAdding || isVerifying || isRemoving;
  const normalizedDomain = normalizeDomain(domain);
  const activeDomain = currentDomain || localDomain;
  const activeDomainId = currentDomainId || localDomainId;
  const txtRecordName = verificationTxtRecordName || localTxtRecordName;
  const txtRecordValue = verificationTxtRecordValue || verificationToken || localTxtRecordValue;
  const displayVerificationStatus = localVerificationStatus || verificationStatus;
  const displaySslStatus = localSslStatus || sslStatus;
  const hasVerificationChallenge = Boolean(txtRecordName && txtRecordValue);
  const canCheckVerification = Boolean(onVerifyDomain || activeDomainId);
  const canRemoveDomain = Boolean(onRemoveDomain || activeDomainId);

  useEffect(() => {
    if (!open) return;
    setDomain(currentDomain || '');
    setLocalDomain(currentDomain || '');
    setLocalDomainId(currentDomainId || '');
    setLocalTxtRecordName(verificationTxtRecordName || '');
    setLocalTxtRecordValue(verificationTxtRecordValue || verificationToken || '');
    setLocalVerificationStatus(null);
    setLocalSslStatus(null);
    setError(null);
  }, [
    currentDomain,
    currentDomainId,
    open,
    verificationToken,
    verificationTxtRecordName,
    verificationTxtRecordValue,
  ]);

  const applyDomainResponse = (response: CustomDomainResponse | void, fallbackDomain: string) => {
    const nextDomain = response?.domain || fallbackDomain;
    setDomain(nextDomain);
    setLocalDomain(nextDomain);
    setLocalDomainId(response?.id || '');
    setLocalTxtRecordName('');
    setLocalTxtRecordValue(response?.verification_token || '');
    setLocalVerificationStatus(response?.verification_status || 'pending');
    setLocalSslStatus(response?.ssl_status || 'pending');
  };

  const applyVerificationResponse = (response: CustomDomainVerificationResponse | void) => {
    if (!response) return;

    setDomain(response.domain);
    setLocalDomain(response.domain);
    setLocalTxtRecordName(response.txt_record_name);
    setLocalTxtRecordValue(response.txt_record_value);
    setLocalVerificationStatus(response.is_verified ? 'verified' : 'pending');
    if (response.is_verified) {
      setLocalSslStatus('provisioning');
    }
  };

  const loadServerVerificationChallenge = async (domainId: string) => {
    const verification = await customDomainsApi.verifyDomain(domainId);
    applyVerificationResponse(verification);
  };

  const handleAddDomain = async () => {
    if (!normalizedDomain) return;

    if (!isValidDomain(normalizedDomain)) {
      setError('Please enter a valid domain name (e.g., tours.yourcompany.com)');
      return;
    }

    setDomain(normalizedDomain);
    setIsAdding(true);
    setError(null);

    try {
      const createdDomain = onAddDomain
        ? await onAddDomain(normalizedDomain)
        : await customDomainsApi.createDomain(normalizedDomain);
      applyDomainResponse(createdDomain, normalizedDomain);

      if (createdDomain?.id) {
        try {
          await loadServerVerificationChallenge(createdDomain.id);
        } catch {
          setLocalTxtRecordName('');
          setLocalTxtRecordValue('');
          setError('Domain added, but the server verification challenge is not available yet.');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add domain');
    } finally {
      setIsAdding(false);
    }
  };

  const handleVerify = async () => {
    if (!onVerifyDomain && !activeDomainId) {
      setError('Verification requires the custom domain id returned by the server.');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const verification = onVerifyDomain
        ? await onVerifyDomain()
        : await customDomainsApi.verifyDomain(activeDomainId);
      applyVerificationResponse(verification);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleRemove = async () => {
    const shouldRemove = await confirm({
      title: 'Remove custom domain',
      message: `Remove ${activeDomain || domain} from this account? Tours will return to the default domain.`,
      confirmLabel: 'Remove domain',
      cancelLabel: 'Keep domain',
      destructive: true,
    });
    if (!shouldRemove) return;

    setIsRemoving(true);
    setError(null);

    try {
      if (onRemoveDomain) {
        await onRemoveDomain();
      } else if (activeDomainId) {
        await customDomainsApi.deleteDomain(activeDomainId);
      } else {
        throw new Error('Cannot remove domain until the server returns a domain id.');
      }
      setDomain('');
      setLocalDomain('');
      setLocalDomainId('');
      setLocalTxtRecordName('');
      setLocalTxtRecordValue('');
      setLocalVerificationStatus(null);
      setLocalSslStatus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove domain');
    } finally {
      setIsRemoving(false);
    }
  };

  const handleCopy = async (label: string, value: string) => {
    const copied = await copyToClipboard(value);
    if (copied) {
      toast('success', `${label} copied to clipboard.`, { title: 'Copied' });
    } else {
      toast('error', `Select and copy the ${label.toLowerCase()} manually.`, {
        title: 'Copy failed',
      });
    }
  };

  const getVerificationStatusBadge = () => {
    switch (displayVerificationStatus) {
      case 'verified':
        return (
          <Badge variant="success">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Verified
          </Badge>
        );
      case 'verifying':
        return (
          <Badge variant="warning">
            <Clock className="h-3 w-3 mr-1 animate-spin" />
            Verifying
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  const getSSLStatusBadge = () => {
    switch (displaySslStatus) {
      case 'active':
        return (
          <Badge variant="success">
            <Shield className="h-3 w-3 mr-1" />
            SSL Active
          </Badge>
        );
      case 'provisioning':
        return (
          <Badge variant="warning">
            <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
            Provisioning SSL
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            SSL Failed
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3 mr-1" />
            Awaiting Verification
          </Badge>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Custom Domain Setup
          </DialogTitle>
          <DialogDescription>
            Connect your own domain to serve tours from your branded URL.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Domain input */}
          {!activeDomain ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="domain">Your Domain</Label>
                <div className="flex gap-2">
                  <Input
                    id="domain"
                    value={domain}
                    onChange={e => {
                      setDomain(e.target.value.toLowerCase());
                      setError(null);
                    }}
                    placeholder="tours.yourcompany.com"
                    className="flex-1"
                    disabled={isBusy}
                    required
                    aria-invalid={!!error}
                    aria-describedby="domain-help"
                  />
                  <Button
                    onClick={handleAddDomain}
                    isLoading={isAdding || isLoading}
                    disabled={isBusy || !domain.trim()}
                  >
                    Add Domain
                  </Button>
                </div>
                <p id="domain-help" className="text-xs text-[var(--color-text-muted)]">
                  We recommend using a subdomain like "tours" or "virtual-tours"
                </p>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Benefits */}
              <div className="rounded-lg bg-[var(--color-surface-elevated)] p-4">
                <h4 className="font-medium mb-3">Benefits of Custom Domain</h4>
                <ul className="space-y-2 text-sm text-[var(--color-text-muted)]">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[var(--color-success-500)]" />
                    Brand recognition with your own URL
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[var(--color-success-500)]" />
                    Free SSL certificate included
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[var(--color-success-500)]" />
                    Professional appearance for clients
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[var(--color-success-500)]" />
                    SEO benefits for your domain
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            <>
              {/* Domain status */}
              <div className="rounded-lg border border-[var(--color-border)] p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="font-medium">{activeDomain}</p>
                    <a
                      href={`https://${activeDomain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[var(--color-primary-500)] hover:underline flex items-center gap-1"
                    >
                      Visit site <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    {getVerificationStatusBadge()}
                    {getSSLStatusBadge()}
                  </div>
                </div>

                {displayVerificationStatus !== 'verified' && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleVerify}
                      isLoading={isVerifying || isLoading}
                      disabled={isBusy || !canCheckVerification}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Check Verification
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRemove}
                      isLoading={isRemoving || isLoading}
                      disabled={isBusy || !canRemoveDomain}
                      className="text-[var(--color-error-500)]"
                    >
                      Remove Domain
                    </Button>
                  </div>
                )}

                {displayVerificationStatus === 'verified' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRemove}
                    isLoading={isRemoving || isLoading}
                    disabled={isBusy || !canRemoveDomain}
                    className="text-[var(--color-error-500)]"
                  >
                    Remove Domain
                  </Button>
                )}

                {displayVerificationStatus === 'failed' && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      We could not find the required DNS records. Confirm both records below, then
                      check verification again.
                    </AlertDescription>
                  </Alert>
                )}

                {displaySslStatus === 'failed' && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      SSL provisioning failed. Keep the DNS records in place and check verification
                      again, or remove the domain and reconnect it.
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              {/* DNS Configuration Instructions */}
              {displayVerificationStatus !== 'verified' && (
                <div className="space-y-4">
                  <h4 className="font-medium">DNS Configuration Required</h4>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    Add the following DNS records to your domain registrar to verify ownership and
                    point your domain to our servers.
                  </p>

                  {!hasVerificationChallenge && (
                    <Alert variant="warning">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Server-issued TXT challenge is not available yet. Use Check Verification to
                        refresh the server state; TXT copying stays disabled until the backend
                        returns a TXT host and value.
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* CNAME Record */}
                  <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
                    <div className="bg-[var(--color-surface-elevated)] px-4 py-2 border-b border-[var(--color-border)]">
                      <span className="font-medium text-sm">1. CNAME Record</span>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <Label className="text-xs text-[var(--color-text-muted)]">Type</Label>
                          <p className="font-mono">{DNS_RECORDS.cname.type}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-[var(--color-text-muted)]">
                            Name/Host
                          </Label>
                          <p className="font-mono">{activeDomain.split('.')[0]}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-[var(--color-text-muted)]">Value</Label>
                          <div className="flex items-center gap-2">
                            <p className="font-mono text-sm truncate">{DNS_RECORDS.cname.value}</p>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() =>
                                void handleCopy('CNAME value', DNS_RECORDS.cname.value)
                              }
                              aria-label="Copy CNAME value"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* TXT Record */}
                  <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
                    <div className="bg-[var(--color-surface-elevated)] px-4 py-2 border-b border-[var(--color-border)]">
                      <span className="font-medium text-sm">2. TXT Record (Verification)</span>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <Label className="text-xs text-[var(--color-text-muted)]">Type</Label>
                          <p className="font-mono">{DNS_RECORDS.verification.type}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-[var(--color-text-muted)]">
                            Name/Host
                          </Label>
                          <p className="font-mono">
                            {txtRecordName || DNS_RECORDS.verification.name}
                          </p>
                        </div>
                        <div>
                          <Label className="text-xs text-[var(--color-text-muted)]">Value</Label>
                          <div className="flex items-center gap-2">
                            <p className="font-mono text-sm truncate">
                              {txtRecordValue || DNS_RECORDS.verification.value}
                            </p>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => void handleCopy('TXT value', txtRecordValue)}
                              disabled={!hasVerificationChallenge}
                              aria-label="Copy TXT verification value"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Alert>
                    <Clock className="h-4 w-4" />
                    <AlertDescription>
                      {hasVerificationChallenge
                        ? "DNS changes can take up to 48 hours to propagate. We'll automatically check for verification periodically."
                        : 'Use Check Verification to refresh the server-issued TXT challenge, then add it to DNS before checking again.'}
                    </AlertDescription>
                  </Alert>
                </div>
              )}

              {/* Verified success message */}
              {displayVerificationStatus === 'verified' && displaySslStatus === 'active' && (
                <Alert variant="success">
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    Your custom domain is fully configured and active. All your tours are now
                    accessible at{' '}
                    <a
                      href={`https://${activeDomain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium underline"
                    >
                      {activeDomain}
                    </a>
                  </AlertDescription>
                </Alert>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
