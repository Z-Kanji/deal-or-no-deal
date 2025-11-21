/* script.js — GitHub Pages–friendly asset paths
   Version: Fixed to load images, videos, and audio from repo root.
*/

// ---------- CONFIG ----------

// Replace with your GitHub username and repo name if using GitHub Pages
const GITHUB_USERNAME = 'username'; // <-- put your username here
const REPO_NAME = 'repo-name';      // <-- put your repository name here

// Auto-detect if running on GitHub Pages
const isGitHubPages = window.location.hostname === `${GITHUB_USERNAME}.github.io`;
const repoPath = isGitHubPages ? `/${REPO_NAME}/` : './';

// Asset paths
const assets = {
  closedCaseImg: repoPath + 'closed_briefcase.png',
  animVideo: repoPath + 'case_animation.mov',
  openCaseImg: repoPath + 'open_briefcase.png',
  wolfieImg: repoPath + 'wolfie_dealer.png',
  bgMusic: repoPath + 'theme_song.mp3',
  dealerCall: repoPath + 'dealer_call.mp3',
  biggestPrizeSfx: repoPath + 'biggest_prize.mp3',
  mediumPrizeSfx: repoPath + 'medium_prize.mp3',
  smallPrizeSfx: repoPath + 'small_prize.mp3'
};

// ---------- GAME CONFIG ----------
const prizeListOrdered = [
  ".01",
  "Sticker",
  "T-shirt",
  "Signed poster",
  "Luigi's gift card",
  "Women's basketball tickets",
  "JBL Go 4",
  "Ninja Creami"
];

const allowedOfferPrizes = [
  "T-shirt",
  "Signed poster",
  "Luigi",
  "Women's",
  "Womens"
];

const revealDelay = 700; // ms for final reveal pause

// ---------- STATE ----------
let casePrizes = [];
let playerCaseIndex = null;
let originalPlayerIndex = null;
let phase = 0;
let picksNeeded = 0;
let revealedSet = new Set();
let overlayVisible = false;
let bgStarted = false;

// ---------- AUDIO ----------
const bgAudio = new Audio(assets.bgMusic);
bgAudio.loop = true;
bgAudio.volume = 0.5;

const dealerAudio = new Audio(assets.dealerCall);
dealerAudio.volume = 0.95;

const biggestAudio = new Audio(assets.biggestPrizeSfx);
const mediumAudio = new Audio(assets.mediumPrizeSfx);
const smallAudio = new Audio(assets.smallPrizeSfx);

// ---------- DOM ----------
const prizeLeftEl = document.getElementById('prizeLeft');
const prizeRightEl = document.getElementById('prizeRight');
const boardEl = document.getElementById('board');
const playerCaseEl = document.getElementById('playerCase');
const titleEl = document.getElementById('title');
const dealerOverlay = document.getElementById('dealerOverlay');
const wolfieImgEl = document.getElementById('wolfieImg');
const offerText = document.getElementById('offerText');
const dealerButtons = document.getElementById('dealerButtons');
const dealBtn = document.getElementById('dealBtn');
const noDealBtn = document.getElementById('noDealBtn');
const keepSwitchArea = document.getElementById('keepSwitchArea');
const keepBtn = document.getElementById('keepBtn');
const switchBtn = document.getElementById('switchBtn');
const winText = document.getElementById('winText');
const resetBtn = document.getElementById('resetBtn');
const caseAnimVideo = document.getElementById('caseAnim');

// Set wolfie image
wolfieImgEl.src = assets.wolfieImg;

// ---------- UTIL ----------
function shuffle(a) {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---------- UI BUILD ----------
function buildUI() {
  prizeLeftEl.innerHTML = '';
  prizeRightEl.innerHTML = '';
  prizeListOrdered.slice(0, 4).forEach((p, i) => {
    const li = document.createElement('li');
    li.id = 'prize-' + i;
    li.textContent = p;
    prizeLeftEl.appendChild(li);
  });
  prizeListOrdered.slice(4).forEach((p, i) => {
    const li = document.createElement('li');
    li.id = 'prize-' + (i + 4);
    li.textContent = p;
    prizeRightEl.appendChild(li);
  });

  boardEl.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const wrap = document.createElement('div');
    wrap.className = 'case-wrap';
    wrap.dataset.index = i;

    const img = document.createElement('div');
    img.className = 'case-img';
    img.style.backgroundImage = `url(${assets.closedCaseImg})`;
    img.dataset.index = i;

    const num = document.createElement('div');
    num.className = 'case-number';
    num.textContent = (i + 1);

    wrap.appendChild(img);
    wrap.appendChild(num);
    wrap.addEventListener('click', () => onCaseClicked(i));
    boardEl.appendChild(wrap);
  }
}

// ---------- GAME LOGIC ----------
function initGame() {
  casePrizes = shuffle(prizeListOrdered);
  playerCaseIndex = null;
  originalPlayerIndex = null;
  phase = 0;
  picksNeeded = 0;
  revealedSet.clear();
  overlayVisible = false;
  bgStarted = false;

  document.querySelectorAll('.case-wrap').forEach((wrap, i) => {
    wrap.classList.remove('case-open', 'case-grey');
    const img = wrap.querySelector('.case-img');
    img.style.backgroundImage = `url(${assets.closedCaseImg})`;
    img.style.pointerEvents = 'auto';
    const num = wrap.querySelector('.case-number'); 
    num.style.display = 'block';
    const pl = wrap.querySelector('.prize-label'); 
    if (pl) pl.remove();
  });

  prizeListOrdered.forEach((_, i) => {
    const li = document.getElementById('prize-' + i);
    if (li) li.classList.remove('greyed');
  });

  playerCaseEl.textContent = '?';
  offerText.textContent = 'OFFER: --';
  keepSwitchArea.classList.add('hidden');
  dealerOverlay.classList.add('hidden');
  winText.classList.add('hidden');
  titleEl.textContent = 'Choose your personal case';
}

// Autoplay background on first user interaction
function ensureBackgroundStarted() {
  if (bgStarted) return;
  bgStarted = true;
  bgAudio.currentTime = 0;
  bgAudio.play().catch(() => {});
}

// ----- USER CLICK HANDLER -----
function onCaseClicked(index) {
  if (overlayVisible) return;
  ensureBackgroundStarted();

  const wrap = document.querySelector(`.case-wrap[data-index='${index}']`);
  if (!wrap) return;
  if (revealedSet.has(index)) return;

  if (phase === 0) {
    playerCaseIndex = index;
    originalPlayerIndex = index;
    playerCaseEl.textContent = index + 1;
    wrap.classList.add('case-grey');
    phase = 1; picksNeeded = 3;
    titleEl.textContent = `Phase 1 — Pick ${picksNeeded} case(s) to open`;
    return;
  }

  if (phase >= 1 && phase <= 3) {
    if (index === playerCaseIndex) return;
    revealCaseWithAnimation(index);
    picksNeeded--;
    if (picksNeeded > 0) {
      titleEl.textContent = `Pick ${picksNeeded} more case(s)`;
    } else {
      if (phase === 1 || phase === 2) showDealerOffer();
      else if (phase === 3) { phase = 4; showKeepSwitchUI(); }
    }
  }
}

// ---------- CASE REVEAL ----------
async function revealCaseWithAnimation(index) {
  if (revealedSet.has(index)) return;
  revealedSet.add(index);

  const wrap = document.querySelector(`.case-wrap[data-index='${index}']`);
  const img = wrap.querySelector('.case-img');
  const num = wrap.querySelector('.case-number');

  num.style.display = 'none';

  // Play video overlay
  caseAnimVideo.src = assets.animVideo;
  caseAnimVideo.style.width = `${img.clientWidth}px`;
  caseAnimVideo.style.height = `${img.clientHeight}px`;
  const rect = img.getBoundingClientRect();
  caseAnimVideo.style.left = `${rect.left + window.scrollX}px`;
  caseAnimVideo.style.top = `${rect.top + window.scrollY}px`;
  caseAnimVideo.classList.remove('hidden');
  caseAnimVideo.style.zIndex = 1500;
  try { await caseAnimVideo.play(); } catch (e) {}

  await new Promise(resolve => {
    let done = false;
    const onEnded = () => { if(!done){ done=true; caseAnimVideo.removeEventListener('ended', onEnded); resolve(); } };
    caseAnimVideo.addEventListener('ended', onEnded);
    setTimeout(()=>{ if(!done){ done=true; caseAnimVideo.removeEventListener('ended', onEnded); resolve(); } }, 4000);
  });

  caseAnimVideo.pause();
  caseAnimVideo.currentTime = 0;
  caseAnimVideo.classList.add('hidden');

  // Show opened case and prize label
  img.style.backgroundImage = `url(${assets.openCaseImg})`;
  wrap.classList.add('case-open');
  img.style.pointerEvents = 'none';

  let prizeLabel = wrap.querySelector('.prize-label');
  if (!prizeLabel) {
    prizeLabel = document.createElement('div');
    prizeLabel.className = 'prize-label';
    wrap.appendChild(prizeLabel);
  }
  prizeLabel.textContent = casePrizes[index];

  // grey sidebar
  const pIdx = prizeListOrdered.findIndex(p => casePrizes[index] === p);
  if (pIdx >= 0) { 
    const li = document.getElementById('prize-' + pIdx); 
    if (li) li.classList.add('greyed'); 
  }
}

// ---------- DEALER LOGIC ----------
function computeDealerOffer() {
  const remaining = [];
  for (let i=0; i<8; i++) {
    if (i === playerCaseIndex) continue;
    if (revealedSet.has(i)) continue;
    remaining.push(casePrizes[i]);
  }
  const remainingWithIdx = remaining.map(p=>({p, idx: prizeListOrdered.indexOf(p)})).sort((a,b)=>a.idx-b.idx);
  if (!remainingWithIdx.length) return "No Offer";

  const highestIdx = Math.max(...remainingWithIdx.map(r=>r.idx));

  let candidates = remainingWithIdx.filter(r => {
    const key = r.p.toLowerCase();
    return allowedOfferPrizes.some(a => key.includes(a.toLowerCase())) && r.idx !== highestIdx;
  });

  if (!candidates.length) candidates = remainingWithIdx.filter(r => r.idx !== highestIdx);
  if (!candidates.length) candidates = remainingWithIdx;

  return candidates[Math.floor(Math.random()*candidates.length)].p;
}

function showDealerOffer() {
  overlayVisible = true;
  dealerAudio.currentTime = 0;
  dealerAudio.play().catch(() => {});

  const offer = computeDealerOffer();
  offerText.textContent = 'OFFER: ' + offer;

  dealerOverlay.classList.remove('hidden');
  dealerButtons.classList.remove('hidden');
  document.querySelectorAll('.case-wrap').forEach(w => w.style.pointerEvents = 'none');

  dealBtn.onclick = () => {
    dealerAudio.pause();
    dealerOverlay.classList.add('hidden');
    overlayVisible = false;
    revealPlayerCaseForDeal(offer);
  };
  noDealBtn.onclick = () => {
    dealerAudio.pause();
    dealerOverlay.classList.add('hidden');
    overlayVisible = false;
    if (phase === 1){ phase = 2; picksNeeded = 2; titleEl.textContent = `Phase 2 — Pick ${picksNeeded} case(s) to open`; }
    else if (phase === 2){ phase = 3; picksNeeded = 1; titleEl.textContent = `Phase 3 — Pick ${picksNeeded} case(s) to open`; }
    document.querySelectorAll('.case-wrap').forEach((w,i)=>{ if(!revealedSet.has(i) && i !== playerCaseIndex) w.style.pointerEvents = 'auto'; });
  };
}

function revealPlayerCaseForDeal(offer){
  if (!revealedSet.has(playerCaseIndex)) revealCaseWithAnimation(playerCaseIndex);
  winText.classList.remove('hidden');
  winText.textContent = 'DEAL ACCEPTED: ' + offer;
  document.querySelectorAll('.case-wrap').forEach(w=> w.style.pointerEvents = 'none');
  playWinSfxForPrize(offer);
}

// ---------- KEEP/SWITCH ----------
function showKeepSwitchUI() {
  keepSwitchArea.classList.remove('hidden');
  document.querySelectorAll('.case-wrap').forEach(w => w.style.pointerEvents = 'none');

  keepBtn.onclick = async () => { keepSwitchArea.classList.add('hidden'); await finalRevealSequence(false); };
  switchBtn.onclick = async () => { keepSwitchArea.classList.add('hidden'); await finalRevealSequence(true); };
}

async function finalRevealSequence(switched){
  const remainingUnopened = [...Array(8).keys()].filter(i => i !== originalPlayerIndex && !revealedSet.has(i));
  const remainingIndex = remainingUnopened.length ? remainingUnopened[0] : null;

  let finalPlayerIndex = originalPlayerIndex;
  if (switched && remainingIndex !== null){
    finalPlayerIndex = remainingIndex;
    playerCaseEl.textContent = finalPlayerIndex + 1;
    const origWrap = document.querySelector(`.case-wrap[data-index='${originalPlayerIndex}']`);
    if (origWrap) origWrap.classList.add('case-grey');
  } else playerCaseEl.textContent = originalPlayerIndex + 1;

  const otherIndex = (originalPlayerIndex === finalPlayerIndex) ? remainingIndex : originalPlayerIndex;
  if (otherIndex !== null && !revealedSet.has(otherIndex)) { await revealCaseWithAnimation(otherIndex); await sleep(revealDelay + 200); }
  if (!revealedSet.has(finalPlayerIndex)) { await revealCaseWithAnimation(finalPlayerIndex); await sleep(revealDelay); }

  const finalPrize = casePrizes[finalPlayerIndex];
  winText.classList.remove('hidden');
  winText.textContent = 'YOU WIN: ' + finalPrize;
  playWinSfxForPrize(finalPrize);
  document.querySelectorAll('.case-wrap').forEach(w=> w.style.pointerEvents = 'none');
}

// ---------- SFX ----------
function playWinSfxForPrize(prize){
  const p = (prize || '').toLowerCase();
  if (p.includes('jbl') || p.includes('ninja')) { biggestAudio.currentTime = 0; biggestAudio.play().catch(()=>{}); return; }
  if (p.includes("women") || p.includes("luigi") || p.includes("signed poster") || p.includes("signed")) { mediumAudio.currentTime = 0; mediumAudio.play().catch(()=>{}); return; }
  if (p.includes('.01') || p.includes('sticker') || p.includes('t-shirt') || p.includes('tshirt')) { smallAudio.currentTime = 0; smallAudio.play().catch(()=>{}); return; }
  smallAudio.currentTime = 0; smallAudio.play().catch(()=>{});
}

// ---------- RESET ----------
resetBtn.addEventListener('click', () => initGame());

// ---------- INIT ----------
buildUI();
initGame();
