/**
 * Transport printer thermal Bluetooth Low Energy — implementasi nyata.
 *
 * Dipakai untuk mencetak struk 58 mm lewat printer BLE murah (RPP02N,
 * GoojPRT, XP-58, MTP-II, dan sejenisnya yang memakai layanan 0x18F0).
 *
 * Cara kerja:
 * 1. `scanPrinters()` memindai perangkat BLE lalu menyaring nama yang mirip
 *    printer thermal (atau menampilkan semua bila `showAll`).
 * 2. `connectPrinter(id)` menyambung, menaikkan MTU (Android) dan mencari
 *    characteristic tulis yang cocok — tidak hanya 0x2AF1, karena sebagian
 *    printer memakai UUID lain.
 * 3. `printReceiptText(text)` mengubah struk teks menjadi perintah ESC/POS
 *    (`buildEscPos`), memecahnya per 180 byte, lalu menulis berurutan.
 *
 * Semua fungsi mengembalikan hasil `{ ok, message }` — tidak pernah melempar
 * error ke UI, sehingga printer yang mati/tidak terpasang tidak membuat
 * aplikasi crash.
 *
 * Catatan build: modul `react-native-ble-plx` hanya ada di development build
 * (`npx expo run:android` / `run:ios`). Di Expo Go dan di web, semua fungsi
 * mengembalikan status "tidak didukung" beserta petunjuk.
 */
import { PermissionsAndroid, Platform } from 'react-native';

import { buildEscPos } from './receipt';

export interface PrinterDevice {
  id: string;
  name: string;
  rssi: number | null;
}

export interface PrinterResult {
  ok: boolean;
  message: string;
}

const SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
const WRITE_UUID = '00002af1-0000-1000-8000-00805f9b34fb';
const PRINTER_NAME = /rpp|printer|pos|58|thermal|goojprt|xp-|mtp|blue|mini/i;
const CHUNK_SIZE = 20;

/* --------------------------------------------------------- modul opsional --- */

type BleModule = typeof import('react-native-ble-plx');
type BleManager = InstanceType<BleModule['BleManager']>;
type BleDevice = Awaited<ReturnType<BleManager['connectToDevice']>>;

let bleModule: BleModule | null | undefined;

function loadBle(): BleModule | null {
  if (bleModule !== undefined) return bleModule;
  if (Platform.OS === 'web') {
    bleModule = null;
    return bleModule;
  }
  try {
    // Nama modul disimpan di variabel agar bundler web tidak mencoba me-resolve
    // modul native yang tidak tersedia di browser.
    const name = 'react-native-ble-plx';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    bleModule = require(name) as BleModule;
  } catch {
    bleModule = null;
  }
  return bleModule;
}

export function isPrinterSupported(): boolean {
  return loadBle() !== null;
}

export function printerSupportHint(): string {
  if (Platform.OS === 'web') {
    return 'Struk bisa dipratinjau, disalin, dan dibagikan dari layar ini.';
  }
  if (!isPrinterSupported()) {
    return 'Printer Bluetooth tidak aktif di perangkat ini. Struk tetap bisa disalin dan dibagikan.';
  }
  return 'Printer thermal 58 mm via Bluetooth LE — pindai printer, sambungkan, lalu cetak.';
}

/* -------------------------------------------------------------- manager --- */

let manager: BleManager | null = null;
let device: BleDevice | null = null;
let writeChar: { service: string; characteristic: string; withResponse: boolean } | null = null;
let connected: PrinterDevice | null = null;
const listeners = new Set<(state: PrinterDevice | null) => void>();

function getManager(): BleManager | null {
  const mod = loadBle();
  if (!mod) return null;
  if (!manager) {
    manager = new mod.BleManager();
  }
  return manager;
}

function notify(next: PrinterDevice | null) {
  connected = next;
  listeners.forEach((fn) => fn(next));
}

/** Berlangganan status koneksi printer (dipakai header pengaturan & kasir). */
export function onPrinterChange(fn: (state: PrinterDevice | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function connectedPrinter(): PrinterDevice | null {
  return connected;
}

/* ----------------------------------------------------------- permissions --- */

async function ensureAndroidPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const version = Number(Platform.Version);
  const needed =
    version >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const result = await PermissionsAndroid.requestMultiple(needed as never);
  return Object.values(result).every((value) => value === PermissionsAndroid.RESULTS.GRANTED);
}

/* ----------------------------------------------------------------- scan --- */

export async function scanPrinters(
  timeoutMs = 9000,
  showAll = false,
): Promise<{ ok: boolean; devices: PrinterDevice[]; message?: string }> {
  const ble = getManager();
  if (!ble) {
    return { ok: false, devices: [], message: printerSupportHint() };
  }
  if (Platform.OS === 'android' && !(await ensureAndroidPermissions())) {
    return {
      ok: false,
      devices: [],
      message: 'Izin Bluetooth ditolak. Aktifkan izin "Perangkat di sekitar" di pengaturan sistem.',
    };
  }

  // Lepas koneksi lama supaya pemindaian tidak terganggu.
  await disconnectPrinter();

  return new Promise((resolve) => {
    const found = new Map<string, PrinterDevice>();
    let settled = false;

    const finish = (message?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ble.stopDeviceScan();
      resolve({
        ok: true,
        devices: [...found.values()].sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999)),
        message,
      });
    };

    const timer = setTimeout(() => finish(), timeoutMs);

    ble.startDeviceScan(null, { allowDuplicates: false }, (error, scanned) => {
      if (error) {
        finish(error.message);
        return;
      }
      if (!scanned?.id) return;
      const name = scanned.name || scanned.localName || '';
      if (showAll || PRINTER_NAME.test(name)) {
        found.set(scanned.id, { id: scanned.id, name: name || 'Tanpa nama', rssi: scanned.rssi ?? null });
      }
    });
  });
}

/* ----------------------------------------------------------- connect --- */

async function findWriteCharacteristic(
  ble: BleManager,
  target: BleDevice,
): Promise<{ service: string; characteristic: string; withResponse: boolean } | null> {
  // 1) Coba layanan standar printer thermal lebih dulu.
  const standard = await ble
    .characteristicsForDevice(target.id, SERVICE_UUID)
    .catch(() => null);
  const direct = standard?.find((c) => c.uuid.toLowerCase() === WRITE_UUID);
  if (direct && (direct.isWritableWithResponse || direct.isWritableWithoutResponse)) return { service: SERVICE_UUID, characteristic: direct.uuid, withResponse: direct.isWritableWithResponse };

  // 2) Kalau tidak ada, telusuri semua layanan dan ambil characteristic yang
  //    bisa ditulis (sebagian printer memakai UUID custom).
  const services = await ble.servicesForDevice(target.id).catch(() => null);
  if (!services) return null;
  for (const service of services) {
    const chars = await ble
      .characteristicsForDevice(target.id, service.uuid)
      .catch(() => null);
    const writable = chars?.find((c) => c.isWritableWithResponse || c.isWritableWithoutResponse);
    if (writable) return { service: service.uuid, characteristic: writable.uuid, withResponse: writable.isWritableWithResponse };
  }
  return null;
}

export async function connectPrinter(id: string, name?: string): Promise<PrinterResult> {
  const ble = getManager();
  if (!ble) return { ok: false, message: printerSupportHint() };

  try {
    if (Platform.OS === 'android' && !(await ensureAndroidPermissions())) {
      return { ok: false, message: 'Izin Bluetooth ditolak.' };
    }
    await disconnectPrinter();

    const target = await ble.connectToDevice(id, { timeout: 12000 });
    await target.discoverAllServicesAndCharacteristics();
    // MTU lebih besar = pengiriman struk lebih cepat (khusus Android).
    if (Platform.OS === 'android') {
      await ble.requestMTUForDevice(target.id, 200).catch(() => null);
    }
    // Pantau bila printer mati/hilang.
    target.onDisconnected(() => {
      device = null;
      writeChar = null;
      notify(null);
    });

    const characteristic = await findWriteCharacteristic(ble, target);
    if (!characteristic) {
      await target.cancelConnection().catch(() => null);
      return {
        ok: false,
        message: 'Printer tersambung tetapi tidak menyediakan kanal tulis. Coba printer thermal 58 mm lain.',
      };
    }

    device = target;
    writeChar = characteristic;
    notify({ id: target.id, name: name || target.name || target.localName || 'Printer', rssi: null });
    return { ok: true, message: `Tersambung ke ${name || target.name || 'printer'}.` };
  } catch (error) {
    return {
      ok: false,
      message: 'Printer belum tersambung. Pastikan printer menyala, dekat, dan izin Bluetooth aktif.',
    };
  }
}

export async function disconnectPrinter(): Promise<void> {
  const target = device;
  device = null;
  writeChar = null;
  notify(null);
  if (!target) return;
  try {
    await target.cancelConnection();
  } catch {
    // Printer mungkin sudah mati — tidak perlu dilaporkan.
  }
}

/* --------------------------------------------------------------- print --- */

function base64Encode(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = bytes[i + 1];
    const b3 = bytes[i + 2];
    output += chars[b1 >> 2];
    output += chars[((b1 & 3) << 4) | ((b2 ?? 0) >> 4)];
    output += b2 === undefined ? '=' : chars[((b2 & 15) << 2) | ((b3 ?? 0) >> 6)];
    output += b3 === undefined ? '=' : chars[b3 & 63];
  }
  return output;
}

/** Escape/POS memakai byte 0x00–0xFF; karakter di luar itu diganti '?'. */
function toBytes(payload: string): Uint8Array {
  const out = new Uint8Array(payload.length);
  for (let i = 0; i < payload.length; i += 1) {
    const code = payload.charCodeAt(i);
    out[i] = code <= 0xff ? code : 0x3f;
  }
  return out;
}

export async function printReceiptText(text: string): Promise<PrinterResult> {
  const ble = getManager();
  if (!ble) return { ok: false, message: printerSupportHint() };
  if (!device || !writeChar) {
    return { ok: false, message: 'Printer belum tersambung. Buka Pengaturan → Printer struk.' };
  }

  try {
    const targetId = device.id;
    const channel = writeChar;
    const bytes = toBytes(buildEscPos(text));
    for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
      const chunk = bytes.subarray(offset, offset + CHUNK_SIZE);
      const write = channel.withResponse
        ? ble.writeCharacteristicWithResponseForDevice.bind(ble)
        : ble.writeCharacteristicWithoutResponseForDevice.bind(ble);
      await write(targetId, channel.service, channel.characteristic, base64Encode(chunk));
      if (!channel.withResponse) await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return { ok: true, message: 'Struk terkirim ke printer.' };
  } catch (error) {
    return {
      ok: false,
      message: 'Struk belum selesai dicetak. Periksa kertas dan sambungan printer, lalu coba lagi.',
    };
  }
}

/** Cetak baris uji untuk memastikan printer benar-benar bekerja. */
export async function printTestPage(storeName: string): Promise<PrinterResult> {
  const line = '-'.repeat(32);
  return printReceiptText(
    [
      (storeName || 'INVENTORI\'S').toUpperCase(),
      line,
      'TES PRINTER',
      'Printer BLE 58 mm siap dipakai.',
      line,
      new Date().toLocaleString('id-ID'),
      '',
    ].join('\n'),
  );
}

export { buildEscPos };
