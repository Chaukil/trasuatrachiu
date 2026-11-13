import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
    import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
    import {
      getFirestore, collection, doc, getDoc, getDocs, limit, onSnapshot,
      orderBy, query, runTransaction, serverTimestamp, setDoc, updateDoc,
      writeBatch
    } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

    const firebaseConfig = {
      apiKey: "AIzaSyBw_Boa0WHaI-w1vjC0SUyaP2M0dzN0QAg",
      authDomain: "trasuatrachiu.firebaseapp.com",
      projectId: "trasuatrachiu",
      storageBucket: "trasuatrachiu.firebasestorage.app",
      messagingSenderId: "768249740284",
      appId: "1:768249740284:web:fc7219ce53fbe7e6a89079",
      measurementId: "G-P8BGNRD8EJ"
    };

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const stateRef = doc(db, "app", "state");
    const ordersRef = collection(db, "orders");
    const requestsRef = collection(db, "adminRequests");
    const $ = (id) => document.getElementById(id);

    let currentUser = null;
    let appState = null;
    let activeOrder = null;
    let activeOrderId = null;
    let entries = [];
    let history = [];
    let requests = [];
    let myRequest = null;
    let stateUnsubscribe = null;
    let activeOrderUnsubscribe = null;
    let entriesUnsubscribe = null;
    let historyUnsubscribe = null;
    let requestsUnsubscribe = null;
    let myRequestUnsubscribe = null;
    let signInStarted = false;
    let selectedShopId = "";
    let editorShopId = null;
    let chosenItemId = "";
    const bulkDrafts = new Map();
    let bulkSaving = false;
    const cancellingEntries = new Set();
    let captureRendererPromise;
    let summaryCapturing = false;
    let toastTimer;
    try { $("name-input").value = localStorage.getItem("drink-order-name") || ""; } catch {}
    $("save-name").addEventListener("click", () => {
      if (!displayName()) return showToast("Hãy nhập tên của bạn.", true);
      try { localStorage.setItem("drink-order-name", displayName()); showToast("Đã lưu tên."); }
      catch { showToast("Trình duyệt không cho phép lưu tên.", true); }
    });
    function showToast(message, isError = false) {
      const toast = $("toast");
      toast.innerHTML = `<span class="toast-icon" aria-hidden="true">${isError ? "!" : "✓"}</span><div><strong>${isError ? "Cần kiểm tra một chút" : "Xong rồi nhé!"}</strong><p>${escapeHtml(message)}</p></div><button class="toast-close" type="button" aria-label="Đóng thông báo">×</button>`;
      toast.querySelector("button").addEventListener("click", () => toast.classList.remove("show"));
      toast.classList.toggle("error", isError);
      toast.classList.add("show");
      toast.hidePopover?.();
      toast.showPopover?.();
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove("show"), 3600);
    }

    function showError(message) {
      const banner = $("error-banner");
      banner.textContent = message;
      banner.classList.add("visible");
    }

    function clearError() {
      $("error-banner").classList.remove("visible");
    }

    function errorMessage(error) {
      const messages = {
        "permission-denied": "Firebase từ chối quyền truy cập. Hãy bật đăng nhập ẩn danh và dán Firestore Rules vào Firebase Console.",
        "unauthorized-domain": "Tên miền hiện tại chưa được cho phép trong Firebase Authentication.",
        "unavailable": "Không kết nối được Firebase. Kiểm tra mạng rồi thử lại.",
        "failed-precondition": "Firestore chưa được thiết lập đầy đủ. Kiểm tra database và cấu hình Firebase."
      };
      return messages[error?.code] || `Không thể hoàn tất thao tác: ${error?.message || "Lỗi không xác định"}`;
    }

    function handleError(error) {
      console.error(error);
      showToast(errorMessage(error), true);
    }

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      })[char]);
    }

    function displayName() {
      return $("name-input").value.trim();
    }

    function askDialog({ title, message, input = false, danger = false, confirmText = "Xác nhận" }) {
      return new Promise(resolve => {
        const dialog = $("action-dialog");
        const previousFocus = document.activeElement;
        $("action-title").textContent = title;
        $("action-description").textContent = message;
        $("action-icon").textContent = input ? "＋" : danger ? "!" : "✓";
        dialog.classList.toggle("is-danger", danger);
        $("action-field").hidden = !input;
        $("action-input").value = "";
        $("action-error").textContent = "";
        $("action-submit").textContent = confirmText;
        $("action-submit").className = danger ? "danger" : "primary";
        const finish = value => { dialog.close(); resolve(value); previousFocus?.focus(); };
        $("action-form").onsubmit = event => {
          event.preventDefault();
          const value = $("action-input").value.trim();
          if (input && !value) {
            $("action-error").textContent = "Bạn hãy nhập tên quán nhé.";
            $("action-input").focus();
            return;
          }
          finish(input ? value : true);
        };
        $("action-cancel").onclick = $("action-close").onclick = () => finish(null);
        dialog.oncancel = event => { event.preventDefault(); finish(null); };
        dialog.onclick = event => { if (event.target === dialog) {
          const rect = dialog.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) finish(null);
        } };
        dialog.showModal();
        (input ? $("action-input") : $("action-cancel")).focus();
      });
    }

    function readableDate(value) {
      if (!value) return "Vừa xong";
      const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
      if (Number.isNaN(date.getTime())) return "Vừa xong";
      return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
    }

    function setOrderListeners(orderId) {
      if (activeOrderId === orderId) return;
      activeOrderId = orderId;
      chosenItemId = "";
      activeOrder = null;
      entries = [];
      activeOrderUnsubscribe?.();
      entriesUnsubscribe?.();
      activeOrderUnsubscribe = null;
      entriesUnsubscribe = null;
      if (!orderId) {

        render();
        return;
      }

      activeOrderUnsubscribe = onSnapshot(doc(db, "orders", orderId), (snapshot) => {
        activeOrder = snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;

        render();
      }, handleError);
      entriesUnsubscribe = onSnapshot(collection(db, "orders", orderId, "entries"), (snapshot) => {
        entries = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
          .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
        render();
      }, handleError);
    }

    function bindAdminRequests() {
      const isAdmin = appState?.adminUid === currentUser?.uid;
      if (isAdmin && !requestsUnsubscribe) {
        myRequestUnsubscribe?.();
        myRequestUnsubscribe = null;
        requestsUnsubscribe = onSnapshot(requestsRef, (snapshot) => {
          requests = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
            .filter((request) => request.status === "pending");
          render();
        }, handleError);
      } else if (!isAdmin && requestsUnsubscribe) {
        requestsUnsubscribe();
        requestsUnsubscribe = null;
        requests = [];
      }
      if (!isAdmin && !myRequestUnsubscribe) {
        myRequestUnsubscribe = onSnapshot(doc(db, "adminRequests", currentUser.uid), (snapshot) => {
          myRequest = snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
          render();
        }, handleError);
      } else if (isAdmin) {
        myRequest = null;
      }
    }

    async function ensureState() {
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(stateRef);
        if (!snapshot.exists()) {
          transaction.set(stateRef, { adminUid: null, adminName: null, activeOrderId: null });
        }
      });
    }

    function startAppListeners() {
      if (stateUnsubscribe) return;
      stateUnsubscribe = onSnapshot(stateRef, (snapshot) => {
        appState = snapshot.exists() ? snapshot.data() : null;
        const id = appState?.activeOrderId || null;
        setOrderListeners(id);
        bindAdminRequests();
        clearError();
        $("connection-label").textContent = "Đang đồng bộ";
        render();
      }, (error) => {
        $("connection-label").textContent = "Mất kết nối";
        showError(errorMessage(error));
        handleError(error);
      });
      historyUnsubscribe = onSnapshot(query(ordersRef, orderBy("createdAt", "desc"), limit(30)), (snapshot) => {
        history = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((order) => !order.open);
        renderHistory();
      }, handleError);
    }

    const money = value => value == null ? "Chưa có giá" : new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(value);
    const normalizeMenu = (menu = []) => menu.map((item, i) => typeof item === "string" ? { id: "legacy-" + i, name: item, price: null, size: "" } : item);
    const label = item => item.name + (item.size ? " · Size " + item.size : "") + " · " + money(item.price);
    const shops = () => appState?.shops || [];
    const selectedShop = () => shops().find(shop => shop.id === selectedShopId);

    function groupMenu(menu) {
      const groups = new Map();
      for (const item of normalizeMenu(menu)) {
        const category = item.category?.trim() || "Món khác";
        if (!groups.has(category)) groups.set(category, []);
        groups.get(category).push(item);
      }
      return [...groups];
    }

    function categoryIcon(category) {
      const text = category.toLocaleLowerCase("vi");
      if (/coffee|cà phê/.test(text)) return "☕";
      if (/matcha|trà/.test(text)) return "🍵";
      if (/ép|trái cây|rau má|dừa/.test(text)) return "🥥";
      if (/chua|topping/.test(text)) return "🍨";
      return "🧋";
    }

    function menuEditor(shop) {
      return `<div class="menu-editor"><div><span class="eyebrow">MENU CỦA QUÁN</span><h3 class="card-title">${escapeHtml(shop.name)}</h3><p class="card-subtitle">Nhóm món theo danh mục để mọi người dễ chọn.</p></div>
        <div class="editor-groups">${groupMenu(shop.menu).map(([category, items]) => `<div><h4>${escapeHtml(category)} <span>${items.length}</span></h4>${items.map(item => `<div class="editor-item"><span>${escapeHtml(item.name)}${item.size ? ` <small>Size ${escapeHtml(item.size)}</small>` : ""}</span><strong>${money(item.price)}</strong></div>`).join("")}</div>`).join("") || '<div class="notice">Menu còn trống. Thêm món đầu tiên bên dưới nhé.</div>'}</div>
        ${bulkEditor(shop)}
        <form id="add-menu-form" class="admin-content" novalidate>
          <div class="field"><label for="item-category">Danh mục</label><input id="item-category" class="control" list="category-options" maxlength="60" placeholder="Ví dụ: Trà, Cà phê, Matcha…"><datalist id="category-options">${[...new Set(["Trà", "Cà phê", "Cacao", "Matcha", "Rau má / Dừa", "Sữa chua", "Nước ép", "Topping", ...groupMenu(shop.menu).map(([name]) => name)])].map(name => `<option value="${escapeHtml(name)}"></option>`).join("")}</datalist><span class="card-subtitle">Chọn danh mục có sẵn hoặc nhập tên mới.</span></div>
          <div class="field"><label for="item-name">Tên món</label><input id="item-name" class="control" maxlength="100" placeholder="Ví dụ: Trà đào cam sả" required></div>
          <div class="form-row"><div class="field"><label for="item-price">Giá (đồng)</label><input id="item-price" class="control" type="number" min="0" max="100000000" step="1" placeholder="25000" required></div><div class="field"><label for="item-size">Size (nếu có)</label><input id="item-size" class="control" maxlength="30" placeholder="M, L…"></div></div><button class="primary" type="submit">＋ Thêm món vào menu</button>
        </form></div>`;
    }

    function parseBulkMenu(text) {
      const errors = [], items = [];
      if (text.length > 100000) return { items, errors: ["Nội dung quá dài. Chỉ nhập tối đa 100 món mỗi lần."] };
      const firstLine = text.split(/\r?\n/).find(line => line.trim()) || "";
      const delimiter = firstLine.includes("\t") ? "\t" : firstLine.includes(";") ? ";" : ",";
      const rows = [];
      let row = [], cell = "", quoted = false, line = 1, rowLine = 1;
      const pushRow = () => { row.push(cell); if (row.some(value => value.trim())) rows.push({ cells: row, line: rowLine }); row = []; cell = ""; };
      text = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
          if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
          else if (quoted || !cell.trim()) quoted = !quoted;
          else cell += char;
        } else if (char === delimiter && !quoted) { row.push(cell); cell = ""; }
        else if (char === "\n") { if (quoted) cell += char; else pushRow(); line++; if (!quoted) rowLine = line; }
        else cell += char;
      }
      pushRow();
      if (quoted) return { items: [], errors: ["Dấu ngoặc kép chưa đóng. Hãy kiểm tra nội dung đã dán."] };
      const headerKey = value => value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
      if (rows.length && ["danh muc", "category"].includes(headerKey(rows[0].cells[0])) && ["ten mon", "name"].includes(headerKey(rows[0].cells[1] || ""))) rows.shift();
      for (const { cells, line } of rows) {
        if (cells.length < 3 || cells.length > 4) { errors.push(`Dòng ${line}: cần 3 hoặc 4 cột: Danh mục, Tên món, Giá, Size.`); continue; }
        const [rawCategory, name, rawPrice, size = ""] = cells.map(value => value.trim());
        const category = rawCategory || "Món khác";
        const priceText = rawPrice.toLowerCase().replace(/\s|₫|đ|vnd/g, "");
        let price = NaN;
        if (/^\d+(?:[.,]\d+)?k$/.test(priceText)) price = Number(priceText.slice(0, -1).replace(",", ".")) * 1000;
        else if (/^\d+$/.test(priceText)) price = Number(priceText);
        else if (/^\d{1,3}(?:[.,]\d{3})+$/.test(priceText)) price = Number(priceText.replace(/[.,]/g, ""));
        if (!name || name.length > 100 || category.length > 60 || size.length > 30 || /[\r\n]/.test(name + category + size)) errors.push(`Dòng ${line}: tên món bắt buộc (tối đa 100 ký tự), danh mục tối đa 60, size tối đa 30.`);
        else if (!Number.isSafeInteger(price) || price < 0 || price > 100000000) errors.push(`Dòng ${line}: giá không hợp lệ. Ví dụ: 25000, 25.000 hoặc 25k.`);
        else items.push({ category, name, price, size });
      }
      if (!rows.length) errors.push("Chưa có dữ liệu. Hãy dán các dòng từ Excel.");
      if (rows.length > 100) errors.push("Chỉ nhập tối đa 100 dòng món mỗi lần.");
      return { items, errors };
    }

    function mergeBulkMenu(menu, incoming) {
      const result = normalizeMenu(menu);
      const key = item => JSON.stringify([item.category || "Món khác", item.name, item.size || "", item.price]);
      const keys = new Set(result.map(key));
      let skipped = 0;
      for (const item of incoming) {
        if (keys.has(key(item))) { skipped++; continue; }
        keys.add(key(item)); result.push(item);
      }
      if (result.length > 100) throw new Error("Menu sau khi nhập vượt 100 món. Hãy giảm số dòng nhập.");
      return { menu: result, added: result.length - (menu || []).length, skipped };
    }

    function bulkEditor(shop) {
      const draft = bulkDrafts.get(shop.id) || { text: "", preview: false };
      return `<section class="bulk-editor"><div><h4>▦ Nhập nhanh từ Excel</h4><p>Copy các ô trong Excel và dán bên dưới, hoặc chọn file CSV/TSV. Các cột theo thứ tự: <strong>Danh mục · Tên món · Giá · Size</strong> (size có thể bỏ trống).</p></div>
        <div class="bulk-example">Trà sữa ⇥ Trà sữa truyền thống ⇥ 25000 ⇥ M<br>Matcha ⇥ Matcha latte ⇥ 30k ⇥ L</div>
        <label class="secondary file-picker">Chọn file CSV / TSV<input id="bulk-file" type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"></label>
        <label class="field" for="bulk-text"><span>Dán bảng menu</span><textarea id="bulk-text" class="control menu-textarea" maxlength="100000" placeholder="Dán các ô từ Excel vào đây…">${escapeHtml(draft.text)}</textarea></label>
        <p class="card-subtitle">Giá: 25000, 25.000 hoặc 25k đều là 25.000đ. Có thể kèm dòng tiêu đề. File .xlsx: mở bằng Excel rồi copy các ô.</p>
        <button id="bulk-preview" class="secondary" type="button" ${bulkSaving ? "disabled" : ""}>Xem trước dữ liệu</button><div id="bulk-preview-area">${draft.preview ? bulkPreview(shop, draft.text) : ""}</div></section>`;
    }

    function bulkPreview(shop, text) {
      const parsed = parseBulkMenu(text);
      let merged;
      if (!parsed.errors.length) {
        try { merged = mergeBulkMenu(shop.menu || [], parsed.items); }
        catch (error) { parsed.errors.push(error.message); }
      }
      return `${parsed.errors.length ? `<div class="bulk-errors" role="alert"><strong>Chưa thể nhập menu</strong><ul>${parsed.errors.map(error => `<li>${escapeHtml(error)}</li>`).join("")}</ul></div>` : `<p class="notice">Sẽ thêm <strong>${merged.added} món</strong> · Bỏ qua ${merged.skipped} dòng trùng hoàn toàn. Các món hiện có được giữ lại.</p>`}
        ${parsed.items.length ? `<div class="bulk-table-wrap"><table class="bulk-table"><thead><tr><th>Danh mục</th><th>Tên món</th><th>Giá</th><th>Size</th></tr></thead><tbody>${parsed.items.map(item => `<tr><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.name)}</td><td>${money(item.price)}</td><td>${escapeHtml(item.size) || "—"}</td></tr>`).join("")}</tbody></table></div>` : ""}
        <button id="bulk-import" class="primary full" type="button" ${parsed.errors.length || !merged?.added || bulkSaving ? "disabled" : ""}>${bulkSaving ? "Đang lưu…" : "Thêm các món vào menu"}</button>`;
    }

    function bindBulkEditor(shop) {
      if (!$("bulk-text")) return;
      $("bulk-text").addEventListener("input", event => {
        bulkDrafts.set(shop.id, { text: event.target.value, preview: false });
        $("bulk-preview-area").innerHTML = "";
      });
      $("bulk-preview").addEventListener("click", () => {
        bulkDrafts.set(shop.id, { text: $("bulk-text").value, preview: true });
        render();
      });
      $("bulk-import")?.addEventListener("click", () => importBulkMenu(shop.id));
      $("bulk-file").addEventListener("change", async event => {
        const file = event.target.files[0];
        if (!file) return;
        if (!/\.(csv|tsv|txt)$/i.test(file.name) || file.size > 500000) return showToast("Chọn file CSV/TSV/TXT tối đa 500 KB, mã hóa UTF-8.", true);
        try {
          const text = await file.text();
          bulkDrafts.set(shop.id, { text, preview: true });
          if (editorShopId === shop.id) render();
        } catch { showToast("Không đọc được file. Hãy thử copy các ô từ Excel.", true); }
      });
    }

    async function importBulkMenu(shopId) {
      if (bulkSaving) return;
      const draft = bulkDrafts.get(shopId);
      if (!draft?.preview) return;
      const parsed = parseBulkMenu(draft.text);
      if (parsed.errors.length) return showToast("Sửa các dòng lỗi trước khi nhập menu.", true);
      const incoming = parsed.items.map(item => ({ ...item, id: doc(ordersRef).id }));
      let result;
      bulkSaving = true;
      render();
      try {
        await updateShops(shops => {
          if (!shops.some(shop => shop.id === shopId)) throw new Error("Quán không còn tồn tại.");
          return shops.map(shop => {
            if (shop.id !== shopId) return shop;
            result = mergeBulkMenu(shop.menu || [], incoming);
            return { ...shop, menu: result.menu };
          });
        });
        if (bulkDrafts.get(shopId)?.text === draft.text) bulkDrafts.delete(shopId);
        showToast(`Đã thêm ${result.added} món · bỏ qua ${result.skipped} dòng trùng.`);
      } catch (error) { handleError(error); }
      finally { bulkSaving = false; render(); }
    }

    function renderOrderForm() {
      const status = $("order-status");
      const tag = $("round-tag");
      const area = $("order-form-area");
      const menu = normalizeMenu(activeOrder?.menu);
      $("open-order-dialog").disabled = !activeOrder?.open || !menu.length;

      if (!appState?.activeOrderId) {
        status.textContent = appState ? "Chưa có đợt đặt nào đang mở." : "Đang khởi tạo...";
        tag.className = "tag gray";
        tag.textContent = "Chưa mở";
        area.innerHTML = `<div class="empty-state"><div class="empty-icon">🫖</div><div class="empty-title">Chưa mở đợt đặt</div><div class="empty-copy">Khi admin mở đơn, menu của quán sẽ xuất hiện ở đây.</div></div>`;
        return;
      }
      if (!activeOrder) {
        status.textContent = "Đang tải menu và đơn hàng...";
        tag.className = "tag orange";
        tag.textContent = "Đang tải";
        area.innerHTML = `<div class="empty-state"><div class="empty-icon">⏳</div><div class="empty-title">Đang tải đợt đặt</div></div>`;
        return;
      }
      if (!activeOrder.open) {
        status.textContent = "Đợt đặt đã kết thúc.";
        tag.className = "tag gray";
        tag.textContent = "Đã đóng";
        area.innerHTML = `<div class="empty-state"><div class="empty-icon">🔒</div><div class="empty-title">Đợt đặt đã kết thúc</div><div class="empty-copy">Đơn đã được lưu vào lịch sử. Chờ admin mở đợt mới nhé.</div></div>`;
        return;
      }
      status.textContent = `${activeOrder.shopName || "Đợt đặt"} · ${readableDate(activeOrder.createdAt)}`;
      tag.className = "tag";
      tag.textContent = "● Đang nhận đơn";
      if (!menu.length) {
        area.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Menu đang trống</div><div class="empty-copy">Admin cần thêm món vào menu trước khi mọi người đặt.</div></div>`;
        return;
      }
      if (!menu.some(item => item.id === chosenItemId)) chosenItemId = "";
      area.innerHTML = `<div class="menu-sheet"><div class="menu-masthead"><div><span class="eyebrow">THỰC ĐƠN HÔM NAY</span><h3>${escapeHtml(activeOrder.shopName || "Menu của quán")}</h3></div><span class="menu-stamp" aria-hidden="true">🍵</span></div><p class="menu-help">Chạm vào món bạn thích · Giá tính bằng đồng</p>
        <div class="menu-columns">${groupMenu(menu).map(([category, items]) => `<section class="menu-category"><div class="category-heading"><h4>${escapeHtml(category)}</h4><span aria-hidden="true">${categoryIcon(category)}</span></div><div class="menu-items">${items.map(item => `<label class="menu-item"><input type="radio" name="menu-item" value="${escapeHtml(item.id)}" ${chosenItemId === item.id ? "checked" : ""}><span class="menu-item-name">${escapeHtml(item.name)}${item.size ? `<small>Size ${escapeHtml(item.size)}</small>` : ""}</span><span class="menu-item-price">${money(item.price)}</span><span class="menu-item-check" aria-hidden="true">＋</span></label>`).join("")}</div></section>`).join("")}</div></div>
        <div class="order-composer"><div id="selected-drink" class="selected-drink" aria-live="polite">${chosenItemId ? escapeHtml(label(menu.find(item => item.id === chosenItemId))) : "Chọn một món trên menu để đặt nhé"}</div><div class="field"><label for="order-note">Ghi chú món <span class="optional">(nếu có)</span></label><input id="order-note" class="control" maxlength="300" placeholder="Ít đá, 50% đường…"></div><button class="primary full order-submit" id="submit-order" type="button" ${chosenItemId ? "" : "disabled"}>＋ Thêm vào đơn</button></div>`;
      area.querySelectorAll('input[name="menu-item"]').forEach(input => input.addEventListener("change", () => {
        chosenItemId = input.value;
        $("selected-drink").textContent = label(menu.find(item => item.id === chosenItemId));
        $("submit-order").disabled = false;
      }));
      $("submit-order").addEventListener("click", submitOrder);
    }

    function renderEntries() {
      $("close-order").hidden = !(currentUser && appState?.adminUid === currentUser.uid && activeOrder?.open);
      $("entry-count").textContent = `${entries.length} món đã đặt`;
      $("entries-total").hidden = !activeOrder || !entries.length;
      $("entries-total").innerHTML = `<div><span>Tổng tiền</span>${entries.some(item => item.price == null) ? '<small>Chưa gồm món chưa có giá</small>' : ""}</div><strong>${money(entries.reduce((sum, item) => sum + (item.price || 0), 0))}</strong>`;
      $("summary-button").disabled = !activeOrder || entries.length === 0;
      if (!activeOrder || entries.length === 0) {
        $("entries-area").innerHTML = `<div class="empty-state"><div class="empty-icon">🥤</div><div class="empty-title">Chưa có món nào</div><div class="empty-copy">Hãy là người đầu tiên chọn món nhé!</div></div>`;
        return;
      }
      $("entries-area").innerHTML = `<div class="entries">${entries.map((entry, index) => `
        <div class="entry"><div><div class="entry-name">${escapeHtml(entry.name)}</div><div class="entry-drink">${escapeHtml(entry.drink)}${entry.size ? ` · Size ${escapeHtml(entry.size)}` : ""}</div><div class="price-badge">${money(entry.price)}</div>${entry.note ? `<div class="card-subtitle">Ghi chú: ${escapeHtml(entry.note)}</div>` : ""}</div><div class="entry-controls"><span class="entry-no">#${String(index + 1).padStart(2, "0")}</span>${canCancelEntry(entry) ? `<button class="danger cancel-entry" type="button" data-entry-id="${escapeHtml(entry.id)}" aria-label="Hủy ${escapeHtml(entry.drink)} của ${escapeHtml(entry.name)}" ${cancellingEntries.has(entry.id) ? "disabled" : ""}>${cancellingEntries.has(entry.id) ? "Đang hủy…" : "Hủy món"}</button>` : ""}</div></div>
      `).join("")}</div>`;
      $("entries-area").querySelectorAll(".cancel-entry").forEach(button => button.addEventListener("click", () => cancelEntry(button.dataset.entryId)));
    }

    function canCancelEntry(entry) {
      return Boolean(currentUser && activeOrder?.open && appState?.activeOrderId === activeOrder.id
        && (entry.uid === currentUser.uid || appState.adminUid === currentUser.uid));
    }

    async function cancelEntry(entryId) {
      const orderId = appState?.activeOrderId;
      const entry = entries.find(item => item.id === entryId);
      if (!entry || !canCancelEntry(entry)) return showToast("Bạn chỉ được hủy món mình đặt khi đợt đặt còn mở.", true);
      if (cancellingEntries.has(entryId)) return;
      cancellingEntries.add(entryId);
      renderEntries();
      try {
        if (!await askDialog({ title: "Hủy món này?", message: `${entry.name} · ${entry.drink}${entry.size ? ` · Size ${entry.size}` : ""}. Món sẽ được bỏ khỏi đơn và tổng tiền được cập nhật.`, danger: true, confirmText: "Hủy món" })) return;
        await runTransaction(db, async transaction => {
          const entryRef = doc(db, "orders", orderId, "entries", entryId);
          const [stateSnapshot, orderSnapshot, entrySnapshot] = await Promise.all([
            transaction.get(stateRef), transaction.get(doc(db, "orders", orderId)), transaction.get(entryRef)
          ]);
          if (!stateSnapshot.exists() || stateSnapshot.data().activeOrderId !== orderId || !orderSnapshot.exists() || !orderSnapshot.data().open) throw new Error("Đơn đã chốt hoặc đợt đặt đã thay đổi. Không thể hủy món.");
          if (!entrySnapshot.exists()) throw new Error("Món này đã được hủy trước đó.");
          if (!currentUser || (entrySnapshot.data().uid !== currentUser.uid && stateSnapshot.data().adminUid !== currentUser.uid)) throw new Error("Bạn không có quyền hủy món của người khác.");
          transaction.delete(entryRef);
        });
        showToast("Đã hủy món khỏi đơn.");
      } catch (error) { handleError(error); }
      finally { cancellingEntries.delete(entryId); renderEntries(); }
    }

    function renderAdmin() {
      const area = $("admin-area");
      const tag = $("admin-tag");
      if (!currentUser || !appState) {
        area.innerHTML = `<div class="notice">Đang kết nối với Firebase...</div>`;
        return;
      }

      if (!appState.adminUid) {
        tag.className = "tag gray";
        tag.textContent = "Đang trống";
        area.innerHTML = `
          <div class="notice">Chưa có người điều phối. Bạn có thể nhận quyền admin để nhập menu và mở đợt đặt.</div>
          <button class="primary full" id="claim-admin" type="button">♛ Nhận quyền admin</button>
          <div class="admin-id">Tài khoản này: ${escapeHtml(currentUser.uid.slice(0, 12))}…</div>`;
        $("claim-admin").addEventListener("click", claimAdmin);
        return;
      }

      if (appState.adminUid !== currentUser.uid) {
        tag.className = "tag orange";
        tag.textContent = "Có admin";
        const pending = myRequest?.status === "pending";
        const rejected = myRequest?.status === "rejected";
        area.innerHTML = `
          <div class="notice"><strong>${escapeHtml(appState.adminName || "Admin")}</strong> đang điều phối${appState.activeOrderId ? " · đợt đặt đang mở" : ""}. Mỗi thời điểm chỉ có một admin.</div>
          ${pending
            ? `<button class="secondary full" id="cancel-request" type="button">Đã gửi yêu cầu · Hủy yêu cầu</button>`
            : `<button class="primary full" id="request-admin" type="button">✉ ${rejected ? "Gửi lại yêu cầu admin" : "Xin chuyển quyền admin"}</button>`}
          <div class="admin-id">Tài khoản này: ${escapeHtml(currentUser.uid.slice(0, 12))}…</div>`;
        $("request-admin")?.addEventListener("click", requestAdmin);
        $("cancel-request")?.addEventListener("click", cancelAdminRequest);
        return;
      }

      tag.className = "tag";
      tag.textContent = "♛ Bạn là admin";
      const open = Boolean(appState.activeOrderId);
      const pendingRequests = requests.filter((request) => request.status === "pending");
      const requestMarkup = pendingRequests.length
        ? `<div><div class="field"><label>Yêu cầu chuyển quyền (${pendingRequests.length})</label></div><div class="request-list">${pendingRequests.map((request) => `
            <div class="request-row"><div class="request-person"><strong>${escapeHtml(request.name)}</strong><span>Đã gửi ${readableDate(request.createdAt)}</span></div><div class="request-actions"><button class="secondary approve-request" data-uid="${escapeHtml(request.uid)}" type="button" ${open ? "disabled" : ""}>Chuyển quyền</button><button class="text-button reject-request" data-uid="${escapeHtml(request.uid)}" type="button">Từ chối</button></div></div>
          `).join("")}</div>${open ? `<div class="card-subtitle" style="margin-top:7px">Đóng đợt đặt trước khi chuyển quyền admin.</div>` : ""}</div>`
        : "";
      if (open && activeOrder?.shopId) selectedShopId = activeOrder.shopId;
      if (!selectedShop()) selectedShopId = shops()[0]?.id || "";
      const shop = selectedShop();
      area.innerHTML = `
        <div class="field"><label for="shop-select">Chọn quán</label><select id="shop-select" class="control" ${open ? "disabled" : ""}><option value="">Chọn quán</option>${shops().map(item => '<option value="' + escapeHtml(item.id) + '" ' + (item.id === selectedShopId ? 'selected' : '') + '>' + escapeHtml(item.name) + '</option>').join("")}</select></div>
        <div class="toolbar"><button class="secondary" id="add-shop" type="button">＋ Thêm quán</button><button class="secondary" id="edit-menu" type="button" ${!shop ? "disabled" : ""}>＋ Nhập món / Menu</button></div>
        <div class="toolbar">${open ? '<button class="danger" id="clear-order" type="button">Xóa đơn hiện tại</button>' : '<button class="primary" id="open-order" type="button" ' + (!shop ? 'disabled' : '') + '>Mở đợt đặt</button>'}</div>
        ${requestMarkup}
        ${!open ? '<button class="text-button" id="release-admin" type="button">Nhường quyền admin</button>' : ""}`;
      $("shop-select").addEventListener("change", event => { selectedShopId = event.target.value; renderAdmin(); });
      $("edit-menu").addEventListener("click", () => {
        editorShopId = shop.id;
        renderMenuDialog();
        $("menu-dialog").showModal();
      });
      $("add-shop").addEventListener("click", addShop);
      $("open-order")?.addEventListener("click", openOrder);
      $("clear-order")?.addEventListener("click", clearCurrentOrder);
      $("release-admin")?.addEventListener("click", releaseAdmin);
      area.querySelectorAll(".approve-request").forEach((button) => button.addEventListener("click", () => approveRequest(button.dataset.uid)));
      area.querySelectorAll(".reject-request").forEach((button) => button.addEventListener("click", () => rejectRequest(button.dataset.uid)));
    }

    function renderMenuDialog() {
      const shop = shops().find(item => item.id === editorShopId);
      if (!shop || !currentUser || appState?.adminUid !== currentUser.uid) {
        if ($("menu-dialog").open) $("menu-dialog").close();
        $("menu-dialog-area").innerHTML = "";
        return;
      }
      $("menu-dialog-area").innerHTML = menuEditor(shop);
      $("add-menu-form").addEventListener("submit", addMenuItem);
      bindBulkEditor(shop);
    }

    function renderHistory() {
      $("history-count").textContent = `${history.length} đợt`;
      if (!history.length) {
        $("history-area").innerHTML = `<div class="history-empty">Chưa có đợt đặt nào được lưu.</div>`;
        return;
      }
      $("history-area").innerHTML = `<div class="history-list">${history.map((order) => `
        <div class="history-item"><div><div class="history-date">${readableDate(order.closedAt || order.createdAt)}</div><div class="history-detail">${(order.menu || []).length} món trong menu · ${escapeHtml(order.ownerName || "Admin")}</div></div><button class="text-button history-summary" data-order-id="${escapeHtml(order.id)}" type="button">Xem đơn →</button></div>
      `).join("")}</div>`;
      $("history-area").querySelectorAll(".history-summary").forEach((button) => button.addEventListener("click", () => showHistorySummary(button.dataset.orderId)));
    }

    function render() {
      const draft = Object.fromEntries(["order-note", "item-name", "item-price", "item-size", "item-category"].map(id => [id, $(id)?.value]));
      renderOrderForm();
      renderEntries();
      renderAdmin();
      renderMenuDialog();
      for (const [id, value] of Object.entries(draft)) {
        if ($(id) && value !== undefined) $(id).value = value;
      }
    }

    function summarize(items) {
      const byDrink = new Map();
      for (const item of items) {
        const key = item.drink + (item.size ? " · Size " + item.size : "") + " · " + money(item.price);
        const current = byDrink.get(key) || { count: 0, names: [] };
        current.count += 1;
        current.names.push(item.name + (item.note ? " (" + item.note + ")" : ""));
        byDrink.set(key, current);
      }
      return [...byDrink.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0], "vi"));
    }

    function showSummaryContent(title, subtitle, items) {
      $("modal-title").textContent = title;
      $("modal-subtitle").textContent = subtitle;
      const summary = summarize(items);
      const people = new Map();
      for (const item of items) {
        const key = item.uid ? `uid:${item.uid}` : `name:${item.name}`;
        if (!people.has(key)) people.set(key, { name: item.name, drinks: new Map() });
        const drinks = people.get(key).drinks;
        const drinkKey = JSON.stringify([item.drink, item.size || "", item.price ?? null, item.note || ""]);
        if (!drinks.has(drinkKey)) drinks.set(drinkKey, { ...item, count: 0 });
        drinks.get(drinkKey).count++;
      }
      $("summary-overview").textContent = `${people.size} người · ${items.length} món · ${summary.length} loại`;
      $("summary-tools").hidden = !items.length;
      $("modal-content").innerHTML = items.length
        ? `<div class="people-summary">${[...people.values()].map((person, index) => {
          const drinks = [...person.drinks.values()];
          const count = drinks.reduce((sum, item) => sum + item.count, 0);
          const total = drinks.reduce((sum, item) => sum + (item.price || 0) * item.count, 0);
          const unknown = drinks.some(item => item.price == null);
          return `<details class="person-order" ${people.size <= 3 ? "open" : ""}><summary><span class="person-index">${String(index + 1).padStart(2, "0")}</span><span class="person-heading"><strong>${escapeHtml(person.name)}</strong><small>${count} món${unknown ? " · Có món chưa có giá" : ""}</small></span><span class="person-subtotal">${money(total)}${unknown ? " *" : ""}</span><span class="person-chevron" aria-hidden="true">⌄</span></summary><div class="person-order-items"><div class="person-table-head" aria-hidden="true"><span>Món / ghi chú</span><span>SL</span><span>Thành tiền</span></div>${drinks.map(item => `<div class="person-order-line"><div class="person-drink"><strong>${escapeHtml(item.drink)}</strong>${item.size ? `<span class="person-size">Size ${escapeHtml(item.size)}</span>` : ""}${item.note ? `<p>${escapeHtml(item.note)}</p>` : ""}${item.count > 1 ? `<small>${money(item.price)} / món</small>` : ""}</div><span class="person-quantity">×${item.count}</span><span class="person-line-price">${money(item.price == null ? null : item.price * item.count)}</span></div>`).join("")}</div></details>`;
        }).join("")}</div>`
        : `<div class="empty-state"><div class="empty-icon">🧾</div><div class="empty-title">Đơn chưa có món</div></div>`;
      $("modal-total").innerHTML = `<div><span>Tổng tiền cả nhóm</span><small>${items.some(item => item.price == null) ? "* Chưa gồm các món chưa có giá" : `${people.size} người · ${items.length} món`}</small></div><strong>${money(items.reduce((sum, item) => sum + (item.price || 0), 0))}</strong>`;
      $("modal-content").scrollTop = 0;
      if (!$("summary-modal").open) $("summary-modal").showModal();
    }

    async function showHistorySummary(orderId) {
      try {
        const snapshot = await getDocs(collection(db, "orders", orderId, "entries"));
        const order = history.find((item) => item.id === orderId);
        const items = snapshot.docs.map((item) => item.data());
        showSummaryContent("Tổng hợp đơn đã lưu", readableDate(order?.closedAt || order?.createdAt), items);
      } catch (error) {
        handleError(error);
      }
    }

    async function loadCaptureRenderer() {
      if (!captureRendererPromise) {
        captureRendererPromise = import("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm")
          .then(module => module.default)
          .catch(error => { captureRendererPromise = null; throw error; });
      }
      return captureRendererPromise;
    }

    function createSummaryCapture() {
      // A separate, fully expanded copy keeps the on-screen form untouched.
      const host = document.createElement("div");
      host.className = "summary-dialog summary-capture";
      host.setAttribute("aria-hidden", "true");
      const form = $("summary-modal").querySelector(".modal").cloneNode(true);
      form.querySelectorAll("button").forEach(button => button.remove());
      form.querySelectorAll("details").forEach(details => { details.open = true; });
      // Avoid duplicate IDs and include every row without a scroll viewport.
      form.querySelectorAll("[id]").forEach(element => element.removeAttribute("id"));
      form.querySelectorAll("[tabindex]").forEach(element => element.removeAttribute("tabindex"));
      host.append(form);
      document.body.append(host);
      return host;
    }

    async function captureSummary() {
      if (summaryCapturing) return;
      if (!globalThis.navigator?.clipboard?.write || typeof ClipboardItem === "undefined") {
        return showToast("Trình duyệt chưa hỗ trợ copy ảnh. Hãy mở web bằng HTTPS trên Chrome, Edge hoặc Safari mới.", true);
      }
      summaryCapturing = true;
      const button = $("capture-summary");
      button.disabled = true;
      button.textContent = "Đang chụp…";
      let host;
      try {
        // Freeze the displayed data immediately, even if the library loads slowly.
        host = createSummaryCapture();
        const imagePromise = (async () => {
        const renderer = await loadCaptureRenderer();
        if (document.fonts?.ready) await document.fonts.ready;
        const width = Math.ceil(host.getBoundingClientRect().width);
        const height = Math.ceil(host.scrollHeight);
        // Fit long orders into one PNG without exceeding canvas dimensions/area.
        const scale = Math.min(2, 16000 / height, 16000 / width, Math.sqrt(24000000 / (width * height)));
        const canvas = await renderer(host, {
          backgroundColor: "#fffefa", width, height, scale,
          windowWidth: 1100, windowHeight: height,
          scrollX: 0, scrollY: 0, logging: false
        });
        const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("Không tạo được ảnh. Hãy thử chụp lại.");
        return blob;
        })();
        // Request clipboard access within the click, before rendering finishes.
        // Promise-backed PNG data preserves user activation on Safari too.
        imagePromise.catch(() => {});
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": imagePromise })]);
        } finally {
          // Do not remove the export copy while the renderer still uses it.
          await imagePromise.catch(() => {});
        }
        showToast("Đã copy ảnh toàn bộ form. Nhấn Ctrl+V hoặc Dán để gửi ảnh.");
      } catch (error) {
        console.error(error);
        showToast(error.name === "NotAllowedError"
          ? "Trình duyệt chưa cho phép copy ảnh. Cho phép truy cập clipboard rồi bấm Chụp hình lại."
          : "Không copy được ảnh. Kiểm tra kết nối mạng rồi thử lại.", true);
      } finally {
        host?.remove();
        summaryCapturing = false;
        button.disabled = false;
        button.textContent = "▣ Chụp hình";
      }
    }

    async function submitOrder() {
      const name = displayName();
      const itemId = chosenItemId;
      const note = $("order-note")?.value.trim() || "";
      if (!name) return showToast("Bạn hãy nhập tên trước nhé.", true);
      if (!itemId) return showToast("Chọn một món trong menu để đặt nhé.", true);
      const orderId = appState?.activeOrderId;
      if (!orderId) return showToast("Đợt đặt vừa đóng. Hãy tải lại menu.", true);
      try {
        const entryRef = doc(collection(db, "orders", orderId, "entries"));
        await runTransaction(db, async (transaction) => {
          const [stateSnapshot, orderSnapshot] = await Promise.all([
            transaction.get(stateRef),
            transaction.get(doc(db, "orders", orderId))
          ]);
          if (!stateSnapshot.exists() || stateSnapshot.data().activeOrderId !== orderId ||
              !orderSnapshot.exists() || !orderSnapshot.data().open) {
            throw new Error("Đợt đặt đã kết thúc. Vui lòng kiểm tra đơn hiện tại.");
          }
          const item = normalizeMenu(orderSnapshot.data().menu).find(item => item.id === itemId);
          if (!item) {
            throw new Error("Món này không còn trong menu. Vui lòng chọn lại.");
          }
          transaction.set(entryRef, { uid: currentUser.uid, name, drink: item.name, size: item.size || "", price: item.price, note, createdAt: serverTimestamp() });
        });
        showToast("Đã thêm món vào đơn!");
      } catch (error) {
        handleError(error);
      }
    }

    async function claimAdmin() {
      const name = displayName();
      if (!name) return showToast("Nhập tên của bạn trước khi nhận quyền admin nhé.", true);
      try {
        await runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(stateRef);
          if (!snapshot.exists()) throw new Error("Đang khởi tạo dữ liệu. Thử lại sau giây lát.");
          if (snapshot.data().adminUid) throw new Error("Đã có admin. Bạn có thể gửi yêu cầu chuyển quyền.");
          transaction.update(stateRef, { adminUid: currentUser.uid, adminName: name });
        });
        showToast("Bạn đã trở thành admin.");
      } catch (error) { handleError(error); }
    }

    async function requestAdmin() {
      const name = displayName();
      if (!name) return showToast("Nhập tên của bạn để gửi yêu cầu nhé.", true);
      try {
        await setDoc(doc(db, "adminRequests", currentUser.uid), {
          uid: currentUser.uid, name, status: "pending", createdAt: serverTimestamp()
        });
        showToast("Đã gửi yêu cầu chuyển quyền admin.");
      } catch (error) { handleError(error); }
    }

    async function cancelAdminRequest() {
      try {
        await runTransaction(db, async (transaction) => {
          const ref = doc(db, "adminRequests", currentUser.uid);
          const snapshot = await transaction.get(ref);
          if (snapshot.exists() && snapshot.data().status === "pending") transaction.delete(ref);
        });
        showToast("Đã hủy yêu cầu.");
      } catch (error) { handleError(error); }
    }

    async function openOrder() {
      const shop = selectedShop();
      if (!shop) return showToast("Hãy chọn quán.", true);
      try {
        const orderRef = doc(ordersRef);
        await runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(stateRef);
          if (!snapshot.exists() || snapshot.data().adminUid !== currentUser.uid) throw new Error("Bạn không còn là admin.");
          if (snapshot.data().activeOrderId) throw new Error("Đã có một đợt đặt đang mở.");
          transaction.set(orderRef, {
            ownerUid: currentUser.uid, ownerName: snapshot.data().adminName || displayName(),
            shopId: shop.id, shopName: shop.name, menu: (snapshot.data().shops || []).find(item => item.id === shop.id)?.menu || [], open: true, createdAt: serverTimestamp(), closedAt: null
          });
          transaction.update(stateRef, { activeOrderId: orderRef.id });
        });

        showToast("Đã mở đợt đặt. Mọi người có thể chọn món!");
      } catch (error) {
        if (error.code === "permission-denied") {
          showToast("Chưa có quyền mở đợt đặt. Bổ sung nội dung firestore-round-rules.txt vào Rules hiện tại rồi Publish trên Firebase.", true);
        } else handleError(error);
      }
    }

    async function updateShops(change) {
      await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(stateRef);
        if (!snapshot.exists() || snapshot.data().adminUid !== currentUser.uid) throw new Error("Bạn không còn là admin.");
        const data = snapshot.data();
        const orderRef = data.activeOrderId ? doc(db, "orders", data.activeOrderId) : null;
        const order = orderRef ? await transaction.get(orderRef) : null;
        const updated = change(data.shops || []);
        transaction.update(stateRef, { shops: updated });
        if (order?.exists() && order.data().open) {
          const shop = updated.find(item => item.id === order.data().shopId);
          if (shop) transaction.update(orderRef, { menu: shop.menu });
        }
      });
    }
    async function addShop() {
      const name = await askDialog({ title: "Thêm quán mới", message: "Lưu quán yêu thích và tạo menu riêng cho những lần đặt sau.", input: true, confirmText: "Thêm quán" });
      if (!name) return;
      if (name.length > 100) return showToast("Tên quán tối đa 100 ký tự.", true);
      const id = doc(ordersRef).id;
      try {
        await updateShops(items => {
          if (items.some(item => item.name.toLocaleLowerCase("vi") === name.toLocaleLowerCase("vi"))) throw new Error("Quán này đã có trong danh sách.");
          return [...items, { id, name, menu: [] }];
        });
        if (!appState.activeOrderId) selectedShopId = id;
        renderAdmin();
        showToast("Đã thêm quán.");
      } catch (error) { handleError(error); }
    }
    async function addMenuItem(event) {
      event.preventDefault();
      const shopId = editorShopId;
      const name = $("item-name").value.trim();
      const rawPrice = $("item-price").value;
      const price = Number(rawPrice);
      const size = $("item-size").value.trim();
      const category = $("item-category").value.trim() || "Món khác";
      if (!name || !rawPrice || !Number.isSafeInteger(price) || price < 0 || price > 100000000) return showToast("Nhập tên món và giá hợp lệ.", true);
      const item = { id: doc(ordersRef).id, name, price, size, category };
      try {
        await updateShops(items => items.map(shop => {
          if (shop.id !== shopId) return shop;
          if (shop.menu.length >= 100) throw new Error("Mỗi quán tối đa 100 món.");
          return { ...shop, menu: [...shop.menu, item] };
        }));
        if (editorShopId === shopId) {
          for (const id of ["item-name", "item-price", "item-size"]) if ($(id)) $(id).value = "";
        }
        showToast("Đã thêm món vào menu quán.");
      } catch (error) { handleError(error); }
    }

    async function closeOrder() {
      if (!await askDialog({ title: "Chốt đơn, cùng uống thôi!", message: "Sau khi chốt, đợt đặt sẽ ngừng nhận món mới và đơn được lưu vào lịch sử.", confirmText: "Chốt đơn" })) return;
      const orderId = appState?.activeOrderId;
      if (!orderId) return;
      try {
        await runTransaction(db, async (transaction) => {
          const stateSnapshot = await transaction.get(stateRef);
          const orderRef = doc(db, "orders", orderId);
          const orderSnapshot = await transaction.get(orderRef);
          if (!stateSnapshot.exists() || stateSnapshot.data().adminUid !== currentUser.uid ||
              stateSnapshot.data().activeOrderId !== orderId ||
              !orderSnapshot.exists() || !orderSnapshot.data().open) throw new Error("Đợt đặt đã thay đổi. Hãy tải lại.");
          transaction.update(orderRef, { open: false, closedAt: serverTimestamp() });
          transaction.update(stateRef, { activeOrderId: null });
        });
        showToast("Đã chốt đơn và lưu vào lịch sử.");
      } catch (error) { handleError(error); }
    }

    async function clearCurrentOrder() {
      if (!await askDialog({ title: "Xóa đơn hiện tại?", message: "Toàn bộ món mọi người đã đặt trong đợt này sẽ bị xóa. Bạn không thể hoàn tác thao tác này.", danger: true, confirmText: "Xóa toàn bộ món" })) return;
      const orderId = appState?.activeOrderId;
      if (!orderId) return;
      try {
        const stateSnapshot = await getDoc(stateRef);
        const orderSnapshot = await getDoc(doc(db, "orders", orderId));
        if (!stateSnapshot.exists() || stateSnapshot.data().adminUid !== currentUser.uid ||
            stateSnapshot.data().activeOrderId !== orderId || !orderSnapshot.exists() || !orderSnapshot.data().open) {
          throw new Error("Bạn không còn quyền xóa đơn hiện tại.");
        }
        const snapshot = await getDocs(collection(db, "orders", orderId, "entries"));
        if (snapshot.empty) return showToast("Đơn hiện tại chưa có món nào để xóa.");
        const docs = snapshot.docs;
        for (let start = 0; start < docs.length; start += 450) {
          const batch = writeBatch(db);
          docs.slice(start, start + 450).forEach((item) => batch.delete(item.ref));
          await batch.commit();
        }
        showToast(`Đã xóa ${docs.length} món khỏi đơn hiện tại.`);
      } catch (error) { handleError(error); }
    }

    async function approveRequest(uid) {
      if (!await askDialog({ title: "Chuyển người điều phối?", message: "Người được chọn sẽ tiếp quản menu và các đợt đặt. Bạn sẽ trở về vai trò người đặt món.", confirmText: "Chuyển quyền" })) return;
      try {
        await runTransaction(db, async (transaction) => {
          const requestRef = doc(db, "adminRequests", uid);
          const [stateSnapshot, requestSnapshot] = await Promise.all([
            transaction.get(stateRef), transaction.get(requestRef)
          ]);
          if (!stateSnapshot.exists() || stateSnapshot.data().adminUid !== currentUser.uid ||
              stateSnapshot.data().activeOrderId) throw new Error("Đóng đợt đặt trước khi chuyển quyền.");
          if (!requestSnapshot.exists() || requestSnapshot.data().status !== "pending") throw new Error("Yêu cầu không còn hiệu lực.");
          transaction.update(stateRef, { adminUid: uid, adminName: requestSnapshot.data().name });
          transaction.update(requestRef, { status: "approved" });
        });
        showToast("Đã chuyển quyền admin.");
      } catch (error) { handleError(error); }
    }

    async function rejectRequest(uid) {
      try {
        const requestRef = doc(db, "adminRequests", uid);
        await runTransaction(db, async (transaction) => {
          const stateSnapshot = await transaction.get(stateRef);
          const requestSnapshot = await transaction.get(requestRef);
          if (!stateSnapshot.exists() || stateSnapshot.data().adminUid !== currentUser.uid ||
              !requestSnapshot.exists() || requestSnapshot.data().status !== "pending") throw new Error("Yêu cầu không còn hiệu lực.");
          transaction.update(requestRef, { status: "rejected" });
        });
        showToast("Đã từ chối yêu cầu.");
      } catch (error) { handleError(error); }
    }

    async function releaseAdmin() {
      if (!await askDialog({ title: "Nhường quyền admin?", message: "Sau khi bạn nhường quyền, một thành viên khác có thể nhận quyền điều phối đợt đặt.", confirmText: "Nhường quyền" })) return;
      try {
        await runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(stateRef);
          if (!snapshot.exists() || snapshot.data().adminUid !== currentUser.uid) throw new Error("Bạn không còn là admin.");
          if (snapshot.data().activeOrderId) throw new Error("Hãy kết thúc đợt đặt đang mở trước.");
          transaction.update(stateRef, { adminUid: null, adminName: null });
        });
        showToast("Đã nhường quyền admin.");
      } catch (error) { handleError(error); }
    }

    $("close-order").addEventListener("click", closeOrder);
    $("open-order-dialog").addEventListener("click", () => {
      $("order-name").value = displayName();
      $("order-dialog").showModal();
    });
    $("order-name").addEventListener("input", event => { $("name-input").value = event.target.value; });
    document.querySelectorAll("[data-close-dialog]").forEach(button => button.addEventListener("click", () => $(button.dataset.closeDialog).close()));
    for (const id of ["order-dialog", "menu-dialog"]) {
      $(id).addEventListener("click", event => {
        if (event.target !== $(id)) return;
        const rect = $(id).getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $(id).close();
      });
    }
    $("summary-button").addEventListener("click", () => {
      showSummaryContent("Tổng hợp đơn hiện tại", `${entries.length} món · ${readableDate(activeOrder?.createdAt)}`, entries);
    });
    $("capture-summary").addEventListener("click", captureSummary);
    $("expand-summary").addEventListener("click", () => $("modal-content").querySelectorAll("details").forEach(details => { details.open = true; }));
    $("collapse-summary").addEventListener("click", () => $("modal-content").querySelectorAll("details").forEach(details => { details.open = false; }));
    $("close-modal").addEventListener("click", () => $("summary-modal").close());
    $("summary-modal").addEventListener("click", (event) => {
      if (event.target === $("summary-modal")) {
        const rect = $("summary-modal").getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $("summary-modal").close();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && $("summary-modal").open) $("summary-modal").close();
    });

    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        if (!signInStarted) {
          signInStarted = true;
          signInAnonymously(auth).catch((error) => {
            showError(`${errorMessage(error)} Hãy bật Anonymous trong Authentication > Sign-in method.`);
            $("connection-label").textContent = "Chưa kết nối";
            handleError(error);
          });
        }
        return;
      }
      currentUser = user;
      $("connection-label").textContent = "Đang đồng bộ";
      try {
        await ensureState();
        startAppListeners();
      } catch (error) {
        $("connection-label").textContent = "Lỗi cấu hình";
        showError(`${errorMessage(error)} Bật Anonymous sign-in, tạo Firestore Database và dán Firestore Rules vào Firebase Console.`);
        handleError(error);
      }
    });
