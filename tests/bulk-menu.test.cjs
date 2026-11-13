const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8').replace(/import\s+[\s\S]*?from\s+"[^"]+";/g, '');
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, { value: '', innerHTML: '', open: false, showModal() { this.open = true; }, close() { this.open = false; }, addEventListener() {}, querySelectorAll: () => [],
    querySelector: () => ({ addEventListener() {} }), setAttribute(name, value) { this[name] = value; }, removeAttribute(name) { delete this[name]; }, classList: { add() {}, remove() {}, toggle() {} } });
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
  element('item-name').value = 'Draft tea';
  run("orderCart.set('tea',{quantity:2,note:'Less ice'})");
  run('render()');
  assert.equal(element('item-name').value, 'Draft tea');
  assert.equal(run("orderCart.get('tea').note"), 'Less ice');
  assert.equal(run("orderCart.get('tea').quantity"), 2);
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
  context.voucherItems = [{uid:'a',name:'A',drink:'Tea',price:10000},{uid:'a',name:'A',drink:'Tea',price:20000},{uid:'b',name:'B',drink:'Coffee',price:70000}];
  let bill = run("calculateVoucher(voucherItems,{type:'amount',value:20000})");
  assert.equal(bill.people.get('uid:a').discount, 6000);
  assert.equal(bill.people.get('uid:b').discount, 14000);
  assert.equal(bill.net, 80000);
  bill = run("calculateVoucher(voucherItems,{type:'percent',value:12.5})");
  assert.equal(bill.discount, 12500); assert.equal(bill.net, 87500);
  assert.equal(run("calculateVoucher(voucherItems,{type:'amount',value:999999}).net"), 0);
  assert.equal(run("calculateVoucher([],{type:'percent',value:20}).net"), 0);
  assert.equal(run("calculateVoucher([{uid:'a',price:null}],{type:'amount',value:20}).discount"), 0);
  assert.equal(run("calculateVoucher(voucherItems,{type:'amount',value:-20}).discount"), 0);
  for (let value = 1; value <= 100; value++) {
    context.discountValue = value;
    bill = run("calculateVoucher(Array.from({length:13},(_,i)=>({uid:String(i),price:i*17+1})),{type:'percent',value:discountValue})");
    assert.equal([...bill.people.values()].reduce((sum, person) => sum + person.discount, 0), bill.discount);
    assert.equal([...bill.people.values()].reduce((sum, person) => sum + person.net, 0), bill.net);
    assert([...bill.people.values()].every(person => Number.isInteger(person.net) && person.net >= 0));
  }
  run("showSummaryContent('Summary','',voucherItems,{type:'amount',value:20000})");
  assert(element('modal-content').innerHTML.includes('24.000') && element('modal-content').innerHTML.includes('56.000'));
  assert(element('modal-content').innerHTML.includes('person-voucher'));
  assert(element('modal-total').innerHTML.includes('80.000'));
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
    scrollHeight: captureHeight, setAttribute() {}, append(form) { this.form = form; }, querySelectorAll() { return []; },
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
  let persistedVoucher;
  run("currentUser={uid:'admin'};appState={adminUid:'admin',activeOrderId:'round'};activeOrder={id:'round',open:true};entries=[{uid:'a',price:100000}];");
  element('voucher-type').value = 'percent'; element('voucher-value').value = '20';
  context.runTransaction = async (_, callback) => callback({
    get: async ref => ({ exists: () => true, data: () => ref.path?.startsWith('orders/') ? {open:true} : {adminUid:'admin',activeOrderId:'round'} }),
    update(ref, data) { persistedVoucher = data.voucher; }
  });
  await run('saveVoucher({preventDefault(){}})'); assert.equal(persistedVoucher.value, 20);
  await run('saveVoucher(null,true)'); assert.equal(persistedVoucher, null);
  persistedVoucher = 'unchanged';
  run("currentUser={uid:'visitor'}");
  await run('saveVoucher(null,true)'); assert.equal(persistedVoucher, 'unchanged');
  run("currentUser={uid:'admin'};activeOrder={id:'voucher-round',open:true,voucher:{type:'percent',value:20}};renderVoucherForm()");
  assert.equal(element('voucher-section').hidden, false);
  assert.equal(element('voucher-form').hidden, true);
  assert.equal(element('toggle-voucher')['aria-expanded'], 'false');
  assert(element('voucher-toggle-label').textContent.includes('20%'));
  run('voucherExpanded=true;renderVoucherForm()');
  assert.equal(element('voucher-form').hidden, false);
  element('voucher-value').value = '30';
  run('renderVoucherForm()');
  assert.equal(element('voucher-value').value, '30');
  run('voucherExpanded=false;renderVoucherForm()');
  assert.equal(element('voucher-form').hidden, true);
  assert.equal(run('activeOrder.voucher.value'), 20);
  run("activeOrder={id:'new-round',open:true};renderVoucherForm()");
  assert.equal(element('voucher-form').hidden, true);
  run("currentUser={uid:'visitor'};renderVoucherForm()");
  assert.equal(element('voucher-section').hidden, true);
  const menu = [{id:'tea',name:'Tea',size:'L',price:25000},{id:'coffee',name:'Coffee',price:20000}];
  context.testMenu = menu;
  run("currentUser={uid:'visitor'};appState={adminUid:'admin',activeOrderId:'round'};activeOrder={id:'round',open:true,menu:testMenu};orderCart.clear();orderCart.set('tea',{quantity:2,note:'Less ice'});orderCart.set('coffee',{quantity:1,note:'No sugar'});renderOrderForm()");
  element('name-input').value = 'Visitor';
  assert(element('order-form-area').innerHTML.includes('type="checkbox"'));
  assert(element('order-composer').innerHTML.includes('70.000'));
  run("changeCartQuantity('tea',3)"); assert.equal(run('cartQuantity()'), 4);
  run("changeCartQuantity('tea',51)"); assert.equal(run('cartQuantity()'), 4);
  run("changeCartQuantity('tea',1.5)"); assert.equal(run('cartQuantity()'), 4);
  run("changeCartQuantity('tea',2)");
  let persistedEntries = [], menuNow = menu, isRoundOpen = true, serial = 0;
  context.doc = (_, ...parts) => parts.length ? {path:parts.join('/')} : {id:`entry-${serial++}`};
  context.serverTimestamp = () => 'timestamp';
  context.runTransaction = async (_, callback) => {
    const pending = [];
    await callback({
      get: async ref => ({exists:()=>true,data:()=>ref.path?.startsWith('orders/') ? {open:isRoundOpen,menu:menuNow} : {adminUid:'admin',activeOrderId:'round'}}),
      set(ref,data) {pending.push({ref,data});}
    });
    persistedEntries.push(...pending);
  };
  await run('submitOrder()');
  assert.equal(persistedEntries.length,3);
  assert.equal(new Set(persistedEntries.map(entry=>entry.ref.id)).size,3);
  assert.equal(persistedEntries.filter(entry=>entry.data.drink==='Tea').length,2);
  assert.equal(persistedEntries[0].data.note,'Less ice');
  assert.equal(persistedEntries[2].data.note,'No sugar');
  assert.equal(run('orderCart.size'),0);
  run("orderCart.set('tea',{quantity:2,note:'Keep draft'});orderCart.set('coffee',{quantity:1,note:''})");
  menuNow = [menu[0]];
  await run('submitOrder()');
  assert.equal(persistedEntries.length,3); assert.equal(run('orderCart.size'),2);
  menuNow = menu.map(item=>({...item,price:item.price+1000}));
  await run('submitOrder()'); assert.equal(persistedEntries.length,3);
  menuNow = menu; isRoundOpen = false;
  await run('submitOrder()'); assert.equal(persistedEntries.length,3);
  assert.equal(run('orderSubmitting'),false);
  run("changeCartQuantity('tea',0)"); assert.equal(run("orderCart.has('tea')"),false);
  const qrImage = 'data:image/png;base64,AAAA';
  context.qrData = {image:qrImage,recipient:'Name <script>',note:'Tên bạn + trà sữa'};
  assert.equal(run('validPaymentImage(qrData.image)'),true);
  assert.equal(run("validPaymentImage('https://example.com/qr.png')"),false);
  assert.equal(run("validPaymentImage('data:image/svg+xml;base64,AAAA')"),false);
  run("currentUser={uid:'admin'};appState={adminUid:'admin'};showSummaryContent('Summary','',voucherItems,null,qrData)");
  assert.equal(element('summary-payment').hidden,false);
  assert(element('summary-payment').innerHTML.includes(qrImage));
  assert(!element('summary-payment').innerHTML.includes('Name'));
  assert(!element('summary-payment').innerHTML.includes('<div>'));
  run("currentUser={uid:'visitor'};showSummaryContent('Summary','',voucherItems,null,qrData)");
  assert.equal(element('summary-payment').hidden,true);
  assert.equal(element('summary-payment').innerHTML,'');
  run("currentUser={uid:'admin'};showSummaryContent('Summary','',voucherItems,null,qrData);currentUser={uid:'visitor'};renderPaymentForm()");
  assert.equal(element('summary-payment').hidden,true);
  assert.equal(element('summary-payment').innerHTML,'');
  run("showSummaryContent('Summary','',voucherItems)");
  assert.equal(element('summary-payment').hidden,true);
  assert.equal(element('summary-payment').innerHTML,'');
  run("currentUser={uid:'admin'};appState={adminUid:'admin',activeOrderId:'qr-round'};activeOrder={id:'qr-round',open:true};renderPaymentForm();paymentImage=qrData.image;");
  let savedPayment = 'unchanged';
  context.runTransaction = async (_, callback) => callback({
    get: async ref => ({exists:()=>true,data:()=>ref.path?.startsWith('orders/') ? {open:true} : {adminUid:'admin',activeOrderId:'qr-round'}}),
    update(ref,data) { savedPayment = data.paymentQr; }
  });
  await run('savePaymentQr({preventDefault(){}})');
  assert.equal(savedPayment.image,qrImage); assert.equal(savedPayment.recipient,''); assert.equal(savedPayment.note,'');
  await run('savePaymentQr(null,true)'); assert.equal(savedPayment,null);
  savedPayment = 'unchanged'; run("currentUser={uid:'visitor'};renderPaymentForm()");
  assert.equal(element('payment-section').hidden,true);
  await run('savePaymentQr(null,true)'); assert.equal(savedPayment,'unchanged');
  run("currentUser={uid:'admin'};activeOrder.open=false;");
  await run('savePaymentQr(null,true)'); assert.equal(savedPayment,'unchanged');
  await assert.rejects(run("readPaymentImage({type:'image/svg+xml',size:10})"));
  await assert.rejects(run("readPaymentImage({type:'image/png',size:6000000})"));
  let resizedCanvas, imageDrawn = false;
  context.FileReader = class { readAsDataURL() { this.result = qrImage; this.onload(); } };
  context.Image = class { constructor() {this.naturalWidth=1200;this.naturalHeight=800;} set src(value) {this.onload();} };
  context.document.createElement = tag => {
    assert.equal(tag,'canvas');
    return resizedCanvas = {getContext:()=>({fillRect(){},drawImage(){imageDrawn=true;}}),toDataURL:()=>qrImage};
  };
  assert.equal(await run("readPaymentImage({type:'image/png',size:1000})"),qrImage);
  assert.equal(resizedCanvas.width,640);assert.equal(resizedCanvas.height,427);assert(imageDrawn);
  run("currentUser={uid:'admin'};appState={adminUid:'admin',activeOrderId:'paste-round'};activeOrder={id:'paste-round',open:true};renderPaymentForm()");
  let pastePrevented = false;
  context.pasteEvent = {target:element('payment-paste'),clipboardData:{items:[{kind:'file',type:'image/png',getAsFile:()=>({type:'image/png',size:1000})}]},preventDefault(){pastePrevented=true;}};
  await run('pastePaymentImage(pasteEvent)');
  assert(pastePrevented);assert.equal(run('paymentImage'),qrImage);
  assert.equal(element('payment-preview').hidden,false);
  pastePrevented = false;
  context.pasteEvent = {target:element('payment-paste'),clipboardData:{items:[]},preventDefault(){pastePrevented=true;}};
  await run('pastePaymentImage(pasteEvent)');assert(pastePrevented);
  run("currentUser={uid:'visitor'};paymentImage=''");
  context.pasteEvent.clipboardData.items = [{kind:'file',type:'image/png',getAsFile:()=>({type:'image/png',size:1000})}];
  await run('pastePaymentImage(pasteEvent)');assert.equal(run('paymentImage'),'');
  console.log('PASS: Excel/CSV/TSV, headers, prices, quotes, invalid rows, limit, duplicates, atomic import, escaping, and failure draft retention.');
  console.log('PASS: separate order/menu dialogs, draft preservation, admin-only checkout, permission revocation, and no duplicate checkout.');
  console.log('PASS: owner/admin cancellation, forbidden users, transactional ownership recheck, closed rounds, pending-state cleanup.');
  console.log('PASS: summary with 10 people and multiple drinks, duplicate quantities, subtotals, different notes, same UID/name changes, unknown prices, and empty state.');
  console.log('PASS: full-form PNG clipboard copy, immediate permission request, no download, long content, unsupported browser, permission denial and failure cleanup.');
  console.log('PASS: voucher amount/percent, proportional allocation, exact rounding, totals, unknown prices, summary, persistence, removal and admin guard.');
  console.log('PASS: voucher collapse/expand, retained discount and draft, new-round reset and visitor visibility.');
  console.log('PASS: multi-item ordering, quantities, per-item notes, cart total, realtime preservation, bounds, atomic submission, unique entries and failures retaining drafts.');
  console.log('PASS: image-only QR summary, safe sources, persistence/removal, admin-only edits, closed rounds, image validation, resizing, image paste and non-image clipboard.');
})().catch(error => { console.error(error); process.exitCode = 1; });
