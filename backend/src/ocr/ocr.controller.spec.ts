import { BadRequestException } from '@nestjs/common';
import { OcrController } from './ocr.controller';
import { OcrService } from './ocr.service';

function file(name: string, bytes: number[] | string): Express.Multer.File {
  const head = typeof bytes === 'string' ? Buffer.from(bytes, 'latin1') : Buffer.from(bytes);
  const buffer = Buffer.concat([head, Buffer.alloc(32)]);
  return { originalname: name, buffer, mimetype: 'application/octet-stream', size: buffer.length } as Express.Multer.File;
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe('OcrController.extract', () => {
  let controller: OcrController;
  let ocr: { recognize: jest.Mock };

  beforeEach(() => {
    ocr = { recognize: jest.fn().mockResolvedValue({ pages: [] }) };
    controller = new OcrController(ocr as unknown as OcrService);
  });

  it('rifiuta una richiesta senza file', async () => {
    await expect(controller.extract(undefined)).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.extract([])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('manda al motore OCR solo immagini vere', async () => {
    const png = file('a.png', PNG);

    await controller.extract([png], 'ita');

    expect(ocr.recognize).toHaveBeenCalledWith([png.buffer], 'ita');
  });

  it('rifiuta un file che dichiara octet-stream ma non è un\'immagine, senza chiamare l\'OCR', async () => {
    await expect(controller.extract([file('malware.png', 'MZ\x90\x00')])).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.extract([file('doc.png', '%PDF-1.7')])).rejects.toBeInstanceOf(BadRequestException);

    expect(ocr.recognize).not.toHaveBeenCalled();
  });

  it('basta un file non valido per rifiutare tutta la richiesta', async () => {
    await expect(controller.extract([file('ok.png', PNG), file('bad.png', '<html>')])).rejects.toBeInstanceOf(BadRequestException);

    expect(ocr.recognize).not.toHaveBeenCalled();
  });

  it('usa "eng" se la lingua è vuota', async () => {
    await controller.extract([file('a.png', PNG)], '');

    expect(ocr.recognize).toHaveBeenCalledWith(expect.any(Array), 'eng');
  });
});
