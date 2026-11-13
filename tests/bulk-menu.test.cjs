const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8').replace(/import\s+[\s\S]*?from\s+"[^"]+";/g, '');
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, { value: '', innerHTML: '', open: false, showModal() { this.open = true; }, close() { this.open = false; }, addEventListener() {}, querySelectorAll: () => [],
    querySelector: () => ({ addEventListener() {} }), classList: { add() {}, remove() {}, toggle() {} } });
  return elements.get(id);
};
let saved;
const context = { console, Intl, setTimeout() {}, clearTimeout() {}, localStorage: { getItem() { return ''; } },
  document: { getElementById: element, addEventListener() {}, querySelectorAll: () => [] }, initializeApp() {}, getAuth() {}, getFirestore() {}, collection() {},
  doc() { return { id: 'generated' }; }, onAuthStateChanged() {},
  async runTransaction(db, callback) {
    await callback({ get: async () => ({ exists: () => true, data: () => saved }), update(ref, data) { saved = { ...saved, ...data }; } });
  }
};
vm.createContext(context); vm.runInContext(source, context);
const run = code => vm.runInContext(code, context);
const parse = text => { context.testText = text; return run('parseBulkMenu(testText)'); };
(async () => {
  let result = parse('Danh mục\tTên món\tGiá\tSize\r\nTrà\tTrà đào\t25.000\tM\r\nMatcha\tLatte\t30k\tL');
  assert.equal(result.errors.length, 0); assert.equal(result.items[0].price, 25000); assert.equal(result.items[1].price, 30000);
  result = parse('\uFEFFcategory,name,price,size\nCoffee,"Coffee, milk",25000,L');
  assert.equal(result.errors.length, 0); assert.equal(result.items[0].name, 'Coffee, milk');
  assert.equal(parse('Trà;Trà sữa;"25,5k";L').items[0].price, 25500);
  assert.equal(parse('\tTea\t0\t').items[0].category, 'Món khác');
  assert.equal(parse('Trà\tTea\t25').items[0].price, 25);
  for (const text of ['', 'Tea', 'Trà\tTea\t-1', 'Trà\tTea\t1.2', 'Trà\tTea\t25000\tL\textra', 'Trà\tTea\t"25']) assert(parse(text).errors.length > 0);
  assert(parse(Array(101).fill('Trà\tTea\t25000').join('\n')).errors.length > 0);
  context.incoming = parse('Trà\tTea\t25000\tL\nTrà\tTea\t25000\tL').items;
  assert.equal(run('mergeBulkMenu([],incoming).added'), 1);
  assert.equal(run('mergeBulkMenu([],incoming).skipped'), 1);
  assert.throws(() => run('mergeBulkMenu(Array.from({length:100},(_,i)=>({id:String(i),name:String(i),price:1})),incoming)'));
  run(`appState={adminUid:'u',activeOrderId:null,shops:[{id:'s',name:'Shop',menu:[]}]};currentUser={uid:'u'};selectedShopId='s';bulkDrafts.set('s',{text:'Trà\\tTea\\t25000\\tL',preview:true});`);
  saved = run('appState');
  await run("importBulkMenu('s')");
  assert.equal(saved.shops[0].menu.length, 1); assert.equal(saved.shops[0].menu[0].category, 'Trà');
  assert.equal(run("bulkDrafts.has('s')"), false);
  run("bulkDrafts.set('s',{text:'invalid',preview:true})");
  await run("importBulkMenu('s')"); assert.equal(saved.shops[0].menu.length, 1);
  run("bulkDrafts.set('s',{text:'Trà\\tTea\\t25000\\tL',preview:true})");
  context.runTransaction = async () => { throw { code: 'permission-denied' }; };
  context.console = { error() {} };
  await run("importBulkMenu('s')");
  assert(run("bulkDrafts.has('s')")); assert.equal(run('bulkSaving'), false);
  context.unsafeText = '<script>\t<img>\t25000';
  assert(!run('bulkPreview({menu:[]},unsafeText)').includes('<script>'));
  run(`appState={adminUid:'u',activeOrderId:'round',shops:[{id:'s',name:'Shop',menu:[{id:'tea',name:'Tea',price:25000}]}]}; currentUser={uid:'u'}; selectedShopId='s'; editorShopId='s'; activeOrder={id:'round',open:true,shopId:'s',menu:appState.shops[0].menu};`);
  run('renderOrderForm();renderEntries();renderAdmin();renderMenuDialog()');
  assert.equal(element('open-order-dialog').disabled, false);
  assert.equal(element('close-order').hidden, false);
  assert(!element('admin-area').innerHTML.includes('id="close-order"'));
  assert(!element('admin-area').innerHTML.includes('add-menu-form'));
  assert(element('menu-dialog-area').innerHTML.includes('add-menu-form'));
  assert(element('menu-dialog-area').innerHTML.includes('bulk-text'));
  element('item-name').value = 'Draft tea'; element('order-note').value = 'Less ice';
  run('render()');
  assert.equal(element('item-name').value, 'Draft tea');
  assert.equal(element('order-note').value, 'Less ice');
  element('menu-dialog').showModal();
  run("currentUser={uid:'visitor'};renderEntries();renderMenuDialog()");
  assert.equal(element('close-order').hidden, true);
  assert.equal(element('menu-dialog').open, false);
  run('activeOrder.open=false;renderOrderForm()');
  assert.equal(element('open-order-dialog').disabled, true);
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.equal((html.match(/id="close-order"/g) || []).length, 1);
  assert(html.indexOf('id="order-form-area"') > html.indexOf('<dialog id="order-dialog"'));
  assert(!source.includes('Kết thúc & lưu'));
  context.summaryItems = Array.from({ length: 10 }, (_, i) => [
    { uid: `user-${i}`, name: `Person ${i}`, drink: 'Tea', price: 25000, size: 'L', note: 'Less ice' },
    { uid: `user-${i}`, name: `Person ${i}`, drink: 'Coffee', price: 15000, note: '' }
  ]).flat();
  context.summaryItems.push({ ...context.summaryItems[0] });
  run("showSummaryContent('Summary','Today',summaryItems)");
  const summaryHtml = element('modal-content').innerHTML;
  assert.equal((summaryHtml.match(/class="person-order"/g) || []).length, 10);
  assert.equal((summaryHtml.match(/class="person-order-line"/g) || []).length, 20);
  assert(!/class="person-order" open/.test(summaryHtml));
  assert(summaryHtml.includes('65.000') && summaryHtml.includes('50.000') && summaryHtml.includes('×2'));
  assert(summaryHtml.includes('Less ice'));
  assert(element('modal-total').innerHTML.includes('425.000'));
  assert.equal(element('summary-modal').open, true);
  context.summaryItems = [
    { uid:'one', name:'Name before', drink:'Tea', price:25000, note:'Less ice' },
    { uid:'one', name:'Name after', drink:'Tea', price:25000, note:'No ice' },
    { uid:'two', name:'Name before', drink:'Old item', price:null }
  ];
  run("showSummaryContent('Summary','',summaryItems)");
  assert.equal((element('modal-content').innerHTML.match(/class="person-order"/g) || []).length, 2);
  assert.equal((element('modal-content').innerHTML.match(/class="person-order-line"/g) || []).length, 3);
  assert(element('modal-total').innerHTML.includes('Chưa gồm'));
  run("showSummaryContent('Summary','',[])"); assert.equal(element('summary-tools').hidden, true);
  run(`currentUser={uid:'visitor'};activeOrder={id:'round',open:true};appState={adminUid:'admin',activeOrderId:'round'};entries=[{id:'own',uid:'visitor',name:'Me',drink:'Tea'},{id:'other',uid:'other',name:'Other',drink:'Coffee'}];`);
  assert.equal(run('canCancelEntry(entries[0])'), true);
  assert.equal(run('canCancelEntry(entries[1])'), false);
  run('renderEntries()');
  assert(element('entries-area').innerHTML.includes('data-entry-id="own"'));
  assert(!element('entries-area').innerHTML.includes('data-entry-id="other"'));
  run("currentUser={uid:'admin'};renderEntries()");
  assert(element('entries-area').innerHTML.includes('data-entry-id="other"'));
  context.doc = (_, ...parts) => ({ path: parts.join('/') });
  let deletes = 0, transactionEntryUid = 'other', roundOpen = true;
  context.runTransaction = async (_, callback) => callback({
    get: async ref => ({ exists: () => true, data: () => ref.path?.includes('/entries/') ? {uid:transactionEntryUid} : ref.path?.startsWith('orders/') ? {open:roundOpen} : {adminUid:'admin',activeOrderId:'round'} }),
    delete() { deletes++; }
  });
  run('askDialog=async()=>true');
  await run("cancelEntry('other')"); assert.equal(deletes, 1);
  run("currentUser={uid:'visitor'}");
  await run("cancelEntry('other')"); assert.equal(deletes, 1);
  transactionEntryUid = 'visitor';
  await run("cancelEntry('own')"); assert.equal(deletes, 2);
  transactionEntryUid = 'changed-owner';
  await run("cancelEntry('own')"); assert.equal(deletes, 2);
  transactionEntryUid = 'visitor'; roundOpen = false;
  await run("cancelEntry('own')"); assert.equal(deletes, 2);
  assert.equal(run('cancellingEntries.size'), 0);
  run('activeOrder.open=false'); assert.equal(run('canCancelEntry(entries[0])'), false);
  let captureHeight = 120, clone, captureHost, copied = false, rendered;
  context.document.body = { append() {} };
  context.document.fonts = { ready: Promise.resolve() };
  context.ClipboardItem = class { constructor(data) { this.data = data; } };
  context.navigator = { clipboard: { async write(items) {
    assert.equal(rendered, undefined, 'Clipboard requested before async rendering');
    await items[0].data['image/png']; copied = true;
  } } };
  const makeClone = () => {
    const buttons = [{ remove() { this.removed = true; } }];
    const details = [{ open: false }, { open: false }];
    const ids = [{ removeAttribute(name) { this.removed = name; } }];
    clone = { buttons, details, ids, querySelectorAll(selector) { return selector === 'button' ? buttons : selector === 'details' ? details : ids; } };
    return clone;
  };
  element('summary-modal').querySelector = () => ({ cloneNode: makeClone });
  context.document.createElement = tag => tag === 'div' ? (captureHost = {
    scrollHeight: captureHeight, setAttribute() {}, append(form) { this.form = form; },
    getBoundingClientRect: () => ({ width: 800 }), remove() { this.removed = true; }
  }) : { click() { throw new Error('Must not download an image'); }, remove() {} };
  context.mockRenderer = async (host, options) => { rendered = { host, options }; return { toBlob(callback) { callback({}); } }; };
  run('loadCaptureRenderer=async()=>mockRenderer');
  await run('captureSummary()');
  assert(clone.details.every(item => item.open)); assert(clone.buttons.every(item => item.removed));
  assert(clone.ids.every(item => item.removed)); assert(copied); assert(captureHost.removed);
  assert.equal(rendered.host, captureHost); assert.equal(rendered.options.height, 120);
  assert.equal(rendered.options.width, 800); assert.equal(rendered.options.scale, 2);
  captureHeight = 20000;
  rendered = undefined;
  await run('captureSummary()');
  assert.equal(rendered.options.height, 20000); assert(rendered.options.scale <= .8);
  assert.equal(run('summaryCapturing'), false); assert.equal(element('capture-summary').disabled, false);
  context.mockRenderer = async () => { throw new Error('Offline'); };
  rendered = undefined;
  await run('captureSummary()');
  assert(captureHost.removed); assert.equal(run('summaryCapturing'), false);
  assert.equal(element('capture-summary').disabled, false);
  context.mockRenderer = async () => ({ toBlob(callback) { callback({}); } });
  context.navigator.clipboard.write = async () => { throw { name: 'NotAllowedError' }; };
  await run('captureSummary()');
  assert(captureHost.removed); assert.equal(run('summaryCapturing'), false);
  context.navigator = {};
  captureHost = undefined;
  await run('captureSummary()'); assert.equal(captureHost, undefined);
  console.log('PASS: Excel/CSV/TSV, headers, prices, quotes, invalid rows, limit, duplicates, atomic import, escaping, and failure draft retention.');
  console.log('PASS: separate order/menu dialogs, draft preservation, admin-only checkout, permission revocation, and no duplicate checkout.');
  console.log('PASS: owner/admin cancellation, forbidden users, transactional ownership recheck, closed rounds, pending-state cleanup.');
  console.log('PASS: summary with 10 people and multiple drinks, duplicate quantities, subtotals, different notes, same UID/name changes, unknown prices, and empty state.');
  console.log('PASS: full-form PNG clipboard copy, immediate permission request, no download, long content, unsupported browser, permission denial and failure cleanup.');
})().catch(error => { console.error(error); process.exitCode = 1; });
