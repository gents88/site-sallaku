import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import { OCR_WORKER_IDLE_MS, OcrService } from './ocr.service';

const mockRecognize = jest.fn();
const mockTerminate = jest.fn();
const mockCreateWorker = jest.fn();
jest.mock('tesseract.js', () => ({ createWorker: (...args: unknown[]) => mockCreateWorker(...args) }));
jest.mock('sharp', () => () => ({ rotate: () => ({ png: () => ({ toBuffer: async () => Buffer.from('png') }) }) }));

const image = () => [Buffer.from('immagine')];

describe('OcrService — ciclo di vita dei worker Tesseract', () => {
  let ocr: OcrService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    mockRecognize.mockReset().mockResolvedValue({ data: { text: ' testo letto ', confidence: 91.234 } });
    mockTerminate.mockReset().mockResolvedValue(undefined);
    mockCreateWorker.mockReset().mockImplementation(async () => ({ recognize: mockRecognize, terminate: mockTerminate }));
    ocr = new OcrService();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('riusa il worker per richieste ravvicinate e lo chiude dopo OCR_WORKER_IDLE_MS senza richieste', async () => {
    const result = await ocr.recognize(image(), 'ita');
    expect(result).toEqual({ lang: 'ita', pages: [{ index: 0, text: 'testo letto', confidence: 91.2 }], text: 'testo letto' });
    await ocr.recognize(image(), 'ita');
    expect(mockCreateWorker).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(OCR_WORKER_IDLE_MS - 1);
    expect(mockTerminate).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(mockTerminate).toHaveBeenCalledTimes(1);

    // Dopo la chiusura la richiesta successiva ricrea il worker.
    await ocr.recognize(image(), 'ita');
    expect(mockCreateWorker).toHaveBeenCalledTimes(2);
  });

  it('non chiude un worker mentre una richiesta è ancora in corso', async () => {
    let finish!: (value: unknown) => void;
    mockRecognize.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));

    const pending = ocr.recognize(image(), 'eng');
    await jest.advanceTimersByTimeAsync(OCR_WORKER_IDLE_MS * 3);
    expect(mockTerminate).not.toHaveBeenCalled();

    finish({ data: { text: 'lento', confidence: 50 } });
    await pending;
    await jest.advanceTimersByTimeAsync(OCR_WORKER_IDLE_MS);
    expect(mockTerminate).toHaveBeenCalledTimes(1);
  });

  it('ogni nuova richiesta rimanda la chiusura', async () => {
    await ocr.recognize(image(), 'eng');
    await jest.advanceTimersByTimeAsync(OCR_WORKER_IDLE_MS - 1000);
    await ocr.recognize(image(), 'eng');
    await jest.advanceTimersByTimeAsync(OCR_WORKER_IDLE_MS - 1000);
    expect(mockTerminate).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1000);
    expect(mockTerminate).toHaveBeenCalledTimes(1);
    expect(mockCreateWorker).toHaveBeenCalledTimes(1);
  });

  it('un worker per combinazione di lingue; allo shutdown si chiudono tutti, una volta sola', async () => {
    await ocr.recognize(image(), 'eng');
    await ocr.recognize(image(), 'ita+eng');
    expect(mockCreateWorker).toHaveBeenCalledTimes(2);

    await ocr.onModuleDestroy();
    expect(mockTerminate).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(OCR_WORKER_IDLE_MS);
    expect(mockTerminate).toHaveBeenCalledTimes(2);
  });

  it('se la creazione del worker fallisce, la richiesta successiva riprova', async () => {
    mockCreateWorker.mockRejectedValueOnce(new Error('dati della lingua non scaricati'));
    await expect(ocr.recognize(image(), 'eng')).rejects.toThrow('dati della lingua non scaricati');

    await expect(ocr.recognize(image(), 'eng')).resolves.toMatchObject({ text: 'testo letto' });
    expect(mockCreateWorker).toHaveBeenCalledTimes(2);
  });

  it('una lingua non supportata viene rifiutata senza creare worker', async () => {
    await expect(ocr.recognize(image(), 'xyz')).rejects.toThrow('Unsupported OCR language');
    expect(mockCreateWorker).not.toHaveBeenCalled();
  });
});
