import { SeoController } from './seo.controller';

describe('SeoController', () => {
  const SHELL = '<html><title>shell</title></html>';
  let blog: { existsPublished: jest.Mock };
  let projects: { existsBySlug: jest.Mock };
  let shell: { read: jest.Mock };
  let controller: SeoController;

  function makeRes() {
    const res: any = {};
    res.setHeader = jest.fn().mockReturnValue(res);
    res.status = jest.fn().mockReturnValue(res);
    res.type = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    return res;
  }

  beforeEach(() => {
    blog = { existsPublished: jest.fn() };
    projects = { existsBySlug: jest.fn() };
    shell = { read: jest.fn().mockResolvedValue(SHELL) };
    controller = new SeoController(blog as any, projects as any, shell as any);
  });

  it('risponde 200 con la shell per un articolo pubblicato', async () => {
    blog.existsPublished.mockResolvedValue(true);
    const res = makeRes();
    await controller.shellFor('blog', 'un-articolo', res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.type).toHaveBeenCalledWith('text/html');
    expect(res.send).toHaveBeenCalledWith(SHELL);
  });

  it('risponde 404 (con la shell, per mostrare la pagina "non trovato") per uno slug blog inesistente', async () => {
    blog.existsPublished.mockResolvedValue(false);
    const res = makeRes();
    await controller.shellFor('blog', 'slug-falso', res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).toHaveBeenCalledWith(SHELL);
  });

  it('usa il servizio progetti per /projects/<slug>', async () => {
    projects.existsBySlug.mockResolvedValue(true);
    const res = makeRes();
    await controller.shellFor('projects', 'case-study', res);
    expect(projects.existsBySlug).toHaveBeenCalledWith('case-study');
    expect(blog.existsPublished).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('risponde 404 per una sezione sconosciuta senza interrogare il DB', async () => {
    const res = makeRes();
    await controller.shellFor('admin', 'x', res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(blog.existsPublished).not.toHaveBeenCalled();
    expect(projects.existsBySlug).not.toHaveBeenCalled();
  });

  it('risponde 404 per slug troppo lunghi senza interrogare il DB', async () => {
    const res = makeRes();
    await controller.shellFor('blog', 'a'.repeat(201), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(blog.existsPublished).not.toHaveBeenCalled();
  });

  it('risponde 503 ritentabile se la shell non è leggibile', async () => {
    blog.existsPublished.mockResolvedValue(true);
    shell.read.mockResolvedValue(null);
    const res = makeRes();
    await controller.shellFor('blog', 'un-articolo', res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '60');
  });
});
