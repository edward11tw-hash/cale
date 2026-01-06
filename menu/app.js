const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let currentQuery = "";
let currentCategory = "all";

const menuSections = $("#menuSections");
const resultTitle = $("#resultTitle");
const resultCount = $("#resultCount");

// ✅ 改成從 menu.json 載入
let MENU = [];
let _menuHash = ""; // 用來避免每次都重繪（可選）

function stableStringify(obj){
  // 簡單 hash 用：讓相同內容不重 render（避免閃動）
  try { return JSON.stringify(obj); } catch { return ""; }
}

async function loadMenu(){
  // ✅ cache bust + no-store：避免 CDN / 瀏覽器快取
  const url = `/.netlify/functions/menu?ts=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  if(!res.ok) throw new Error("menu.json 讀取失敗");

  const data = await res.json();
  if(!Array.isArray(data)) throw new Error("menu.json 格式錯誤：必須是陣列 []");

  const nextHash = stableStringify(data);
  if(nextHash && nextHash === _menuHash) return false; // 沒變，不用重繪

  MENU = data;
  _menuHash = nextHash;
  return true;
}

function formatPrice(n){
  return `NT$ ${n}`;
}

function categoryName(key){
  if (key === "egg") return "雞蛋糕";
  if (key === "waffle") return "鬆餅";
  return "全部";
}

function isDiscount(item){
  return typeof item.originalPrice === "number" && item.originalPrice > item.price;
}

function badgeRank(type){
  // 越小越前面
  if(type === "hot") return 1;        // 🔥 熱銷
  if(type === "boss") return 2;       // ⭐ 老闆推薦
  if(type === "limited") return 3;    // ⏰ 限量
  return 9;
}

function sortItems(a, b){
  // 1) 特價優先
  const da = isDiscount(a) ? 1 : 0;
  const db = isDiscount(b) ? 1 : 0;
  if(db !== da) return db - da;

  // 2) 角標優先（熱銷/推薦/限量）
  const ra = badgeRank(a.badgeType);
  const rb = badgeRank(b.badgeType);
  if(ra !== rb) return ra - rb;

  // 3) 價格低的先（可自行改成高的先）
  if(a.price !== b.price) return a.price - b.price;

  // 4) 名稱
  return (a.name || "").localeCompare((b.name || ""), "zh-Hant");
}

// 折疊狀態
let expandedEgg = false;
let expandedWaffle = false;

function render(){
  const q = currentQuery.trim().toLowerCase();

const filtered = MENU.filter(item => {
  const enabledOK = item.enabled !== false; // ✅ 下架：enabled:false 就不顯示
  const catOK = currentCategory === "all" || item.category === currentCategory;
  const hay = ((item.name || "") + " " + (item.desc || "") + " " + ((item.tags||[]).join(" "))).toLowerCase();
  const qOK = !q || hay.includes(q);
  return enabledOK && catOK && qOK;
});
  // 分組 + 排序
  const eggAll = filtered.filter(x => x.category === "egg").sort(sortItems);
  const waffleAll = filtered.filter(x => x.category === "waffle").sort(sortItems);

  // 標題
  resultTitle.textContent =
    (currentCategory === "all" ? "全部品項" : `${categoryName(currentCategory)}品項`) +
    (currentQuery ? `（搜尋：${currentQuery}）` : "");
  resultCount.textContent = `${filtered.length} items`;

  const renderCards = (items) => `
    <div class="grid">
      ${items.map(item => `
        <article class="card" data-id="${item.id}">
          ${item.badgeType ? `
            <div class="corner-badge ${item.badgeType}">
              ${item.badgeType === "hot" ? "🔥 熱銷" :
                item.badgeType === "boss" ? "⭐ 老闆推薦" :
                item.badgeType === "limited" ? "⏰ 限量" : ""}
            </div>
          ` : ""}

          <div class="card-top">
            <div class="emoji" aria-hidden="true">${item.emoji || ""}</div>
            <div class="title">
              <div class="name">
                ${item.name || ""}
                ${item.serves ? `<span class="serves">份量：${item.serves}</span>` : ""}
              </div>
              <div class="meta">
                ${categoryName(item.category)}
                ${isDiscount(item) ? ` · <span class="sale-pill">特價中</span>` : ""}
              </div>
            </div>
          </div>

          <div class="tags">
            ${(item.tags || []).slice(0, 3).map(t => `<span class="tag">${t}</span>`).join("")}
          </div>

          <div class="card-bottom">
            <div>
              <div class="price-row">
                <span class="price">${formatPrice(item.price)}</span>
                ${isDiscount(item) ? `<span class="old-price">${formatPrice(item.originalPrice)}</span>` : ""}
              </div>
              <div class="small">點擊查看詳細</div>
            </div>
            <button class="primary" type="button" data-open="${item.id}">查看</button>
          </div>
        </article>
      `).join("")}
    </div>
  `;

  function splitFeatured(items){
    const featured = items
      .filter(x => isDiscount(x) || !!x.badgeType)
      .slice()
      .sort(sortItems)
      .slice(0, 3);

    const featuredSet = new Set(featured);
    const rest = items.filter(x => !featuredSet.has(x));
    return { featured, rest, total: items.length };
  }

  const showEgg = currentCategory === "all" || currentCategory === "egg";
  const showWaffle = currentCategory === "all" || currentCategory === "waffle";

  const eggSplit = splitFeatured(eggAll);
  const waffleSplit = splitFeatured(waffleAll);

  const eggExpanded = expandedEgg;
  const waffleExpanded = expandedWaffle;

  const sectionBlock = (key, title, split, expanded) => {
    const sectionId = key === "egg" ? "section-egg" : "section-waffle";
    const moreCount = Math.max(0, split.total - split.featured.length);

    if(split.total === 0){
      return `
        <section class="section-block" id="${sectionId}">
          <div class="section-title">
            <h3>${title}</h3>
            <div class="section-sub">0 種</div>
          </div>
          <div class="muted">沒有符合的${title}</div>
        </section>
      `;
    }

    const moreHTML = `
      <div class="${expanded ? "" : "hidden"}" data-more="${key}">
        ${split.rest.length ? renderCards(split.rest) : ""}
      </div>
    `;

    return `
      <section class="section-block" id="${sectionId}">
        <div class="section-title">
          <h3>${title}</h3>
          <div class="section-sub">${split.total} 種</div>
        </div>

        ${split.featured.length ? `
          <div class="subhead">
            <div class="subhead-title">精選（熱銷 / 推薦 / 特價）</div>
            <div class="subhead-note">先看主打，其他口味可展開</div>
          </div>
          ${renderCards(split.featured)}
        ` : ""}

        ${moreCount > 0 ? `
          <div class="section-title">
            <div class="section-title-right">
              <div class="section-sub">${split.total} 種</div>
              <button class="ghost section-toggle" type="button" data-toggle="${key}">
                ${expanded ? "－ 收合口味" : `＋ 顯示全部口味（共 ${split.total} 種）`}
              </button>
            </div>
          </div>
          ${moreHTML}
        ` : ""}
      </section>
    `;
  };

  menuSections.innerHTML = `
    <div id="top"></div>
    ${showEgg ? sectionBlock("egg", "雞蛋糕", eggSplit, eggExpanded) : ""}
    ${showWaffle ? sectionBlock("waffle", "鬆餅", waffleSplit, waffleExpanded) : ""}
  `;

  // bind open
  $$("[data-open]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = e.currentTarget.getAttribute("data-open");
      openModal(id);
    });
  });

  // bind toggle
  $$(".section-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.toggle;
      if(key === "egg") expandedEgg = !expandedEgg;
      if(key === "waffle") expandedWaffle = !expandedWaffle;
      render();

      requestAnimationFrame(() => {
        const anchor = document.getElementById(key === "egg" ? "section-egg" : "section-waffle");
        if(anchor) anchor.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  });
}

/* Modal */
const backdrop = $("#modalBackdrop");
const closeModalBtn = $("#closeModal");
const closeModalBtn2 = $("#closeModal2");
const copyTextBtn = $("#copyText");

function setSegActive(group, value){
  $$(`.seg-btn[data-group="${group}"]`).forEach(b => {
    b.classList.toggle("active", b.dataset.value === value);
  });
}

function openModal(id){
  const item = MENU.find(x => x.id === id);
  if(!item) return;

  const tags = Array.isArray(item.tags) ? item.tags : [];
  const badgesArr = Array.isArray(item.badges) ? item.badges : [];
  const addonsArr = Array.isArray(item.addons) ? item.addons : [];

  $("#modalTitle").textContent = item.name || "";
  $("#modalSub").textContent =
    `${categoryName(item.category)}${tags.length ? ` · ${tags.join(" · ")}` : ""}${item.serves ? ` · 份量：${item.serves}` : ""}`;

  if(isDiscount(item)){
    $("#modalPrice").innerHTML =
      `<span class="modal-now">${formatPrice(item.price)}</span>
       <span class="modal-old">${formatPrice(item.originalPrice)}</span>
       <span class="sale-pill">特價中</span>`;
  }else{
    $("#modalPrice").textContent = formatPrice(item.price);
  }

  $("#modalDesc").textContent = item.desc || "";
  $("#modalEmoji").textContent = item.emoji || "";

  const badges = $("#modalBadges");
  badges.innerHTML = badgesArr.map(b => `<span class="badge">${b}</span>`).join("");

  const addons = $("#modalAddons");
  addons.innerHTML = addonsArr.map((a) => `
    <label class="chk">
      <input type="checkbox" data-addon="${a}" />
      <span>${a}</span>
    </label>
  `).join("");

  $("#modalTip").textContent = `小建議：${item.tip || "—"}`;

  setSegActive("sweet", "正常");
  setSegActive("temp", "熱熱吃");

  backdrop.classList.remove("hidden");
  document.body.classList.add("modal-open");
  document.body.style.overflow = "hidden";

  $$(`.seg-btn`).forEach(b => {
    b.onclick = () => setSegActive(b.dataset.group, b.dataset.value);
  });

  copyTextBtn.onclick = async () => {
    const selectedAddons = [...$$(`[data-addon]`)]
      .filter(x => x.checked)
      .map(x => x.dataset.addon);

    const sweet = ($$(`.seg-btn[data-group="sweet"].active`)[0]?.dataset.value) || "正常";
    const temp = ($$(`.seg-btn[data-group="temp"].active`)[0]?.dataset.value) || "熱熱吃";

    const text =
`${item.name || ""}
分類：${categoryName(item.category)}
價格：${formatPrice(item.price)}
份量：${item.serves || "—"}
描述：${item.desc || ""}
展示選項：甜度=${sweet}；口感/溫度=${temp}
加料（展示）：${selectedAddons.length ? selectedAddons.join("、") : "未選"}
提醒：此頁僅供瀏覽，無結帳功能`;

    try{
      await navigator.clipboard.writeText(text);
      copyTextBtn.textContent = "已複製 ✅";
      setTimeout(()=> copyTextBtn.textContent = "複製品項資訊", 1200);
    }catch{
      alert("瀏覽器不支援複製，請手動選取內容。");
    }
  };
}

function closeModal(){
  backdrop.classList.add("hidden");
  document.body.classList.remove("modal-open");
  document.body.style.overflow = "";
}

closeModalBtn.addEventListener("click", closeModal);
closeModalBtn2.addEventListener("click", closeModal);
backdrop.addEventListener("click", (e) => {
  if(e.target === backdrop) closeModal();
});
document.addEventListener("keydown", (e) => {
  if(e.key === "Escape" && !backdrop.classList.contains("hidden")) closeModal();
});

/* ✅ chips：吸頂 + 分類篩選 + 快速跳轉 */
$$(".chip").forEach(chip => {
  chip.addEventListener("click", () => {
    $$(".chip").forEach(c => {
      c.classList.remove("active");
      c.setAttribute("aria-selected", "false");
    });
    chip.classList.add("active");
    chip.setAttribute("aria-selected", "true");

    currentCategory = chip.dataset.category || "all";
    if (currentCategory === "egg") expandedEgg = true;
    if (currentCategory === "waffle") expandedWaffle = true;
    render();

    const targetId =
      currentCategory === "egg" ? "section-egg" :
      currentCategory === "waffle" ? "section-waffle" :
      "top";

    requestAnimationFrame(() => {
      const el = document.getElementById(targetId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
});

/* search */
$("#searchInput").addEventListener("input", (e) => {
  currentQuery = e.target.value;
  render();
});
$("#clearSearch").addEventListener("click", () => {
  $("#searchInput").value = "";
  currentQuery = "";
  render();
});

// ✅ 手機：避免背景滾動，但允許彈窗內容滾動
backdrop.addEventListener("touchmove", (e) => {
  const canScroll = e.target.closest(".modal-body");
  if (!canScroll) e.preventDefault();
}, { passive: false });

/* ✅ init：先載入 JSON 再 render，並且輪詢同步 */
(async () => {
  try{
    await loadMenu();
    render();
  }catch(e){
    console.error(e);
    // 讀不到 menu.json 也不要整頁掛掉
    resultTitle.textContent = "菜單載入失敗";
    resultCount.textContent = "0 items";
    menuSections.innerHTML = `<div class="muted">menu.json 讀取失敗，請確認檔案是否存在。</div>`;
    return;
  }

  // ✅ 客人端同步更新（15 秒一次，你可改 5000/10000/30000）
  setInterval(async () => {
    try{
      const changed = await loadMenu();
      if(changed){
        // 如果正在看彈窗，避免內容突變就先不關；你也可改成直接關掉
        render();
      }
    }catch(e){
      console.warn("menu.json 更新讀取失敗", e);
    }
  }, 15000);
})();
