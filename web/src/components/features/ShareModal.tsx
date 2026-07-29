import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Copy,
  Check,
  Download,
  ExternalLink,
  Code2,
  QrCode,
  Facebook,
  Twitter,
  Linkedin,
  Mail,
  MessageCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
  Input,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Textarea,
  Label,
} from '@/components/ui';
import {
  generateShareUrl,
  generateIframeCode,
  generateSocialShareLinks,
  copyToClipboard,
  type EmbedOptions,
} from '@/utils/embedCode';
import { generateQRCodeDataURL, downloadQRCodePNG, downloadQRCodeSVG } from '@/utils/qrCode';
import { useToast } from '@/hooks/useToast';

interface ShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tourId: string;
  tourTitle: string;
  tourDescription?: string;
  onTrackShare?: (platform: string) => void;
}

export function ShareModal({
  open,
  onOpenChange,
  tourId,
  tourTitle,
  tourDescription,
  onTrackShare,
}: ShareModalProps) {
  const { toast } = useToast();
  const copiedLinkTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const copiedEmbedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [qrCode, setQrCode] = useState<{ shareUrl: string; dataUrl: string } | null>(null);
  const [qrError, setQrError] = useState<{ shareUrl: string; message: string } | null>(null);
  const [embedOptions, setEmbedOptions] = useState<EmbedOptions>({
    width: '100%',
    height: 500,
    autoplay: true,
    showNavbar: true,
    enableFullscreen: true,
    enableVR: true,
    branding: true,
  });

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      clearTimeout(copiedLinkTimerRef.current);
      clearTimeout(copiedEmbedTimerRef.current);
    };
  }, []);

  const shareUrl = generateShareUrl(tourId);
  const embedCode = generateIframeCode(tourId, embedOptions);
  const socialLinks = generateSocialShareLinks(tourId, tourTitle, tourDescription);
  const activeQrCodeDataUrl = qrCode?.shareUrl === shareUrl ? qrCode.dataUrl : null;
  const activeQrError = qrError?.shareUrl === shareUrl ? qrError.message : null;

  const generateQrCode = useCallback(() => {
    setQrError(null);
    setQrCode(null);
    generateQRCodeDataURL(shareUrl, { width: 200 })
      .then(dataUrl => setQrCode({ shareUrl, dataUrl }))
      .catch(() => {
        setQrError({
          shareUrl,
          message: 'QR code could not be generated. Try again or copy the link instead.',
        });
      });
  }, [shareUrl]);

  // Generate QR code when modal opens
  useEffect(() => {
    if (!open || qrCode?.shareUrl === shareUrl) {
      return;
    }

    let cancelled = false;
    generateQRCodeDataURL(shareUrl, { width: 200 })
      .then(dataUrl => {
        if (!cancelled) {
          setQrCode({ shareUrl, dataUrl });
          setQrError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrError({
            shareUrl,
            message: 'QR code could not be generated. Try again or copy the link instead.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, qrCode?.shareUrl, shareUrl]);

  const handleCopyLink = useCallback(async () => {
    const success = await copyToClipboard(shareUrl);
    if (success) {
      onTrackShare?.('copy_link');
      setCopiedLink(true);
      toast('success', 'Tour link copied to clipboard.', { title: 'Link copied' });
      clearTimeout(copiedLinkTimerRef.current);
      copiedLinkTimerRef.current = setTimeout(() => setCopiedLink(false), 2000);
    } else {
      toast('error', 'Copy failed. Select the link and copy it manually.', {
        title: 'Could not copy link',
      });
    }
  }, [onTrackShare, shareUrl, toast]);

  const handleCopyEmbed = useCallback(async () => {
    const success = await copyToClipboard(embedCode);
    if (success) {
      onTrackShare?.('other');
      setCopiedEmbed(true);
      toast('success', 'Embed code copied to clipboard.', { title: 'Embed code copied' });
      clearTimeout(copiedEmbedTimerRef.current);
      copiedEmbedTimerRef.current = setTimeout(() => setCopiedEmbed(false), 2000);
    } else {
      toast('error', 'Copy failed. Select the embed code and copy it manually.', {
        title: 'Could not copy embed code',
      });
    }
  }, [embedCode, onTrackShare, toast]);

  const handleDownloadQR = useCallback(
    async (format: 'png' | 'svg') => {
      try {
        const filename = `${tourTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-qr`;
        if (format === 'png') {
          await downloadQRCodePNG(shareUrl, `${filename}.png`, { width: 512 });
        } else {
          await downloadQRCodeSVG(shareUrl, `${filename}.svg`, { width: 512 });
        }
        toast('success', `QR code saved as ${format.toUpperCase()}.`, {
          title: 'QR code downloaded',
        });
      } catch {
        toast('error', 'Failed to download QR code.', { title: 'Download failed' });
      }
    },
    [shareUrl, tourTitle, toast]
  );

  const handleSocialShare = (platform: keyof typeof socialLinks) => {
    onTrackShare?.(platform === 'email' ? 'other' : platform);
    const popup = window.open(
      socialLinks[platform],
      '_blank',
      'width=600,height=400,noopener,noreferrer'
    );
    // Some browsers ignore the feature flags above, so clear the opener as a
    // defence in depth against a shared site navigating the creator's tab.
    if (popup) popup.opener = null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share Tour</DialogTitle>
          <DialogDescription>
            Share "{tourTitle}" with others via link, QR code, or embed it on your website.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="link" className="mt-4">
          <TabsList className="w-full">
            <TabsTrigger value="link" className="flex-1 gap-1.5">
              <ExternalLink className="h-4 w-4" />
              Link
            </TabsTrigger>
            <TabsTrigger value="qr" className="flex-1 gap-1.5">
              <QrCode className="h-4 w-4" />
              QR Code
            </TabsTrigger>
            <TabsTrigger value="embed" className="flex-1 gap-1.5">
              <Code2 className="h-4 w-4" />
              Embed
            </TabsTrigger>
          </TabsList>

          {/* Link Tab */}
          <TabsContent value="link" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="share-tour-link">Share Link</Label>
              <div className="flex gap-2">
                <Input
                  id="share-tour-link"
                  readOnly
                  value={shareUrl}
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyLink}
                  aria-label={copiedLink ? 'Tour link copied' : 'Copy tour link'}
                >
                  {copiedLink ? (
                    <Check className="h-4 w-4 text-[var(--color-success-500)]" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Social Sharing Buttons */}
            <div className="space-y-2">
              <Label>Share on Social Media</Label>
              <div className="grid grid-cols-5 gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-12 w-full hover:bg-[#1877f2] hover:text-white hover:border-[#1877f2]"
                  onClick={() => handleSocialShare('facebook')}
                  aria-label="Share on Facebook"
                >
                  <Facebook className="h-5 w-5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-12 w-full hover:bg-[#1da1f2] hover:text-white hover:border-[#1da1f2]"
                  onClick={() => handleSocialShare('twitter')}
                  aria-label="Share on X"
                >
                  <Twitter className="h-5 w-5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-12 w-full hover:bg-[#0a66c2] hover:text-white hover:border-[#0a66c2]"
                  onClick={() => handleSocialShare('linkedin')}
                  aria-label="Share on LinkedIn"
                >
                  <Linkedin className="h-5 w-5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-12 w-full hover:bg-[#25d366] hover:text-white hover:border-[#25d366]"
                  onClick={() => handleSocialShare('whatsapp')}
                  aria-label="Share on WhatsApp"
                >
                  <MessageCircle className="h-5 w-5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-12 w-full hover:bg-[var(--color-primary-500)] hover:text-white hover:border-[var(--color-primary-500)]"
                  onClick={() => handleSocialShare('email')}
                  aria-label="Share via Email"
                >
                  <Mail className="h-5 w-5" />
                </Button>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] text-center">
                Facebook • Twitter • LinkedIn • WhatsApp • Email
              </p>
            </div>
          </TabsContent>

          {/* QR Code Tab */}
          <TabsContent value="qr" className="space-y-4 mt-4">
            <div className="flex flex-col items-center">
              <div className="bg-white p-4 rounded-lg shadow-sm border border-[var(--color-border)]">
                {activeQrCodeDataUrl ? (
                  <img
                    src={activeQrCodeDataUrl}
                    alt={`QR code for ${tourTitle}`}
                    className="w-48 h-48"
                  />
                ) : activeQrError ? (
                  <div className="flex h-48 w-48 flex-col items-center justify-center gap-3 bg-[var(--color-surface)] p-4 text-center">
                    <p className="text-sm text-[var(--color-error-500)]">{activeQrError}</p>
                    <Button variant="outline" size="sm" onClick={generateQrCode}>
                      Try again
                    </Button>
                  </div>
                ) : (
                  <div
                    className="w-48 h-48 flex items-center justify-center bg-[var(--color-surface)]"
                    role="status"
                    aria-label="Generating QR code"
                  >
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-primary-500)] border-t-transparent" />
                  </div>
                )}
              </div>
              <p className="mt-4 text-sm text-[var(--color-text-muted)] text-center">
                Scan this QR code to open the tour on any device
              </p>
            </div>

            <div className="flex gap-2 justify-center">
              <Button
                variant="outline"
                onClick={() => handleDownloadQR('png')}
                disabled={!activeQrCodeDataUrl}
              >
                <Download className="h-4 w-4" />
                Download PNG
              </Button>
              <Button
                variant="outline"
                onClick={() => handleDownloadQR('svg')}
                disabled={!activeQrCodeDataUrl}
              >
                <Download className="h-4 w-4" />
                Download SVG
              </Button>
            </div>
          </TabsContent>

          {/* Embed Tab */}
          <TabsContent value="embed" className="space-y-4 mt-4">
            {/* Embed Options */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="embed-width">Width</Label>
                <Input
                  id="embed-width"
                  value={embedOptions.width}
                  onChange={e =>
                    setEmbedOptions(prev => ({
                      ...prev,
                      width: e.target.value,
                    }))
                  }
                  placeholder="100% or 800px"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="embed-height">Height</Label>
                <Input
                  id="embed-height"
                  type="number"
                  min={100}
                  value={typeof embedOptions.height === 'number' ? embedOptions.height : 500}
                  onChange={e =>
                    setEmbedOptions(prev => ({
                      ...prev,
                      height: Math.max(100, parseInt(e.target.value) || 500),
                    }))
                  }
                />
              </div>
            </div>

            {/* Embed Code */}
            <div className="space-y-2">
              <Label htmlFor="share-embed-code">Embed Code</Label>
              <div className="relative">
                <Textarea
                  id="share-embed-code"
                  readOnly
                  value={embedCode}
                  className="font-mono text-xs min-h-[120px] resize-none pr-20"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  className="absolute right-2 top-2"
                  onClick={handleCopyEmbed}
                  aria-label={copiedEmbed ? 'Embed code copied' : 'Copy embed code'}
                >
                  {copiedEmbed ? (
                    <>
                      <Check className="h-3 w-3" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">
                Paste this code into your website's HTML to embed the tour.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
