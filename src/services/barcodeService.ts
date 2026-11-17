import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from 'firebase/firestore';
import JsBarcode from 'jsbarcode';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreError';
import { ConsumableRecord } from './consumablesService';
import { DeviceRecord } from './devicesService';

export type LabelSizePreset = 'thermal_50x30' | 'thermal_70x40' | 'a4_sheet';
export type LabelLayoutMode = 'combined' | 'qr_focus';
export type QrErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';
export type QrPayloadFormat = 'INSTITUTIONAL_ID' | 'RAW_DB_ID' | 'JSON_METADATA';

export interface StickerRenderOptions {
  layoutMode?: LabelLayoutMode;
  qrErrorCorrection?: QrErrorCorrectionLevel;
  qrValueOverride?: string;
}

export interface AssetLabelData {
  kind: 'DEVICE' | 'CONSUMABLE';
  id: string;
  code: string;
  barcodeValue: string;
  qrValue: string;
  title: string;
  subtitle: string;
  location?: string;
}

export type BarcodeLookupResult =
  | {
      kind: 'DEVICE';
      device: DeviceRecord;
      categoryName: string;
      departmentName: string;
      unitName: string;
    }
  | {
      kind: 'CONSUMABLE';
      item: ConsumableRecord;
      categoryName: string;
    };

export function sanitizeBarcodeIndexKey(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_').slice(0, 64);
}

export function buildDeviceLabelData(
  device: DeviceRecord,
  categoryName: string
): AssetLabelData {
  return {
    kind: 'DEVICE',
    id: device.id,
    code: device.inventoryNumber,
    barcodeValue: device.barcode || device.inventoryNumber,
    qrValue: device.qrCodeValue || `SAYEDMART:DEV:${device.id}`,
    title: device.name,
    subtitle: categoryName || 'جهاز تقني',
    location: device.currentLocation || 'المخزن الرئيسي',
  };
}

export function buildConsumableLabelData(
  item: ConsumableRecord,
  categoryName: string
): AssetLabelData {
  return {
    kind: 'CONSUMABLE',
    id: item.id,
    code: item.itemCode,
    barcodeValue: item.barcode || item.itemCode,
    qrValue: `SAYEDMART:CON:${item.id}`,
    title: item.name,
    subtitle: `${categoryName || 'مادة كمية'} (${item.unitOfMeasure})`,
    location: item.storageLocation || 'المخزن الرئيسي',
  };
}

export function formatAssetQrPayload(
  label: Pick<AssetLabelData, 'kind' | 'id' | 'code'>,
  format: QrPayloadFormat = 'INSTITUTIONAL_ID'
): string {
  switch (format) {
    case 'RAW_DB_ID':
      return label.id;
    case 'JSON_METADATA':
      return JSON.stringify({
        sys: 'SAYEDMART',
        kind: label.kind === 'DEVICE' ? 'DEV' : 'CON',
        id: label.id,
        code: label.code,
      });
    case 'INSTITUTIONAL_ID':
    default:
      return `SAYEDMART:${label.kind === 'DEVICE' ? 'DEV' : 'CON'}:${label.id}`;
  }
}

export async function checkBarcodeAvailability(rawCode: string): Promise<{
  available: boolean;
  sanitizedKey: string;
  existingTargetType?: string;
  existingTargetId?: string;
}> {
  const sanitizedKey = sanitizeBarcodeIndexKey(rawCode);
  if (!sanitizedKey) {
    return { available: false, sanitizedKey: '' };
  }
  const path = `barcodeIndex/${sanitizedKey}`;
  try {
    const snap = await getDoc(doc(db, 'barcodeIndex', sanitizedKey));
    if (!snap.exists()) {
      return { available: true, sanitizedKey };
    }
    const data = snap.data() as { targetType?: string; targetId?: string };
    return {
      available: false,
      sanitizedKey,
      existingTargetType: data.targetType,
      existingTargetId: data.targetId,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
    return { available: false, sanitizedKey };
  }
}

async function resolveDeviceContext(device: DeviceRecord): Promise<{
  categoryName: string;
  departmentName: string;
  unitName: string;
}> {
  let categoryName = 'غير مصنف';
  let departmentName = 'المخزن الرئيسي';
  let unitName = '—';

  if (device.categoryId) {
    try {
      const cSnap = await getDoc(doc(db, 'categories', device.categoryId));
      if (cSnap.exists()) {
        categoryName = (cSnap.data() as { name?: string }).name || categoryName;
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `categories/${device.categoryId}`);
    }
  }

  if (device.departmentId) {
    try {
      const dSnap = await getDoc(doc(db, 'departments', device.departmentId));
      if (dSnap.exists()) {
        departmentName = (dSnap.data() as { name?: string }).name || departmentName;
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `departments/${device.departmentId}`);
    }
  }

  if (device.unitId) {
    try {
      const uSnap = await getDoc(doc(db, 'units', device.unitId));
      if (uSnap.exists()) {
        unitName = (uSnap.data() as { name?: string }).name || unitName;
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `units/${device.unitId}`);
    }
  }

  return { categoryName, departmentName, unitName };
}

async function resolveConsumableContext(item: ConsumableRecord): Promise<{
  categoryName: string;
  currentQuantity: number;
}> {
  let categoryName = 'غير مصنف';
  let currentQuantity = item.currentQuantity ?? 0;

  if (item.categoryId) {
    try {
      const cSnap = await getDoc(doc(db, 'categories', item.categoryId));
      if (cSnap.exists()) {
        categoryName = (cSnap.data() as { name?: string }).name || categoryName;
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `categories/${item.categoryId}`);
    }
  }

  try {
    const bSnap = await getDoc(doc(db, 'stockBalances', item.id));
    if (bSnap.exists()) {
      currentQuantity = Number((bSnap.data() as { currentQuantity?: number }).currentQuantity || 0);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `stockBalances/${item.id}`);
  }

  return { categoryName, currentQuantity };
}

export async function resolveAssetByScannedCode(
  rawInput: string
): Promise<BarcodeLookupResult | null> {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  // 1. Direct QR Payload: JSON metadata, SAYEDMART:DEV:<id>, or SAYEDMART:CON:<id>
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as {
        id?: string;
        kind?: string;
        code?: string;
      };
      const parsedId = typeof parsed.id === 'string' ? parsed.id.trim() : '';
      if (parsedId && /^[a-zA-Z0-9_-]{1,128}$/.test(parsedId)) {
        if (parsed.kind !== 'CON' && parsed.kind !== 'CONSUMABLE') {
          try {
            const dSnap = await getDoc(doc(db, 'devices', parsedId));
            if (dSnap.exists()) {
              const device = { id: dSnap.id, ...(dSnap.data() as Omit<DeviceRecord, 'id'>) };
              const ctx = await resolveDeviceContext(device);
              return { kind: 'DEVICE', device, ...ctx };
            }
          } catch (err) {
            handleFirestoreError(err, OperationType.GET, `devices/${parsedId}`);
          }
        }
        try {
          const iSnap = await getDoc(doc(db, 'items', parsedId));
          if (iSnap.exists()) {
            const base = { id: iSnap.id, ...(iSnap.data() as Omit<ConsumableRecord, 'id'>) };
            const ctx = await resolveConsumableContext(base);
            return {
              kind: 'CONSUMABLE',
              item: { ...base, currentQuantity: ctx.currentQuantity },
              categoryName: ctx.categoryName,
            };
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, `items/${parsedId}`);
        }
      }
    } catch {
      // Not valid JSON, continue standard lookup
    }
  }

  if (trimmed.startsWith('SAYEDMART:DEV:')) {
    const devId = trimmed.replace('SAYEDMART:DEV:', '').trim();
    if (devId && /^[a-zA-Z0-9_-]{1,128}$/.test(devId)) {
      try {
        const dSnap = await getDoc(doc(db, 'devices', devId));
        if (dSnap.exists()) {
          const device = { id: dSnap.id, ...(dSnap.data() as Omit<DeviceRecord, 'id'>) };
          const ctx = await resolveDeviceContext(device);
          return { kind: 'DEVICE', device, ...ctx };
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `devices/${devId}`);
      }
    }
  }

  if (trimmed.startsWith('SAYEDMART:CON:')) {
    const itemId = trimmed.replace('SAYEDMART:CON:', '').trim();
    if (itemId && /^[a-zA-Z0-9_-]{1,128}$/.test(itemId)) {
      try {
        const iSnap = await getDoc(doc(db, 'items', itemId));
        if (iSnap.exists()) {
          const base = { id: iSnap.id, ...(iSnap.data() as Omit<ConsumableRecord, 'id'>) };
          const ctx = await resolveConsumableContext(base);
          return {
            kind: 'CONSUMABLE',
            item: { ...base, currentQuantity: ctx.currentQuantity },
            categoryName: ctx.categoryName,
          };
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `items/${itemId}`);
      }
    }
  }

  // 2. Lookup via barcodeIndex
  const indexKey = sanitizeBarcodeIndexKey(trimmed);
  if (indexKey) {
    try {
      const idxSnap = await getDoc(doc(db, 'barcodeIndex', indexKey));
      if (idxSnap.exists()) {
        const { targetType, targetId } = idxSnap.data() as {
          targetType?: string;
          targetId?: string;
        };
        if (targetType === 'DEVICE' && targetId) {
          const dSnap = await getDoc(doc(db, 'devices', targetId));
          if (dSnap.exists()) {
            const device = { id: dSnap.id, ...(dSnap.data() as Omit<DeviceRecord, 'id'>) };
            const ctx = await resolveDeviceContext(device);
            return { kind: 'DEVICE', device, ...ctx };
          }
        }
        if (targetType === 'CONSUMABLE' && targetId) {
          const iSnap = await getDoc(doc(db, 'items', targetId));
          if (iSnap.exists()) {
            const base = { id: iSnap.id, ...(iSnap.data() as Omit<ConsumableRecord, 'id'>) };
            const ctx = await resolveConsumableContext(base);
            return {
              kind: 'CONSUMABLE',
              item: { ...base, currentQuantity: ctx.currentQuantity },
              categoryName: ctx.categoryName,
            };
          }
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `barcodeIndex/${indexKey}`);
    }
  }

  // 3. Fallback single-field equality queries (Inventory #, Barcode, Serial #, ItemCode)
  const normalizedUpper = trimmed.toUpperCase();

  try {
    const byInv = await getDocs(
      query(collection(db, 'devices'), where('inventoryNumber', '==', normalizedUpper), limit(1))
    );
    if (!byInv.empty) {
      const d = byInv.docs[0];
      const device = { id: d.id, ...(d.data() as Omit<DeviceRecord, 'id'>) };
      const ctx = await resolveDeviceContext(device);
      return { kind: 'DEVICE', device, ...ctx };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'devices');
  }

  try {
    const bySerial = await getDocs(
      query(collection(db, 'devices'), where('serialNumber', '==', trimmed), limit(1))
    );
    if (!bySerial.empty) {
      const d = bySerial.docs[0];
      const device = { id: d.id, ...(d.data() as Omit<DeviceRecord, 'id'>) };
      const ctx = await resolveDeviceContext(device);
      return { kind: 'DEVICE', device, ...ctx };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'devices');
  }

  try {
    const byItemCode = await getDocs(
      query(collection(db, 'items'), where('itemCode', '==', normalizedUpper), limit(1))
    );
    if (!byItemCode.empty) {
      const d = byItemCode.docs[0];
      const base = { id: d.id, ...(d.data() as Omit<ConsumableRecord, 'id'>) };
      const ctx = await resolveConsumableContext(base);
      return {
        kind: 'CONSUMABLE',
        item: { ...base, currentQuantity: ctx.currentQuantity },
        categoryName: ctx.categoryName,
      };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'items');
  }

  // 4. Direct raw database document ID lookup (devices/{id} or items/{id})
  if (/^[a-zA-Z0-9_-]{3,128}$/.test(trimmed)) {
    try {
      const dSnap = await getDoc(doc(db, 'devices', trimmed));
      if (dSnap.exists()) {
        const device = { id: dSnap.id, ...(dSnap.data() as Omit<DeviceRecord, 'id'>) };
        const ctx = await resolveDeviceContext(device);
        return { kind: 'DEVICE', device, ...ctx };
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `devices/${trimmed}`);
    }

    try {
      const iSnap = await getDoc(doc(db, 'items', trimmed));
      if (iSnap.exists()) {
        const base = { id: iSnap.id, ...(iSnap.data() as Omit<ConsumableRecord, 'id'>) };
        const ctx = await resolveConsumableContext(base);
        return {
          kind: 'CONSUMABLE',
          item: { ...base, currentQuantity: ctx.currentQuantity },
          categoryName: ctx.categoryName,
        };
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `items/${trimmed}`);
    }
  }

  return null;
}

export function generateBarcodeDataUrl(
  value: string,
  opts?: { width?: number; height?: number; displayValue?: boolean; lineColor?: string }
): string {
  const safeVal = (value || 'SM-0000').trim();
  const canvas = document.createElement('canvas');
  try {
    JsBarcode(canvas, safeVal, {
      format: 'CODE128',
      lineColor: opts?.lineColor || '#0F2544',
      background: '#FFFFFF',
      width: opts?.width ?? 2,
      height: opts?.height ?? 52,
      displayValue: opts?.displayValue ?? true,
      font: 'IBM Plex Mono, monospace',
      fontSize: 13,
      margin: 6,
    });
    return canvas.toDataURL('image/png');
  } catch {
    // Fallback if unsupported characters were passed to Code128
    const asciiSafe = safeVal.replace(/[^\x20-\x7E]/g, '-') || 'SM-0000';
    JsBarcode(canvas, asciiSafe, {
      format: 'CODE128',
      lineColor: opts?.lineColor || '#0F2544',
      background: '#FFFFFF',
      width: opts?.width ?? 2,
      height: opts?.height ?? 52,
      displayValue: opts?.displayValue ?? true,
      margin: 6,
    });
    return canvas.toDataURL('image/png');
  }
}

export async function generateQrDataUrl(
  value: string,
  size = 180,
  errorCorrectionLevel: QrErrorCorrectionLevel = 'M'
): Promise<string> {
  return QRCode.toDataURL(value || 'SAYEDMART', {
    width: size,
    margin: 1,
    errorCorrectionLevel,
    color: {
      dark: '#0F2544',
      light: '#FFFFFF',
    },
  });
}

export async function generateQrSvgString(
  value: string,
  opts?: { size?: number; errorCorrectionLevel?: QrErrorCorrectionLevel }
): Promise<string> {
  return QRCode.toString(value || 'SAYEDMART', {
    type: 'svg',
    width: opts?.size ?? 256,
    margin: 1,
    errorCorrectionLevel: opts?.errorCorrectionLevel ?? 'M',
    color: {
      dark: '#0F2544',
      light: '#FFFFFF',
    },
  });
}

export async function downloadQrPng(
  value: string,
  fileName: string,
  opts?: { size?: number; errorCorrectionLevel?: QrErrorCorrectionLevel }
): Promise<void> {
  const url = await generateQrDataUrl(
    value,
    opts?.size ?? 512,
    opts?.errorCorrectionLevel ?? 'M'
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.png') ? fileName : `${fileName}.png`;
  link.click();
}

export async function downloadQrSvg(
  value: string,
  fileName: string,
  errorCorrectionLevel: QrErrorCorrectionLevel = 'M'
): Promise<void> {
  const svg = await generateQrSvgString(value, { size: 320, errorCorrectionLevel });
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.svg') ? fileName : `${fileName}.svg`;
  link.click();
  URL.revokeObjectURL(url);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function truncateTextToFit(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

export async function renderStickerCanvas(
  label: AssetLabelData,
  preset: LabelSizePreset,
  options?: StickerRenderOptions
): Promise<HTMLCanvasElement> {
  const layoutMode: LabelLayoutMode = options?.layoutMode ?? 'combined';
  const qrErrorCorrection: QrErrorCorrectionLevel = options?.qrErrorCorrection ?? 'M';
  const qrPayload = options?.qrValueOverride || label.qrValue;

  // High-DPI dimensions (at ~12 px/mm)
  const dims =
    preset === 'thermal_50x30'
      ? { width: 600, height: 360 }
      : { width: 840, height: 480 };

  const canvas = document.createElement('canvas');
  canvas.width = dims.width;
  canvas.height = dims.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('تعذر تهيئة لوحة الرسم للملصق.');

  // White sticker surface + navy border
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, dims.width, dims.height);

  ctx.strokeStyle = '#0F2544';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, dims.width - 8, dims.height - 8);

  // Header band
  const headerH = preset === 'thermal_50x30' ? 58 : 72;
  ctx.fillStyle = '#0F2544';
  ctx.fillRect(4, 4, dims.width - 8, headerH);

  // Gold accent hairline under header
  ctx.fillStyle = '#C59B47';
  ctx.fillRect(4, 4 + headerH, dims.width - 8, 4);

  // Header text
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font =
    preset === 'thermal_50x30'
      ? 'bold 17px Cairo, Tahoma, sans-serif'
      : 'bold 21px Cairo, Tahoma, sans-serif';
  ctx.fillText(
    'العتبة الحسينية المقدسة · مجمع سيد الشهداء (ع)',
    dims.width / 2,
    4 + headerH * 0.36
  );

  ctx.fillStyle = '#E5C67A';
  ctx.font =
    preset === 'thermal_50x30'
      ? '600 13px Cairo, Tahoma, sans-serif'
      : '600 16px Cairo, Tahoma, sans-serif';
  ctx.fillText(
    'شعبة السيطرة والإنترنت — نظام إدارة الموجودات',
    dims.width / 2,
    4 + headerH * 0.74
  );

  if (layoutMode === 'qr_focus') {
    const qrSize = preset === 'thermal_50x30' ? 236 : 332;
    const qrSrc = await generateQrDataUrl(qrPayload, qrSize, qrErrorCorrection);
    const qrImg = await loadImage(qrSrc);

    const bodyTop = headerH + 22;
    const paddingX = 24;
    const qrX = paddingX;
    const qrY = bodyTop + Math.max(0, (dims.height - bodyTop - 18 - qrSize) / 2);

    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 2;
    ctx.strokeRect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8);
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

    const rightEdge = dims.width - paddingX;
    const textAreaWidth = dims.width - paddingX * 2 - qrSize - 28;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';

    ctx.fillStyle = '#64748B';
    ctx.font =
      preset === 'thermal_50x30'
        ? '600 14px Cairo, Tahoma, sans-serif'
        : '600 17px Cairo, Tahoma, sans-serif';
    ctx.fillText(
      label.kind === 'DEVICE' ? 'بطاقة رمز QR — جهاز فردي' : 'بطاقة رمز QR — مادة كمية',
      rightEdge,
      bodyTop
    );

    ctx.fillStyle = '#0F2544';
    ctx.font =
      preset === 'thermal_50x30'
        ? 'bold 28px "IBM Plex Mono", monospace'
        : 'bold 36px "IBM Plex Mono", monospace';
    const codeY = bodyTop + (preset === 'thermal_50x30' ? 24 : 30);
    ctx.fillText(label.code, rightEdge, codeY);

    ctx.fillStyle = '#0F172A';
    ctx.font =
      preset === 'thermal_50x30'
        ? 'bold 21px Cairo, Tahoma, sans-serif'
        : 'bold 28px Cairo, Tahoma, sans-serif';
    const titleY = codeY + (preset === 'thermal_50x30' ? 38 : 48);
    ctx.fillText(truncateTextToFit(ctx, label.title, textAreaWidth), rightEdge, titleY);

    ctx.fillStyle = '#475569';
    ctx.font =
      preset === 'thermal_50x30'
        ? '600 16px Cairo, Tahoma, sans-serif'
        : '600 20px Cairo, Tahoma, sans-serif';
    const subText = [label.subtitle, label.location].filter(Boolean).join(' · ');
    const subY = titleY + (preset === 'thermal_50x30' ? 34 : 44);
    ctx.fillText(truncateTextToFit(ctx, subText, textAreaWidth), rightEdge, subY);

    // Explicit Database ID Box
    const dbBoxY = dims.height - (preset === 'thermal_50x30' ? 66 : 84);
    const dbBoxH = preset === 'thermal_50x30' ? 44 : 56;
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(qrX + qrSize + 24, dbBoxY, textAreaWidth, dbBoxH);
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 2;
    ctx.strokeRect(qrX + qrSize + 24, dbBoxY, textAreaWidth, dbBoxH);

    ctx.fillStyle = '#64748B';
    ctx.font =
      preset === 'thermal_50x30'
        ? '600 12px Cairo, Tahoma, sans-serif'
        : '600 14px Cairo, Tahoma, sans-serif';
    ctx.fillText('معرّف قاعدة البيانات (DB ID)', rightEdge - 10, dbBoxY + 5);

    ctx.fillStyle = '#0F2544';
    ctx.font =
      preset === 'thermal_50x30'
        ? 'bold 14px "IBM Plex Mono", monospace'
        : 'bold 17px "IBM Plex Mono", monospace';
    ctx.fillText(
      truncateTextToFit(ctx, label.id, textAreaWidth - 20),
      rightEdge - 10,
      dbBoxY + (preset === 'thermal_50x30' ? 22 : 28)
    );

    return canvas;
  }

  // Generate Barcode and QR images
  const qrSize = preset === 'thermal_50x30' ? 148 : 196;
  const barcodeSrc = generateBarcodeDataUrl(label.barcodeValue, {
    width: preset === 'thermal_50x30' ? 2 : 2.5,
    height: preset === 'thermal_50x30' ? 68 : 92,
    displayValue: true,
    lineColor: '#0F2544',
  });
  const qrSrc = await generateQrDataUrl(qrPayload, qrSize, qrErrorCorrection);

  const [barcodeImg, qrImg] = await Promise.all([
    loadImage(barcodeSrc),
    loadImage(qrSrc),
  ]);

  const bodyTop = headerH + 22;
  const paddingX = 24;

  // Draw QR on left side of label
  const qrX = paddingX;
  const qrY = dims.height - qrSize - 22;
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  // Right side metadata + Barcode
  const rightEdge = dims.width - paddingX;
  const textAreaWidth = dims.width - paddingX * 2 - qrSize - 24;

  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';

  // Inventory code (monospace)
  ctx.fillStyle = '#0F2544';
  ctx.font =
    preset === 'thermal_50x30'
      ? 'bold 24px "IBM Plex Mono", monospace'
      : 'bold 30px "IBM Plex Mono", monospace';
  ctx.fillText(label.code, rightEdge, bodyTop);

  // Asset title
  ctx.fillStyle = '#0F172A';
  ctx.font =
    preset === 'thermal_50x30'
      ? 'bold 20px Cairo, Tahoma, sans-serif'
      : 'bold 25px Cairo, Tahoma, sans-serif';
  const titleY = bodyTop + (preset === 'thermal_50x30' ? 32 : 42);
  ctx.fillText(truncateTextToFit(ctx, label.title, textAreaWidth), rightEdge, titleY);

  // Subtitle (Category / Location)
  ctx.fillStyle = '#475569';
  ctx.font =
    preset === 'thermal_50x30'
      ? '600 15px Cairo, Tahoma, sans-serif'
      : '600 18px Cairo, Tahoma, sans-serif';
  const subText = [label.subtitle, label.location].filter(Boolean).join(' · ');
  const subY = titleY + (preset === 'thermal_50x30' ? 30 : 38);
  ctx.fillText(truncateTextToFit(ctx, subText, textAreaWidth), rightEdge, subY);

  // Barcode placed cleanly in remaining bottom-right region
  const bcAvailWidth = textAreaWidth;
  const bcMaxHeight = preset === 'thermal_50x30' ? 110 : 145;
  const bcRatio = Math.min(
    bcAvailWidth / barcodeImg.width,
    bcMaxHeight / barcodeImg.height
  );
  const bcDrawW = Math.max(160, barcodeImg.width * bcRatio);
  const bcDrawH = barcodeImg.height * bcRatio;
  const bcX = rightEdge - bcDrawW;
  const bcY = dims.height - bcDrawH - 18;
  ctx.drawImage(barcodeImg, bcX, bcY, bcDrawW, bcDrawH);

  return canvas;
}

export async function downloadLabelPng(
  label: AssetLabelData,
  preset: LabelSizePreset,
  options?: StickerRenderOptions
): Promise<void> {
  const canvas = await renderStickerCanvas(label, preset, options);
  const url = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = url;
  link.download = `label-${label.code}.png`;
  link.click();
}

export async function downloadLabelsPdf(
  labels: AssetLabelData[],
  preset: LabelSizePreset,
  options?: StickerRenderOptions
): Promise<void> {
  if (labels.length === 0) return;

  if (preset === 'thermal_50x30' || preset === 'thermal_70x40') {
    const widthMm = preset === 'thermal_50x30' ? 50 : 70;
    const heightMm = preset === 'thermal_50x30' ? 30 : 40;
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [widthMm, heightMm],
    });

    for (let i = 0; i < labels.length; i += 1) {
      if (i > 0) pdf.addPage([widthMm, heightMm], 'landscape');
      const canvas = await renderStickerCanvas(labels[i], preset, options);
      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', 0.5, 0.5, widthMm - 1, heightMm - 1);
    }

    const fileName =
      labels.length === 1
        ? `sticker-${labels[0].code}-${widthMm}x${heightMm}.pdf`
        : `sayed-mart-stickers-${labels.length}-${widthMm}x${heightMm}.pdf`;
    pdf.save(fileName);
    return;
  }

  // A4 Multi-Label Sheet (3 columns x 7 rows = 21 stickers per A4 page)
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const cols = 3;
  const rows = 7;
  const perPage = cols * rows;
  const marginX = 9;
  const marginY = 10;
  const gapX = 3;
  const gapY = 3;
  const cellW = (210 - marginX * 2 - gapX * (cols - 1)) / cols; // ~62mm
  const cellH = (297 - marginY * 2 - gapY * (rows - 1)) / rows; // ~37mm

  for (let i = 0; i < labels.length; i += 1) {
    if (i > 0 && i % perPage === 0) {
      pdf.addPage('a4', 'portrait');
    }
    const indexOnPage = i % perPage;
    const col = indexOnPage % cols;
    const row = Math.floor(indexOnPage / cols);
    const x = marginX + col * (cellW + gapX);
    const y = marginY + row * (cellH + gapY);

    const canvas = await renderStickerCanvas(labels[i], 'thermal_70x40', options);
    const imgData = canvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', x, y, cellW, cellH);
  }

  pdf.save(`sayed-mart-a4-labels-${new Date().toISOString().slice(0, 10)}.pdf`);
}
