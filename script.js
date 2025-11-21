/* script.js — final: APNG plays once, then open image; dealer overlay delayed; unified sizes; centered prize text */

// ---------- ASSETS ----------
const assets = {
  closedCaseImg: 'closed_briefcase.png',
  animImg: 'case_animation.png', // APNG (root)
  openCaseImg: 'open_briefcase.png',
  wolfieImg: 'wolfie_dealer.png',
  bgMusic: 'theme_song.mp3',
  dealerCall: 'dealer_call.mp3',
  biggestPrizeSfx: 'biggest_prize.mp3',
  mediumPrizeSfx: 'medium_prize.mp3',
  smallPrizeSfx: 'small_prize.mp3'
};

// ---------- TIMING (tweak these as needed) ----------
const ANIM_DURATION_MS = 2500;   // how long the APNG animation takes (ms)
const DEALER_DELAY_MS   = 1200;  // delay after case open before showing dealer overlay & sound (ms)

// ---------- GAME DATA ----------
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

const allowedOfferPrizes = ["T-shirt","Signed poster","Luigi","Women's","Womens"];

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
const bgAudio = new Audio(assets.bgMusic); bgAudio.loop = true; bgAudio.volume = 0.5;
const dealerAudio = new Audio(assets.dealerCall); dealerAudio.volume = 0.95;
const biggestAudio = new Audio(assets.biggestPrizeSfx);
const mediumAudio = new Audio(assets.mediumPrizeSfx);
const smallAudio = new Audio(assets.smallPrizeSfx);

// ---------- DOM ----------
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
const keepSwitchArea = document.getElementById('keepSwitchArea');
const keepBtn = document.getElementById('keepBtn');
const switchBtn = document.getElementById('switchBtn');
const winText = document.getElementById('winText');
const resetBtn = document.getElementById('resetBtn');
const caseAnimImg = document.getElementById('caseAnim');

wolfieImgEl.src = assets.wolfieImg;

// ---------- UTIL ----------
function shuffle(arr){ const a = arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

// ---------- UI BUILD ----------
function buildUI(){
  // prizes sidebars
  prizeLeftEl.innerHTML = '';
  prizeRightEl.innerHTML = '';
  prizeListOrdered.slice(0,4).forEach((p,i)=>{
    const li = document.createElement('li'); li.id = 'prize-' + i; li.textContent = p; prizeLeftEl.appendChild(li);
  });
  prizeListOrdered.slice(4).forEach((p,i)=>{
    const li = document.createElement('li'); li.id = 'prize-' + (i+4); li.textContent = p; prizeRightEl.appendChild(li);
  });

  // board cases
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
    num.textContent = i+1;

    wrap.appendChild(img);
    wrap.appendChild(num);

    wrap.addEventListener('click', async () => {
      if (overlayVisible) return;
      if (revealedSet.has(i)) return;
      if (playerCaseIndex !== null && i === playerCaseIndex) return;
      await onCaseClicked(i);
    });

    boardEl.appendChild(wrap);
  }

  // player case initial
  playerCaseImgEl.style.backgroundImage = `url(${assets.closedCaseImg})`;
  playerCaseNumberEl.textContent = '?';
}

// ---------- INTERACTIVITY MANAGEMENT ----------
function updateBoardInteractivity(){
  document.querySelectorAll('.case-wrap').forEach((wrap, i) => {
    if (overlayVisible) { wrap.style.pointerEvents = 'none'; return; }
    if (revealedSet.has(i)) { wrap.style.pointerEvents = 'none'; return; }
    if (phase === 0) { wrap.style.pointerEvents = 'auto'; return; }
    if (playerCaseIndex !== null && i === playerCaseIndex) { wrap.style.pointerEvents = 'none'; return; }
    if ((phase >=1 && phase <=3) && !revealedSet.has(i)) { wrap.style.pointerEvents = 'auto'; return; }
    wrap.style.pointerEvents = 'none';
  });
}

// ---------- GAME INITIALIZE ----------
function initGame(){
  casePrizes = shuffle(prizeListOrdered);
  playerCaseIndex = null;
  originalPlayerIndex = null;
  phase = 0;
  picksNeeded = 0;
  revealedSet.clear();
  overlayVisible = false;
  bgStarted = false;

  document.querySelectorAll('.case-wrap').forEach(wrap=>{
    wrap.classList.remove('case-open','case-grey');
    const img = wrap.querySelector('.case-img');
    img.style.backgroundImage = `url(${assets.closedCaseImg})`;
    img.style.pointerEvents = 'auto';
    const num = wrap.querySelector('.case-number'); if (num) num.style.display = 'block';
    const pl = wrap.querySelector('.prize-label'); if (pl) pl.remove();
  });

  prizeListOrdered.forEach((_,i)=>{ const li=document.getElementById('prize-'+i); if(li) li.classList.remove('greyed'); });

  // player UI reset
  playerCaseImgEl.style.backgroundImage = `url(${assets.closedCaseImg})`;
  playerCaseNumberEl.textContent = '?';

  offerText.textContent = 'OFFER: --';
  keepSwitchArea.classList.add('hidden');
  dealerOverlay.classList.add('hidden');
  winText.classList.add('hidden');
  titleEl.textContent = 'Choose your personal case';

  updateBoardInteractivity();
}

// ---------- BACKGROUND AUDIO START ----------
function ensureBackgroundStarted(){
  if (bgStarted) return;
  bgStarted = true;
  bgAudio.currentTime = 0;
  bgAudio.play().catch(()=>{});
}

// ---------- CLICK HANDLER ----------
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

    // block while animation + reveal occur
    overlayVisible = true;
    updateBoardInteractivity();

    // play reveal (APNG once) and swap to open image
    await revealCaseWithAnimation(index);

    picksNeeded--;
    overlayVisible = false;
    if (picksNeeded > 0){
      titleEl.textContent = `Pick ${picksNeeded} more case(s)`;
      updateBoardInteractivity();
    } else {
      // let user read the prize text for a moment, then show dealer (if applicable)
      if (phase === 1 || phase === 2){
        // small delay so player reads the prize text
        await sleep(DEALER_DELAY_MS);
        showDealerOffer();
      } else if (phase === 3){
        phase = 4;
        showKeepSwitchUI();
      }
    }
  }
}

// ---------- REVEAL FLOW (APNG plays once, then open image) ----------
async function revealCaseWithAnimation(index){
  if (revealedSet.has(index)) return;
  revealedSet.add(index);

  const wrap = document.querySelector(`.case-wrap[data-index='${index}']`);
  const img = wrap.querySelector('.case-img');
  const num = wrap.querySelector('.case-number');

  // hide number on board (playerCase keeps its number)
  if (num) num.style.display = 'none';

  // position and show APNG overlay (cache-bust so it restarts once)
  const rect = img.getBoundingClientRect();
  caseAnimImg.style.width = `${img.clientWidth}px`;
  caseAnimImg.style.height = `${img.clientHeight}px`;
  caseAnimImg.style.left = `${rect.left + window.scrollX}px`;
  caseAnimImg.style.top  = `${rect.top + window.scrollY}px`;
  caseAnimImg.src = assets.animImg + '?_=' + Date.now();
  caseAnimImg.classList.remove('hidden');

  // wait exactly ANIM_DURATION_MS for APNG to finish
  await sleep(ANIM_DURATION_MS);

  // hide animation overlay and clear src so it won't loop/replay
  caseAnimImg.classList.add('hidden');
  caseAnimImg.src = '';

  // show open briefcase image
  img.style.backgroundImage = `url(${assets.openCaseImg})`;
  wrap.classList.add('case-open');
  img.style.pointerEvents = 'none';

  // prize label centered inside white box
  let prizeLabel = wrap.querySelector('.prize-label');
  if (!prizeLabel){
    prizeLabel = document.createElement('div');
    prizeLabel.className = 'prize-label';
    wrap.appendChild(prizeLabel);
  }
  prizeLabel.textContent = casePrizes[index];

  // grey out the prize in the sidebar
  const pIdx = prizeListOrdered.findIndex(p => casePrizes[index] === p);
  if (pIdx >= 0){ const li=document.getElementById('prize-'+pIdx); if (li) li.classList.add('greyed'); }

  // NOTE: dealer audio & overlay are no longer played here.
  // Dealer will appear after a small read delay (DEALER_DELAY_MS) when showDealerOffer is invoked.
}

// ---------- DEALER OFFER ----------
function computeDealerOffer(){
  const remaining = [];
  for (let i=0;i<8;i++){
    if (i === playerCaseIndex) continue;
    if (revealedSet.has(i)) continue;
    remaining.push(casePrizes[i]);
  }
  const remainingWithIdx = remaining.map(p=>({p, idx: prizeListOrdered.indexOf(p)})).sort((a,b)=>a.idx-b.idx);
  if (remainingWithIdx.length === 0) return "No Offer";

  const highestIdx = Math.max(...remainingWithIdx.map(r=>r.idx));

  let candidates = remainingWithIdx.filter(r => {
    const key = r.p.toLowerCase();
    const allowedMatch = allowedOfferPrizes.some(a => key.includes(a.toLowerCase()));
    return allowedMatch && r.idx !== highestIdx;
  });

  if (candidates.length === 0){
    candidates = remainingWithIdx.filter(r => r.idx !== highestIdx);
  }
  if (candidates.length === 0) candidates = remainingWithIdx;

  const pick = candidates[Math.floor(Math.random()*candidates.length)];
  return pick ? pick.p : remainingWithIdx[0].p;
}

function showDealerOffer(){
  overlayVisible = true;
  updateBoardInteractivity();

  const offer = computeDealerOffer();
  offerText.textContent = 'OFFER: ' + offer;

  // play dealer call SFX and then show overlay (we already waited a read delay before calling this)
  dealerAudio.currentTime = 0;
  dealerAudio.play().catch(()=>{});

  dealerOverlay.classList.remove('hidden');
  dealerButtons.classList.remove('hidden');

  // block board clicks
  document.querySelectorAll('.case-wrap').forEach(w => w.style.pointerEvents = 'none');

  dealBtn.onclick = async () => {
    dealerAudio.pause();
    dealerOverlay.classList.add('hidden');
    overlayVisible = false;
    updateBoardInteractivity();
    await revealPlayerCaseForDeal(offer);
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

// reveal player's case when deal accepted
async function revealPlayerCaseForDeal(offer){
  if (!revealedSet.has(playerCaseIndex)){
    // if player's board case hasn't been revealed, animate & reveal it
    await revealCaseWithAnimation(playerCaseIndex);
  }
  // show open briefcase in player area as well
  playerCaseImgEl.style.backgroundImage = `url(${assets.openCaseImg})`;
  winText.classList.remove('hidden');
  winText.textContent = 'DEAL ACCEPTED: ' + offer;
  document.querySelectorAll('.case-wrap').forEach(w=> w.style.pointerEvents = 'none');
  playWinSfxForPrize(offer);
}

// keep / switch UI
function showKeepSwitchUI(){
  keepSwitchArea.classList.remove('hidden');
  document.querySelectorAll('.case-wrap').forEach(w => w.style.pointerEvents = 'none');

  keepBtn.onclick = async () => {
    keepSwitchArea.classList.add('hidden');
    await finalRevealSequence(false);
  };
  switchBtn.onclick = async () => {
    keepSwitchArea.classList.add('hidden');
    await finalRevealSequence(true);
  };
}

// final reveal sequence (handles switch)
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
    await revealCaseWithAnimation(finalPlayerIndex);
    await sleep(ANIM_DURATION_MS);
  }

  const finalPrize = casePrizes[finalPlayerIndex];
  winText.classList.remove('hidden');
  winText.textContent = 'YOU WIN: ' + finalPrize;
  playWinSfxForPrize(finalPrize);
  document.querySelectorAll('.case-wrap').forEach(w=> w.style.pointerEvents = 'none');
}

// play final SFX based on prize
function playWinSfxForPrize(prize){
  const p = (prize || '').toLowerCase();
  if (p.includes('jbl') || p.includes('ninja')) { biggestAudio.currentTime = 0; biggestAudio.play().catch(()=>{}); return; }
  if (p.includes("women") || p.includes("luigi") || p.includes("signed poster") || p.includes("signed")) { mediumAudio.currentTime = 0; mediumAudio.play().catch(()=>{}); return; }
  if (p.includes('.01') || p.includes('sticker') || p.includes('t-shirt') || p.includes('tshirt')) { smallAudio.currentTime = 0; smallAudio.play().catch(()=>{}); return; }
  smallAudio.currentTime = 0; smallAudio.play().catch(()=>{});
}

// reset handler
resetBtn.addEventListener('click', () => initGame());

// build & start
buildUI();
initGame();
