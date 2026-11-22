import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PageShellService } from './page-shell.service';

describe('PageShellService', () => {
  let dir: string;
  let file: string;

  const make = (shellPath?: string) =>
    new PageShellService({ get: () => shellPath } as any);

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'shell-'));
    file = path.join(dir, 'index.csr.html');
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('legge la shell dal percorso configurato', async () => {
    await fs.writeFile(file, '<html>uno</html>');
    expect(await make(file).read()).toBe('<html>uno</html>');
  });

  it('rilegge il file quando cambia (nuovo deploy del frontend)', async () => {
    await fs.writeFile(file, '<html>uno</html>');
    const service = make(file);
    expect(await service.read()).toBe('<html>uno</html>');

    await fs.writeFile(file, '<html>due</html>');
    const future = new Date(Date.now() + 5000);
    await fs.utimes(file, future, future);
    expect(await service.read()).toBe('<html>due</html>');
  });

  it('restituisce null se il file non esiste', async () => {
    expect(await make(path.join(dir, 'manca.html')).read()).toBeNull();
  });
});
