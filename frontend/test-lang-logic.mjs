const NON_DEFAULT_LANGS = ['en', 'sq', 'es', 'pt', 'fr', 'de'];

function withLangPrefix(basePath, lang) {
  const clean = basePath.startsWith('/') ? basePath : `/${basePath}`;
  return lang === 'it' ? clean : `/${lang}${clean === '/' ? '' : clean}`;
}

function stripLangPrefix(path) {
  const segments = path.split('/').filter(Boolean);
  if (segments.length > 0 && NON_DEFAULT_LANGS.includes(segments[0])) {
    const lang = segments[0];
    const rest = '/' + segments.slice(1).join('/');
    return { lang, basePath: rest === '/' ? '/' : rest };
  }
  return { lang: 'it', basePath: path.startsWith('/') ? path : `/${path}` };
}

console.log('Testing lang switching logic:\n');

// Test 1: From IT homepage to EN
console.log('TEST 1: /homepage -> EN');
let url = '/homepage';
let { basePath } = stripLangPrefix(url);
let newUrl = withLangPrefix(basePath, 'en');
console.log(`  Current: ${url}`);
console.log(`  Base path: ${basePath}`);
console.log(`  New URL: ${newUrl}`);
console.log(`  ✓ Expected: /en/homepage\n`);

// Test 2: From EN homepage to IT
console.log('TEST 2: /en/homepage -> IT');
url = '/en/homepage';
({ basePath } = stripLangPrefix(url));
newUrl = withLangPrefix(basePath, 'it');
console.log(`  Current: ${url}`);
console.log(`  Base path: ${basePath}`);
console.log(`  New URL: ${newUrl}`);
console.log(`  ✓ Expected: /homepage\n`);

// Test 3: From EN blog to SQ
console.log('TEST 3: /en/blog/my-post -> SQ');
url = '/en/blog/my-post';
({ basePath } = stripLangPrefix(url));
newUrl = withLangPrefix(basePath, 'sq');
console.log(`  Current: ${url}`);
console.log(`  Base path: ${basePath}`);
console.log(`  New URL: ${newUrl}`);
console.log(`  ✓ Expected: /sq/blog/my-post\n`);

// Test 4: From root (SQ) to EN
console.log('TEST 4: /sq -> EN');
url = '/sq';
({ basePath } = stripLangPrefix(url));
newUrl = withLangPrefix(basePath, 'en');
console.log(`  Current: ${url}`);
console.log(`  Base path: ${basePath}`);
console.log(`  New URL: ${newUrl}`);
console.log(`  ✓ Expected: /en/\n`);
