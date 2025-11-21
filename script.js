/* script.js
   - APNG overlay is displayed at a scaled size (ANIM_SCALE) to match the case artwork.
   - Dealer delay shortened to 3 seconds (MIN_DEALER_DELAY_MS).
   - Animation duration computed as 1s + 2 frames (FRAME_RATE).
   - Dealer offers exclude highest; second dealer call offers middle prize.
   - Win SFX is cued at animation start for final reveal.
   - Win overlay (wolfie + open case + prize + YOU WIN) shows 2s after final reveal.
   - Background music stops when win overlay displayed.
*/

/* ---------- CONFIG: sizing & timing ---------- */
// CASE size must match CSS --case-width / --case-height
const CASE_WIDTH = 150;   // px
const CASE_HEIGHT = 120;  // px

// APNG scale factor: you said the APNG artwork is about 50% the size of cases,
// so we display it at 2x to line up visually.
const ANIM_SCALE = 1.25;

// APNG timing: 1 second + 2 frames (use FRAME_RATE corresponding to the original animation)
const FRAME_RATE = 24;
const ANIM_DURATION_MS = 1000 + Math.round(2 * (1000 / FRAME_RATE)); // ~1083 ms for 24fps

// Dealer minimum delay from click -> wolfie overlay (shortened from 4s to 3s)
const MIN_DEALER_DELAY_MS = 3000; // 3000ms = 3s

// Win overlay delay after final reveal
const WIN_OVERLAY_DELAY_MS = 2000; // 2s

/* ---------- ASSETS ---------- */
const assets = {
  closedCaseImg: 'closed_briefcase.png',
  animImg: 'case_animation.png', // APNG in repo root
  openCaseImg: 'open_briefcase.png',
  wolfieImg: 'wolfie_dealer.png',
  bgMusic: 'theme_song.mp3',
  dealerCall: 'dealer_call.mp3',
  biggestPrizeSfx: 'biggest_prize.mp3',
  mediumPrizeSfx: 'medium_prize.mp3',
  smallPrizeSfx: 'small_prize.mp3'
};

/* ---------- GAME DATA ---------- */
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
const DEALER_ALLOWED = ["t-shirt","signed poster","luigi","women","womens"];

/* ---------- STATE ---------- */
let casePrizes = [];
let playerCaseIndex = null;
let originalPlayerIndex = null;
let phase = 0;
let picksNeeded = 0;
let revealedSet = new Set();
let overlayVisible = false;
let bgStarted = false;
let dealerCallCount = 0;
let lastRevealClickStart = 0;

/* ---------- AUDIO ---------- */
const bgAudio = new Audio(assets.bgMusic);
bgAudio.loop = true;
bgAudio.volume = 0.5;

const dealerAudio = new Audio(assets.dealerCall);
dealerAudio.volume = 0.95;

const biggestAudio = new Audio(assets.biggestPrizeSfx);
const mediumAudio = new Audio(assets.mediumPrizeSfx);
const smallAudio = new Audio(assets.smallPrizeSfx);

/* ---------- DOM ---------- */
const prizeLeftEl = document.getElementById('prizeLeft');
const prizeRightEl = document.getElementById('prizeRight');
const boardEl = document.getElementById('board');
const playerCaseEl = document.getElementById('playerCase');
const playerCaseImgEl = playerCaseEl.querySelector('.case-img');
const playerCaseNumberEl = playerCaseEl.querySelector('.case-number');
const titleEl = document.getElementById('title');

const dealerOverlay = document.getElementById('dealerOverlay');
const wolfieImgEl = document.getElementById('wolfieImg');
const offerText = document.getElementById('offerText');
const dealerButtons = document.getElementById('dealerButtons');
const dealBtn = document.getElementById('dealBtn');
const noDealBtn = document.getElementById('noDealBtn');

const winOverlay = document.getElementById('winOverlay');
const winWolfie = document.getElementById('winWolfie');
const winCaseImg = document.querySelector('#winOverlay .win-case-img');
const winPrizeText = document.querySelector('#winOverlay .win-prize-text');
const winOkBtn = document.getElementById('winOkBtn');

const keepSwitchArea = document.getElementById('keepSwitchArea');
const keepBtn = document.getElementById('keepBtn');
const switchBtn = document.getElementById('switchBtn');

const winText = document.getElementById('winText');
const resetBtn = document.getElementById('resetBtn');

const caseAnimImg = document.getElementById('caseAnim');

wolfieImgEl.src = assets.wolfieImg;
winWolfie.src = assets.wolfieImg;

/* ---------- UTIL ---------- */
function shuffle(a){ const arr=a.slice(); for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

/* ---------- UI BUILD ---------- */
function buildUI(){
  // sync CSS variables with JS constants so CSS and JS sizes match
  document.documentElement.style.setProperty('--case-width', CASE_WIDTH + 'px');
  document.documentElement.style.setProperty('--case-height', CASE_HEIGHT + 'px');

  prizeLeftEl.innerHTML = '';
  prizeRightEl.innerHTML = '';
  prizeListOrdered.slice(0,4).forEach((p,i)=>{
    const li = document.createElement('li'); li.id = 'prize-' + i; li.textContent = p; prizeLeftEl.appendChild(li);
  });
  prizeListOrdered.slice(4).forEach((p,i)=>{
    const li = document.createElement('li'); li.id = 'prize-' + (i+4); li.textContent = p; prizeRightEl.appendChild(li);
  });

  boardEl.innerHTML = '';
  for(let i=0;i<8;i++){
    const wrap = document.createElement('div');
    wrap.className = 'case-wrap';
    wrap.dataset.index = i;

    const img = document.createElement('div');
    img.className = 'case-img';
    img.style.backgroundImage = `url(${assets.closedCaseImg})`;

    const num = document.createElement('div');
    num.className = 'case-number';
    num.textContent = (i+1);

    wrap.appendChild(img);
    wrap.appendChild(num);

    wrap.addEventListener('click', async () => {
      if (overlayVisible) return;
      if (revealedSet.has(i)) return;
      if (playerCaseIndex !== null && i === playerCaseIndex) return;
      lastRevealClickStart = Date.now();
      await onCaseClicked(i);
    });

    boardEl.appendChild(wrap);
  }

  playerCaseImgEl.style.backgroundImage = `url(${assets.closedCaseImg})`;
  playerCaseNumberEl.textContent = '?';
}

/* ---------- INTERACTIVITY ---------- */
function updateBoardInteractivity(){
  document.querySelectorAll('.case-wrap').forEach((wrap,i)=>{
    if (overlayVisible){ wrap.style.pointerEvents = 'none'; return; }
    if (revealedSet.has(i)){ wrap.style.pointerEvents = 'none'; return; }
    if (phase === 0){ wrap.style.pointerEvents = 'auto'; return; }
    if (playerCaseIndex !== null && i === playerCaseIndex){ wrap.style.pointerEvents = 'none'; return; }
    if ((phase >=1 && phase <=3) && !revealedSet.has(i)){ wrap.style.pointerEvents = 'auto'; return; }
    wrap.style.pointerEvents = 'none';
  });
}

/* ---------- GAME INIT ---------- */
function initGame(){
  casePrizes = shuffle(prizeListOrdered);
  playerCaseIndex = null;
  originalPlayerIndex = null;
  phase = 0;
  picksNeeded = 0;
  revealedSet.clear();
  overlayVisible = false;
  bgStarted = false;
  dealerCallCount = 0;
  lastRevealClickStart = 0;

  document.querySelectorAll('.case-wrap').forEach(wrap=>{
    wrap.classList.remove('case-open','case-grey');
    const img = wrap.querySelector('.case-img');
    img.style.backgroundImage = `url(${assets.closedCaseImg})`;
    img.style.pointerEvents = 'auto';
    const num = wrap.querySelector('.case-number'); if (num) num.style.display = 'block';
    const pl = wrap.querySelector('.prize-label'); if (pl) pl.remove();
  });

  prizeListOrdered.forEach((_,i)=>{ const li=document.getElementById('prize-'+i); if(li) li.classList.remove('greyed'); });

  playerCaseImgEl.style.backgroundImage = `url(${assets.closedCaseImg})`;
  playerCaseNumberEl.textContent = '?';

  offerText.textContent = 'OFFER: --';
  keepSwitchArea.classList.add('hidden');
  dealerOverlay.classList.add('hidden');
  winOverlay.classList.add('hidden');
  winText.classList.add('hidden');

  titleEl.textContent = 'Choose your personal case';
  updateBoardInteractivity();
}

/* ---------- BG AUDIO ---------- */
function ensureBackgroundStarted(){
  if (bgStarted) return;
  bgStarted = true;
  bgAudio.currentTime = 0;
  bgAudio.play().catch(()=>{});
}

/* ---------- click handler ---------- */
async function onCaseClicked(index){
  if (overlayVisible) return;
  ensureBackgroundStarted();

  const wrap = document.querySelector(`.case-wrap[data-index='${index}']`);
  if (!wrap) return;
  if (revealedSet.has(index)) return;

  if (phase === 0){
    playerCaseIndex = index;
    originalPlayerIndex = index;
    playerCaseNumberEl.textContent = index + 1;
    playerCaseImgEl.style.backgroundImage = `url(${assets.closedCaseImg})`;
    wrap.classList.add('case-grey');
    wrap.style.pointerEvents = 'none';
    phase = 1; picksNeeded = 3;
    titleEl.textContent = `Phase 1 — Pick ${picksNeeded} case(s) to open`;
    updateBoardInteractivity();
    return;
  }

  if (phase >=1 && phase <=3){
    if (index === playerCaseIndex) return;

    overlayVisible = true;
    updateBoardInteractivity();

    // Reveal APNG once, swap to open image
    await revealCaseWithAnimation(index, { cueWin: false });

    picksNeeded--;
    overlayVisible = false;

    if (picksNeeded > 0){
      titleEl.textContent = `Pick ${picksNeeded} more case(s)`;
      updateBoardInteractivity();
    } else {
      // Guarantee at least MIN_DEALER_DELAY_MS from click -> dealer overlay
      const elapsed = Date.now() - lastRevealClickStart;
      const remaining = MIN_DEALER_DELAY_MS - elapsed;
      if (remaining > 0) await sleep(remaining);

      if (phase === 1 || phase === 2){
        dealerCallCount++;
        showDealerOffer();
      } else if (phase === 3){
        phase = 4;
        showKeepSwitchUI();
      }
    }
  }
}

/* ---------- reveal: APNG plays once then open image ---------- */
async function revealCaseWithAnimation(index, options = { cueWin: false }){
  if (revealedSet.has(index)) return;
  revealedSet.add(index);

  const wrap = document.querySelector(`.case-wrap[data-index='${index}']`);
  const img = wrap.querySelector('.case-img');
  const num = wrap.querySelector('.case-number');

  if (num) num.style.display = 'none';

  // position overlay centered on case; scale overlay by ANIM_SCALE
  const rect = img.getBoundingClientRect();
  const overlayWidth = Math.round(CASE_WIDTH * ANIM_SCALE);
  const overlayHeight = Math.round(CASE_HEIGHT * ANIM_SCALE);
  const left = rect.left + window.scrollX + Math.round((rect.width - overlayWidth) / 2);
  const top = rect.top + window.scrollY + Math.round((rect.height - overlayHeight) / 2);

  caseAnimImg.style.width = overlayWidth + 'px';
  caseAnimImg.style.height = overlayHeight + 'px';
  caseAnimImg.style.left = left + 'px';
  caseAnimImg.style.top = top + 'px';
  caseAnimImg.style.objectFit = 'contain';

  // restart APNG by cache-busting the src and show it
  caseAnimImg.src = assets.animImg + '?_=' + Date.now();
  caseAnimImg.classList.remove('hidden');

  // If this reveal should cue win SFX, play now (so it happens during animation)
  if (options.cueWin){
    const prize = casePrizes[index];
    playWinSfxForPrize(prize);
  }

  // Wait exactly ANIM_DURATION_MS
  await sleep(ANIM_DURATION_MS);

  // hide APNG overlay and clear src so it won't loop/replay
  caseAnimImg.classList.add('hidden');
  caseAnimImg.src = '';

  // swap to open_briefcase.png (same size) and show prize label
  img.style.backgroundImage = `url(${assets.openCaseImg})`;
  wrap.classList.add('case-open');
  img.style.pointerEvents = 'none';

  // prize label centered
  let prizeLabel = wrap.querySelector('.prize-label');
  if (!prizeLabel){
    prizeLabel = document.createElement('div');
    prizeLabel.className = 'prize-label';
    wrap.appendChild(prizeLabel);
  }
  prizeLabel.textContent = casePrizes[index];

  // grey out sidebar
  const pIdx = prizeListOrdered.findIndex(p => casePrizes[index] === p);
  if (pIdx >= 0){ const li=document.getElementById('prize-'+pIdx); if (li) li.classList.add('greyed'); }
}

/* ---------- dealer offer calculation ---------- */
function computeDealerOffer(){
  // collect remaining prizes
  const remaining = [];
  for (let i=0;i<8;i++){
    if (i === playerCaseIndex) continue;
    if (revealedSet.has(i)) continue;
    remaining.push({p: casePrizes[i], idx: prizeListOrdered.indexOf(casePrizes[i])});
  }
  remaining.sort((a,b)=>a.idx - b.idx);
  if (remaining.length === 0) return "No Offer";

  // highest prize index (cannot be offered)
  const highestIdx = Math.max(...remaining.map(r=>r.idx));
  const nonHighest = remaining.filter(r => r.idx !== highestIdx);

  // second dealer call: offer the middle prize among remaining (non-highest if possible)
  if (dealerCallCount === 2){
    const arr = nonHighest.length ? nonHighest : remaining;
    const mid = Math.floor((arr.length - 1) / 2);
    return arr[mid].p;
  }

  // normal dealer calls: pick from allowed set excluding highest
  const allowedRemaining = nonHighest.filter(r => {
    const key = r.p.toLowerCase();
    return DEALER_ALLOWED.some(a => key.includes(a.toLowerCase()));
  });

  let candidates = allowedRemaining.length ? allowedRemaining : (nonHighest.length ? nonHighest : remaining);

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  return pick.p;
}

/* ---------- show dealer overlay ---------- */
function showDealerOffer(){
  overlayVisible = true;
  updateBoardInteractivity();

  const offer = computeDealerOffer();
  offerText.textContent = 'OFFER: ' + offer;

  // play dealerCall SFX only when overlay appears
  dealerAudio.currentTime = 0;
  dealerAudio.play().catch(()=>{});

  dealerOverlay.classList.remove('hidden');
  dealerButtons.classList.remove('hidden');

  document.querySelectorAll('.case-wrap').forEach(w => w.style.pointerEvents = 'none');

  dealBtn.onclick = async () => {
    dealerAudio.pause();
    dealerOverlay.classList.add('hidden');
    overlayVisible = false;
    updateBoardInteractivity();

    // reveal player's case (cue win SFX)
    await revealPlayerCaseForDeal(offer);

    // after final reveal, wait WIN_OVERLAY_DELAY_MS then show win overlay
    await sleep(WIN_OVERLAY_DELAY_MS);
    showWinOverlay(offer);
  };

  noDealBtn.onclick = () => {
    dealerAudio.pause();
    dealerOverlay.classList.add('hidden');
    overlayVisible = false;
    updateBoardInteractivity();
    if (phase === 1){ phase = 2; picksNeeded = 2; titleEl.textContent = `Phase 2 — Pick ${picksNeeded} case(s) to open`; }
    else if (phase === 2){ phase = 3; picksNeeded = 1; titleEl.textContent = `Phase 3 — Pick ${picksNeeded} case(s) to open`; }
  };
}

async function revealPlayerCaseForDeal(offer){
  if (!revealedSet.has(playerCaseIndex)){
    await revealCaseWithAnimation(playerCaseIndex, { cueWin: true });
  }
  playerCaseImgEl.style.backgroundImage = `url(${assets.openCaseImg})`;
  winText.classList.remove('hidden');
  winText.textContent = 'DEAL ACCEPTED: ' + offer;
  document.querySelectorAll('.case-wrap').forEach(w=> w.style.pointerEvents = 'none');
  // SFX already played at reveal start (cueWin)
}

/* ---------- win overlay ---------- */
function showWinOverlay(prize){
  // fade out and stop background music
  try {
    const fadeMs = 400;
    const steps = 8;
    const stepMs = Math.round(fadeMs / steps);
    let curStep = 0;
    const initialVol = bgAudio.volume;
    const fadeInterval = setInterval(()=>{
      curStep++;
      const v = Math.max(0, initialVol * (1 - curStep/steps));
      bgAudio.volume = v;
      if (curStep >= steps){
        clearInterval(fadeInterval);
        bgAudio.pause();
        bgAudio.currentTime = 0;
        bgAudio.volume = initialVol;
      }
    }, stepMs);
  } catch(e){
    try { bgAudio.pause(); bgAudio.currentTime = 0; } catch(_){}
  }

  winCaseImg.style.backgroundImage = `url(${assets.openCaseImg})`;
  winPrizeText.textContent = prize;
  winOverlay.classList.remove('hidden');

  // play an appropriate flourish SFX (this is separate from the cue played at animation start)
  const p = (''+prize).toLowerCase();
  if (p.includes('jbl') || p.includes('ninja')) { biggestAudio.currentTime = 0; biggestAudio.play().catch(()=>{}); }
  else if (p.includes('luigi') || p.includes('women') || p.includes('signed')) { mediumAudio.currentTime = 0; mediumAudio.play().catch(()=>{}); }
  else { smallAudio.currentTime = 0; smallAudio.play().catch(()=>{}); }

  overlayVisible = true;
  updateBoardInteractivity();
}

winOkBtn.onclick = () => {
  winOverlay.classList.add('hidden');
  overlayVisible = false;
  updateBoardInteractivity();
};

/* ---------- keep/switch flows ---------- */
function showKeepSwitchUI(){
  keepSwitchArea.classList.remove('hidden');
  document.querySelectorAll('.case-wrap').forEach(w => w.style.pointerEvents = 'none');

  keepBtn.onclick = async () => {
    keepSwitchArea.classList.add('hidden');
    await finalRevealSequence(false);
    await sleep(WIN_OVERLAY_DELAY_MS);
    const finalPrize = getFinalPrizeForDisplay();
    showWinOverlay(finalPrize);
  };
  switchBtn.onclick = async () => {
    keepSwitchArea.classList.add('hidden');
    await finalRevealSequence(true);
    await sleep(WIN_OVERLAY_DELAY_MS);
    const finalPrize = getFinalPrizeForDisplay();
    showWinOverlay(finalPrize);
  };
}

function getFinalPrizeForDisplay(){
  // best-effort: find prize of player's final index if available
  const idx = playerCaseIndex !== null ? playerCaseIndex : originalPlayerIndex;
  return casePrizes[idx];
}

/* ---------- final reveal ---------- */
async function finalRevealSequence(switched){
  const remainingUnopened = [...Array(8).keys()].filter(i => i !== originalPlayerIndex && !revealedSet.has(i));
  const remainingIndex = remainingUnopened.length ? remainingUnopened[0] : null;

  let finalPlayerIndex = originalPlayerIndex;
  if (switched && remainingIndex !== null){
    finalPlayerIndex = remainingIndex;
    playerCaseNumberEl.textContent = finalPlayerIndex + 1;
    playerCaseImgEl.style.backgroundImage = `url(${assets.closedCaseImg})`;
    const origWrap = document.querySelector(`.case-wrap[data-index='${originalPlayerIndex}']`);
    if (origWrap) origWrap.classList.add('case-grey');
  } else {
    playerCaseNumberEl.textContent = originalPlayerIndex + 1;
  }

  const otherIndex = (originalPlayerIndex === finalPlayerIndex) ? remainingIndex : originalPlayerIndex;

  if (otherIndex !== null && !revealedSet.has(otherIndex)){
    await revealCaseWithAnimation(otherIndex);
    await sleep(ANIM_DURATION_MS + 200);
  }

  if (!revealedSet.has(finalPlayerIndex)){
    await revealCaseWithAnimation(finalPlayerIndex, { cueWin: true });
    await sleep(ANIM_DURATION_MS);
  }

  const finalPrize = casePrizes[finalPlayerIndex];
  winText.classList.remove('hidden');
  winText.textContent = 'YOU WIN: ' + finalPrize;
  document.querySelectorAll('.case-wrap').forEach(w=> w.style.pointerEvents = 'none');
}

/* ---------- sfx mapping ---------- */
function playWinSfxForPrize(prize){
  const p = (prize || '').toLowerCase();
  if (p.includes('jbl') || p.includes('ninja')) { biggestAudio.currentTime = 0; biggestAudio.play().catch(()=>{}); return; }
  if (p.includes("women") || p.includes("luigi") || p.includes("signed poster") || p.includes("signed")) { mediumAudio.currentTime = 0; mediumAudio.play().catch(()=>{}); return; }
  if (p.includes('.01') || p.includes('sticker') || p.includes('t-shirt') || p.includes('tshirt')) { smallAudio.currentTime = 0; smallAudio.play().catch(()=>{}); return; }
  smallAudio.currentTime = 0; smallAudio.play().catch(()=>{});
}

/* ---------- reset & start ---------- */
resetBtn.addEventListener('click', () => initGame());

buildUI();
initGame();
