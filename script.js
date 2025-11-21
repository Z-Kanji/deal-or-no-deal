/* script.js
   - APNG plays once (exact duration = 1s + 2 frames at FRAME_RATE)
   - animation, closed and open images are same size (CASE_WIDTH x CASE_HEIGHT)
   - dealer_call plays only when wolfie overlay appears
   - minimum 4000ms delay from click -> wolfie overlay
   - winning SFX (for final keep/switch reveal) is cued at animation start
   - dealer offers restricted and second dealer call offers the middle prize
*/

// ---------- CONFIG: sizes & timing ----------
const CASE_WIDTH = 150;   // px — must match CSS --case-width
const CASE_HEIGHT = 120;  // px — must match CSS --case-height

const FRAME_RATE = 24; // adjust if your APNG frames use different FPS
// Animation = 1 second + 2 frames
const ANIM_DURATION_MS = 1000 + Math.round(2 * (1000 / FRAME_RATE)); // 1s + 2 frames at FRAME_RATE

// Minimum delay from case clicked to dealer overlay appearing (ms)
const MIN_DEALER_DELAY_MS = 4000;

// Dealer overlay additional read delay (if you want extra beyond MIN_DEALER_DELAY_MS)
const DEALER_EXTRA_DELAY_MS = 0; // set >0 if you want more delay

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

// Allowed dealer offers (first callers and general)
const DEALER_ALLOWED = ["t-shirt","signed poster","luigi","women","womens"];

// ---------- STATE ----------
let casePrizes = [];
let playerCaseIndex = null;
let originalPlayerIndex = null;
let phase = 0;
let picksNeeded = 0;
let revealedSet = new Set();
let overlayVisible = false;
let bgStarted = false;
let dealerCallCount = 0; // counts how many times dealer offered

// track click timestamp for enforcing MIN_DEALER_DELAY_MS
let lastRevealClickStart = 0;

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
function shuffle(a){ const arr=a.slice(); for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

// ---------- UI BUILD ----------
function buildUI(){
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
      // record click time for MIN_DEALER_DELAY_MS enforcement
      lastRevealClickStart = Date.now();
      await onCaseClicked(i);
    });

    boardEl.appendChild(wrap);
  }

  // player-case initial
  playerCaseImgEl.style.backgroundImage = `url(${assets.closedCaseImg})`;
  playerCaseNumberEl.textContent = '?';
}

// update pointer interactivity
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

// ---------- GAME INIT ----------
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

  document.querySelectorAll('.case-wrap').forEach((wrap)=>{
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
  winText.classList.add('hidden');
  titleEl.textContent = 'Choose your personal case';

  updateBoardInteractivity();
}

// ---------- BACKGROUND SFX ----------
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

    overlayVisible = true;
    updateBoardInteractivity();

    // Reveal: play APNG once, switch to open image.
    // For final reveals that should cue winning SFX, caller will pass a flag.
    await revealCaseWithAnimation(index);

    picksNeeded--;
    overlayVisible = false;

    if (picksNeeded > 0){
      titleEl.textContent = `Pick ${picksNeeded} more case(s)`;
      updateBoardInteractivity();
    } else {
      // AFTER the reveal finished we must ensure a **minimum 4s delay from initial click**
      // lastRevealClickStart was set when the user clicked the case.
      const elapsed = Date.now() - lastRevealClickStart;
      const remaining = MIN_DEALER_DELAY_MS - elapsed;
      if (remaining > 0) await sleep(remaining + DEALER_EXTRA_DELAY_MS);

      if (phase === 1 || phase === 2){
        // increment dealer call count and show dealer offer (dealerCallCount used in computeDealerOffer)
        dealerCallCount++;
        showDealerOffer();
      } else if (phase === 3){
        phase = 4;
        showKeepSwitchUI();
      }
    }
  }
}

// ---------- REVEAL: APNG plays once then open image ----------
async function revealCaseWithAnimation(index, options = { cueWin: false }){
  if (revealedSet.has(index)) return;
  revealedSet.add(index);

  const wrap = document.querySelector(`.case-wrap[data-index='${index}']`);
  const img = wrap.querySelector('.case-img');
  const num = wrap.querySelector('.case-number');

  // hide board number
  if (num) num.style.display = 'none';

  // position APNG overlay exactly over the case
  const rect = img.getBoundingClientRect();
  caseAnimImg.style.width = `${CASE_WIDTH}px`;
  caseAnimImg.style.height = `${CASE_HEIGHT}px`;
  caseAnimImg.style.left = `${rect.left + window.scrollX}px`;
  caseAnimImg.style.top  = `${rect.top + window.scrollY}px`;

  // cache-bust to force play from first frame (then clear src)
  caseAnimImg.src = assets.animImg + '?_=' + Date.now();
  caseAnimImg.classList.remove('hidden');

  // If this reveal should cue a win SFX (final keep/switch reveal), play it now
  if (options.cueWin){
    // determine prize and play appropriate sfx immediately as animation starts
    const prize = casePrizes[index];
    playWinSfxForPrize(prize);
  }

  // Wait exactly the animation duration (1s + 2 frames at FRAME_RATE)
  await sleep(ANIM_DURATION_MS);

  // hide APNG overlay and clear src so it will not loop or replay
  caseAnimImg.classList.add('hidden');
  caseAnimImg.src = '';

  // swap to open briefcase image (same size)
  img.style.backgroundImage = `url(${assets.openCaseImg})`;
  wrap.classList.add('case-open');
  img.style.pointerEvents = 'none';

  // add & center prize label inside the white box
  let prizeLabel = wrap.querySelector('.prize-label');
  if (!prizeLabel){
    prizeLabel = document.createElement('div');
    prizeLabel.className = 'prize-label';
    wrap.appendChild(prizeLabel);
  }
  prizeLabel.textContent = casePrizes[index];

  // grey out prize on sidebar
  const pIdx = prizeListOrdered.findIndex(p => casePrizes[index] === p);
  if (pIdx >= 0){ const li=document.getElementById('prize-'+pIdx); if (li) li.classList.add('greyed'); }

  // DO NOT play dealerCall here — dealerCall audio plays only when dealer overlay is shown
}

// ---------- DEALER OFFER LOGIC ----------
function computeDealerOffer(){
  // Gather remaining prizes (excluding player's case and already revealed)
  const remaining = [];
  for (let i=0;i<8;i++){
    if (i === playerCaseIndex) continue;
    if (revealedSet.has(i)) continue;
    remaining.push({p: casePrizes[i], idx: prizeListOrdered.indexOf(casePrizes[i])});
  }
  // sort by prize index (lowest to highest)
  remaining.sort((a,b)=>a.idx - b.idx);
  if (remaining.length === 0) return "No Offer";

  // Helper: filter allowed (case-insensitive)
  const allowedRemaining = remaining.filter(r => {
    const key = r.p.toLowerCase();
    return DEALER_ALLOWED.some(a => key.includes(a.toLowerCase()));
  });

  // If this is the second dealer call, offer the middle prize among remaining
  if (dealerCallCount === 2){
    const midIndex = Math.floor((remaining.length - 1) / 2); // e.g. if 3 items -> 1 (middle)
    return remaining[midIndex].p;
  }

  // On other dealer calls, pick a random allowedRemaining if available
  if (allowedRemaining.length > 0){
    const pick = allowedRemaining[Math.floor(Math.random() * allowedRemaining.length)];
    return pick.p;
  }

  // Fallback: pick any remaining prize that is not ".01"
  const nonPenny = remaining.find(r => r.p !== ".01");
  if (nonPenny) return nonPenny.p;

  // As last fallback, allow any remaining prize
  return remaining[0].p;
}

function showDealerOffer(){
  overlayVisible = true;
  updateBoardInteractivity();

  const offer = computeDealerOffer();
  offerText.textContent = 'OFFER: ' + offer;

  // Play dealer SFX only when dealer overlay appears
  dealerAudio.currentTime = 0;
  dealerAudio.play().catch(()=>{});

  dealerOverlay.classList.remove('hidden');
  dealerButtons.classList.remove('hidden');

  // Block board clicks
  document.querySelectorAll('.case-wrap').forEach(w => w.style.pointerEvents = 'none');

  dealBtn.onclick = async () => {
    dealerAudio.pause();
    dealerOverlay.classList.add('hidden');
    overlayVisible = false;
    updateBoardInteractivity();
    // Reveal player's case (if not revealed) and show result
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
    // when revealing player's case here, cue the win SFX at animation start
    await revealCaseWithAnimation(playerCaseIndex, { cueWin: true });
  }
  // set player's displayed image to open
  playerCaseImgEl.style.backgroundImage = `url(${assets.openCaseImg})`;
  winText.classList.remove('hidden');
  winText.textContent = 'DEAL ACCEPTED: ' + offer;
  document.querySelectorAll('.case-wrap').forEach(w=> w.style.pointerEvents = 'none');
  // SFX already played at animation start via cueWin
}

// show keep/switch UI
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
    // reveal other (non-final) case normally (no win cue)
    await revealCaseWithAnimation(otherIndex);
    await sleep(ANIM_DURATION_MS + 200);
  }

  // reveal final player's case and cue win SFX when animation starts
  if (!revealedSet.has(finalPlayerIndex)){
    await revealCaseWithAnimation(finalPlayerIndex, { cueWin: true });
    await sleep(ANIM_DURATION_MS);
  }

  const finalPrize = casePrizes[finalPlayerIndex];
  winText.classList.remove('hidden');
  winText.textContent = 'YOU WIN: ' + finalPrize;
  // ensure all board clicks disabled now
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
