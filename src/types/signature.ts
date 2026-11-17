export type SignatureSlotId = 'organizer' | 'reviewer' | 'approver';

export type SignatureMethod = 'drawn' | 'typed' | 'electronic_stamp';

export interface AuthorizedDigitalSignature {
  slotId: SignatureSlotId;
  signerName: string;
  signerRoleLabel: string;
  signerEmail?: string;
  signerUid?: string;
  method: SignatureMethod;
  signatureImageDataUrl: string;
  verificationCode: string;
  signedAt: string;
}

export type SignatureMap = Partial<Record<SignatureSlotId, AuthorizedDigitalSignature>>;

export type SignatureRoleLabels = Record<SignatureSlotId, string>;

export const DEFAULT_SIGNATURE_ROLE_LABELS: SignatureRoleLabels = {
  organizer: 'منظم التقرير / أمين المخزن',
  reviewer: 'التدقيق الفني / شعبة السيطرة',
  approver: 'مصادقة مسؤول الشعبة / المدير المخول',
};

export function generateSignatureVerificationCode(
  uid = 'ANON',
  slotId: SignatureSlotId = 'organizer'
): string {
  const slotPrefix =
    slotId === 'organizer' ? 'ORG' : slotId === 'reviewer' ? 'REV' : 'APP';
  const uidPart = uid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'USER';
  const timePart = Date.now().toString(36).slice(-4).toUpperCase();
  const randPart = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `SM-${slotPrefix}-${uidPart}-${timePart}${randPart}`;
}

export function renderTypedSignatureDataUrl(
  signerName: string,
  signerRoleLabel: string
): string {
  const canvas = document.createElement('canvas');
  canvas.width = 520;
  canvas.height = 170;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Subtle signature stroke baseline
  ctx.strokeStyle = '#94A3B8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(40, 118);
  ctx.lineTo(480, 118);
  ctx.stroke();

  // Signature display text in deep institutional navy
  ctx.fillStyle = '#0F2544';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'italic 700 34px Cairo, Georgia, serif';
  ctx.fillText(signerName.trim() || 'توقيع معتمد', canvas.width / 2, 68, 440);

  // Role subtitle under line
  ctx.fillStyle = '#475569';
  ctx.font = '600 15px Cairo, Tahoma, sans-serif';
  ctx.fillText(signerRoleLabel.trim(), canvas.width / 2, 142, 440);

  return canvas.toDataURL('image/png');
}

export function renderElectronicStampDataUrl(params: {
  signerName: string;
  signerRoleLabel: string;
  verificationCode: string;
  signedAtIso: string;
}): string {
  const canvas = document.createElement('canvas');
  canvas.width = 520;
  canvas.height = 170;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Clean rectangular institutional seal
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(16, 12, canvas.width - 32, canvas.height - 24);

  ctx.strokeStyle = '#0F2544';
  ctx.lineWidth = 3;
  ctx.strokeRect(16, 12, canvas.width - 32, canvas.height - 24);

  ctx.strokeStyle = '#C59B47';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(22, 18, canvas.width - 44, canvas.height - 36);

  ctx.fillStyle = '#0F2544';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = '700 14px Cairo, Tahoma, sans-serif';
  ctx.fillText('مصادقة إلكترونية معتمدة · مجمع سيد الشهداء (ع)', canvas.width / 2, 42, 450);

  ctx.font = '700 22px Cairo, Tahoma, sans-serif';
  ctx.fillText(params.signerName.trim(), canvas.width / 2, 78, 450);

  ctx.fillStyle = '#334155';
  ctx.font = '600 14px Cairo, Tahoma, sans-serif';
  ctx.fillText(params.signerRoleLabel.trim(), canvas.width / 2, 108, 450);

  const dateLabel = new Date(params.signedAtIso).toLocaleDateString('ar-IQ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  ctx.fillStyle = '#0F2544';
  ctx.font = '600 13px "IBM Plex Mono", monospace';
  ctx.fillText(`${params.verificationCode}  |  ${dateLabel}`, canvas.width / 2, 134, 450);

  return canvas.toDataURL('image/png');
}
